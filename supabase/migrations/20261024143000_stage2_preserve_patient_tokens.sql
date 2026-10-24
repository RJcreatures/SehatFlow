-- Stage 2: keep patient-facing credentials usable after send-to-end / reassign.
-- Additive only. Do not apply remotely from this agent session.

create or replace function private.send_to_end(p_queue_entry_id uuid)
returns public.queue_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  now_ts timestamptz := private.simulated_now();
  entry public.queue_entries%rowtype;
  previous_status text;
begin
  actor := private.require_staff_roles(array['admin', 'queue_manager']);
  select * into entry from public.queue_entries where id = p_queue_entry_id for update;
  if not found then
    raise exception 'queue entry not found' using errcode = 'P0002';
  end if;

  perform private.lock_department(entry.department_id);

  if entry.status not in ('no_show', 'skipped') then
    raise exception 'only a skipped or no-show token can be sent to the end'
      using errcode = 'P0001';
  end if;

  previous_status := entry.status;

  -- Keep token_code / token_number so printed slips and typed My Turn still match.
  update public.queue_entries
  set status = 'waiting',
      queued_at = now_ts,
      called_at = null,
      completed_at = null,
      updated_at = now_ts
  where id = entry.id
  returning * into entry;

  perform private.write_queue_event(
    entry.id,
    'sent_to_end',
    previous_status,
    'waiting',
    actor,
    jsonb_build_object('token_code', entry.token_code)
  );

  return entry;
end;
$$;

create or replace function private.reassign_token(
  p_queue_entry_id uuid,
  p_target_department_id uuid
)
returns public.queue_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  now_ts timestamptz := private.simulated_now();
  today date := private.service_date();
  source public.queue_entries%rowtype;
  target_dept public.departments%rowtype;
  new_entry public.queue_entries%rowtype;
  new_number integer;
begin
  actor := private.require_staff_roles(array['admin', 'queue_manager']);

  select * into source from public.queue_entries where id = p_queue_entry_id for update;
  if not found then
    raise exception 'queue entry not found' using errcode = 'P0002';
  end if;

  if source.status not in ('waiting', 'called', 'no_show', 'skipped') then
    raise exception 'this token cannot be reassigned'
      using errcode = 'P0001';
  end if;

  if source.department_id = p_target_department_id then
    raise exception 'choose a different department'
      using errcode = 'P0001';
  end if;

  select * into target_dept
  from public.departments
  where id = p_target_department_id and active;
  if not found then
    raise exception 'target department not found'
      using errcode = 'P0002';
  end if;

  if source.department_id < p_target_department_id then
    perform private.lock_department(source.department_id);
    perform private.lock_department(p_target_department_id);
  else
    perform private.lock_department(p_target_department_id);
    perform private.lock_department(source.department_id);
  end if;

  perform private.ensure_doctor_status(p_target_department_id);
  new_number := private.next_token_number(p_target_department_id, today);

  update public.queue_entries
  set status = 'cancelled',
      updated_at = now_ts
  where id = source.id;

  perform private.write_queue_event(
    source.id,
    'cancelled',
    source.status,
    'cancelled',
    actor,
    jsonb_build_object(
      'token_code', source.token_code,
      'reason', 'reassigned'
    )
  );

  insert into public.queue_entries (
    patient_id,
    department_id,
    token_number,
    token_code,
    service_date,
    status,
    queued_at,
    created_at,
    updated_at,
    is_demo
  )
  values (
    source.patient_id,
    p_target_department_id,
    new_number,
    private.format_token(private.token_prefix(target_dept.code), new_number),
    today,
    'waiting',
    now_ts,
    now_ts,
    now_ts,
    source.is_demo
  )
  returning * into new_entry;

  -- Move vault credentials to the new entry so QR / access still verify.
  update private.queue_access_codes
  set queue_entry_id = new_entry.id
  where queue_entry_id = source.id;

  update private.queue_qr_tokens
  set queue_entry_id = new_entry.id
  where queue_entry_id = source.id;

  perform private.write_queue_event(
    new_entry.id,
    'reassigned',
    null,
    'waiting',
    actor,
    jsonb_build_object(
      'token_code', new_entry.token_code,
      'from_token', source.token_code
    )
  );

  return new_entry;
end;
$$;
