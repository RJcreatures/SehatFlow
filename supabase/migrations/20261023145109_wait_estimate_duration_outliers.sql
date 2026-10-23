-- Wait estimates: ignore unrealistic consultation durations.
--
-- Root cause: private.mean_duration_minutes averaged raw completed_at - called_at.
-- A single long sample (token left "called", or 10× demo clock stretching wall
-- time into a multi-hour simulated consultation) inflated every waiting estimate.
--
-- Strategy (must stay aligned with src/domain/queue.ts):
--   * Valid duration: inclusive [1, 60] minutes
--   * Use median of up to the 10 most recent valid completed samples
--   * Fall back to departments.estimated_minutes when no valid samples exist
-- Delay and break minutes are unchanged in private.estimate_wait_for_entry.

create or replace function private.mean_duration_minutes(p_department_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  median_value numeric;
  fallback integer;
begin
  select percentile_cont(0.5) within group (order by sample.duration_minutes)
  into median_value
  from (
    select
      extract(epoch from (entry.completed_at - entry.called_at)) / 60.0
        as duration_minutes
    from public.queue_entries as entry
    where entry.department_id = p_department_id
      and entry.status = 'completed'
      and entry.called_at is not null
      and entry.completed_at is not null
      and entry.completed_at > entry.called_at
      and extract(epoch from (entry.completed_at - entry.called_at)) / 60.0
        between 1 and 60
    order by entry.completed_at desc
    limit 10
  ) as sample;

  if median_value is not null then
    return median_value;
  end if;

  select estimated_minutes into fallback
  from public.departments
  where id = p_department_id;

  return coalesce(fallback, 10)::numeric;
end;
$$;

comment on function private.mean_duration_minutes(uuid) is
  'Median of up to 10 recent completed consultations with duration in [1, 60] minutes; else departments.estimated_minutes.';

revoke all on function private.mean_duration_minutes(uuid) from public, anon, authenticated;
