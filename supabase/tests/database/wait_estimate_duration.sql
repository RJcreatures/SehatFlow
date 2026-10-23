-- Wait-estimate duration outlier checks. Run with: npx supabase test db
-- Local only. Not a hosted verification. Rolls back all fixture rows.

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select ok(
  exists(
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'private'
      and pg_proc.proname = 'mean_duration_minutes'
  ),
  'private.mean_duration_minutes exists'
);

do $$
declare
  v_department uuid;
  v_patient uuid;
begin
  insert into public.departments (
    code,
    name_en,
    name_hi,
    room_en,
    room_hi,
    floor_en,
    floor_hi,
    estimated_minutes,
    display_order,
    active
  )
  values (
    'wait_estimate_test',
    'Wait Estimate Test',
    'प्रतीक्षा परीक्षण',
    'Room T',
    'कक्ष T',
    'Ground floor',
    'भूतल',
    10,
    99,
    false
  )
  returning id into v_department;

  insert into public.patients (display_name, age, gender, is_demo)
  values ('Wait Test Patient', 40, 'undisclosed', true)
  returning id into v_patient;

  -- No valid samples yet → fallback 10
  if private.mean_duration_minutes(v_department) <> 10 then
    raise exception 'expected fallback mean 10, got %',
      private.mean_duration_minutes(v_department);
  end if;

  insert into public.queue_entries (
    department_id,
    patient_id,
    service_date,
    token_number,
    token_code,
    status,
    queued_at,
    called_at,
    completed_at,
    is_demo
  )
  values
    (
      v_department,
      v_patient,
      current_date,
      1,
      'WT-001',
      'completed',
      now() - interval '4 hours',
      now() - interval '3 hours',
      now(),
      true
    ),
    (
      v_department,
      v_patient,
      current_date,
      2,
      'WT-002',
      'completed',
      now() - interval '40 minutes',
      now() - interval '30 minutes',
      now() - interval '18 minutes',
      true
    );

  if private.mean_duration_minutes(v_department) <> 12 then
    raise exception 'expected median 12 after filtering 180m outlier, got %',
      private.mean_duration_minutes(v_department);
  end if;

  insert into public.queue_entries (
    department_id,
    patient_id,
    service_date,
    token_number,
    token_code,
    status,
    queued_at,
    is_demo
  )
  values
    (v_department, v_patient, current_date, 3, 'WT-003', 'waiting', now(), true),
    (v_department, v_patient, current_date, 4, 'WT-004', 'waiting', now(), true),
    (v_department, v_patient, current_date, 5, 'WT-005', 'waiting', now(), true);

  if private.people_ahead(v_department, current_date, 5, 'waiting') <> 2 then
    raise exception 'expected 2 people ahead after completed peers are excluded';
  end if;

  if private.estimate_wait_for_entry(
    v_department,
    current_date,
    5,
    'waiting',
    now()
  ) <> 25 then
    raise exception 'expected wait 25 (2 ahead * 12), got %',
      private.estimate_wait_for_entry(
        v_department,
        current_date,
        5,
        'waiting',
        now()
      );
  end if;
end;
$$;

select pass('falls back when no valid historical samples');
select pass('ignores extreme historical duration and keeps a 12-minute sample');
select pass('completed peers are excluded from people_ahead; wait uses filtered mean');

select * from finish();

rollback;
