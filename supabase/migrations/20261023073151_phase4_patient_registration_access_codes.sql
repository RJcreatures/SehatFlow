
alter table public.queue_entries
  add column access_code_hash text;

alter table public.queue_entries
  add constraint queue_entries_access_code_hash_check
  check (
    access_code_hash is null
    or access_code_hash ~ '^[0-9a-f]{64}$'
  );

create or replace function public.register_demo_patient(
  p_display_name text,
  p_age integer,
  p_gender text,
  p_department_code text,
  p_access_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := private.simulated_now();
  v_today date;
  v_department public.departments%rowtype;
  v_patient_id uuid;
  v_token_number integer;
  v_token_code text;
  v_wait integer;
begin
  if p_display_name is null
     or char_length(btrim(p_display_name)) < 1
     or char_length(btrim(p_display_name)) > 80
     or p_age is null
     or p_age < 0
     or p_age > 120
     or (
       p_gender is not null
       and p_gender not in (
         'female', 'male', 'other', 'undisclosed'
       )
     )
     or p_department_code is null
     or p_department_code !~ '^[a-z0-9_]{2,32}$'
     or p_access_code_hash is null
     or p_access_code_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid registration input';
  end if;

  select *
    into v_department
  from public.departments
  where code = p_department_code
    and active = true;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'unknown or inactive department';
  end if;

  v_today := v_now::date;

  -- Serialize token allocation by department and service date.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_department.id::text || ':' || v_today::text,
      0
    )
  );

  select coalesce(max(q.token_number), 0) + 1
    into v_token_number
  from public.queue_entries q
  where q.department_id = v_department.id
    and q.service_date = v_today;

  if v_token_number > 9999 then
    raise exception using
      errcode = '22003',
      message = 'department queue is full';
  end if;

  v_token_code := private.format_token(
    private.token_prefix(v_department.code),
    v_token_number
  );

  insert into public.patients (
    display_name, age, gender, is_demo, created_at
  )
  values (
    btrim(p_display_name), p_age, p_gender, true, v_now
  )
  returning id into v_patient_id;

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
    is_demo,
    access_code_hash
  )
  values (
    v_patient_id,
    v_department.id,
    v_token_number,
    v_token_code,
    v_today,
    'waiting',
    v_now,
    v_now,
    v_now,
    true,
    p_access_code_hash
  );

  perform private.write_queue_event(
    (
      select q.id
      from public.queue_entries q
      where q.department_id = v_department.id
        and q.service_date = v_today
        and q.token_number = v_token_number
    ),
    'enqueued',
    null,
    'waiting',
    null,
    pg_catalog.jsonb_build_object(
      'token_code', v_token_code,
      'demo', true
    )
  );

  v_wait := private.estimate_wait_for_entry(
    v_department.id,
    v_today,
    v_token_number,
    'waiting',
    v_now
  );

  return pg_catalog.jsonb_build_object(
    'token_code', v_token_code,
    'department_code', v_department.code,
    'department_name_en', v_department.name_en,
    'department_name_hi', v_department.name_hi,
    'room_en', v_department.room_en,
    'room_hi', v_department.room_hi,
    'floor_en', v_department.floor_en,
    'floor_hi', v_department.floor_hi,
    'estimated_wait_minutes', v_wait,
    'service_date', v_today
  );
end;
$function$;

revoke all on function public.register_demo_patient(
  text, integer, text, text, text
) from public, anon, authenticated;

grant execute on function public.register_demo_patient(
  text, integer, text, text, text
) to service_role;

