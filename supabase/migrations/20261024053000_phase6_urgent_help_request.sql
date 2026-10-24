-- Phase 6: patient help-request RPC for urgent_flags.
-- Additive only. Does not change queue order or reset_demo seed data.

alter table public.urgent_flags
  add column if not exists request_key text;

alter table public.urgent_flags
  drop constraint if exists urgent_flags_request_key_check;

alter table public.urgent_flags
  add constraint urgent_flags_request_key_check
  check (
    request_key is null
    or request_key ~ '^[A-Za-z0-9_-]{8,64}$'
  );

comment on column public.urgent_flags.request_key is
  'Client idempotency key for patient help requests. Prevents duplicate open flags from repeated taps.';

create unique index if not exists urgent_flags_request_key_unique
  on public.urgent_flags (request_key)
  where request_key is not null;

create or replace function public.request_urgent_help(
  p_request_key text,
  p_department_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_key text := nullif(btrim(p_request_key), '');
  cleaned_code text := nullif(lower(btrim(coalesce(p_department_code, ''))), '');
  dept_id uuid;
  existing public.urgent_flags%rowtype;
  created public.urgent_flags%rowtype;
begin
  if cleaned_key is null or cleaned_key !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'invalid request key' using errcode = '22023';
  end if;

  if cleaned_code is not null then
    if cleaned_code !~ '^[a-z0-9_]{2,32}$' then
      raise exception 'invalid department' using errcode = '22023';
    end if;
    select id into dept_id
    from public.departments
    where code = cleaned_code
      and active = true;
    if dept_id is null then
      raise exception 'unknown department' using errcode = 'P0002';
    end if;
  end if;

  select * into existing
  from public.urgent_flags
  where request_key = cleaned_key
  for update;

  if found then
    return jsonb_build_object(
      'id', existing.id,
      'status', existing.status,
      'created_at', existing.created_at,
      'acknowledged_at', existing.acknowledged_at,
      'department_id', existing.department_id,
      'reused', true
    );
  end if;

  insert into public.urgent_flags (
    queue_entry_id,
    department_id,
    status,
    request_key,
    is_demo
  )
  values (
    null,
    dept_id,
    'open',
    cleaned_key,
    false
  )
  returning * into created;

  -- Help flags never call queue mutation helpers and never change token order.
  return jsonb_build_object(
    'id', created.id,
    'status', created.status,
    'created_at', created.created_at,
    'acknowledged_at', created.acknowledged_at,
    'department_id', created.department_id,
    'reused', false
  );
end;
$$;

comment on function public.request_urgent_help(text, text) is
  'Creates or reuses a patient help request flag. Does not store diagnoses or change the routine queue.';

revoke all on function public.request_urgent_help(text, text)
  from public, anon, authenticated;
grant execute on function public.request_urgent_help(text, text)
  to anon, authenticated;
