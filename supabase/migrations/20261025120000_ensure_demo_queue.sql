-- Idempotent public ensure for fictional demo queues.
-- Visitors can open the site and see a populated board without staff reset.
-- Reloads do not accumulate rows: only is_demo data is replaced, and only when thin.

create or replace function private.seed_fictional_demo(p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_ts timestamptz;
  today date;
  wall timestamptz := pg_catalog.now();
  dept record;
  created_patients integer := 0;
  created_entries integer := 0;
begin
  -- Delete only demo-marked data, in FK-safe order.
  delete from public.queue_events
  where queue_entry_id in (
    select id from public.queue_entries where is_demo
  )
  or (
    queue_entry_id is null
    and event_type in ('doctor_updated', 'urgent_acknowledged')
    and metadata ? 'demo'
  );

  delete from public.urgent_flags where is_demo;
  delete from public.queue_entries where is_demo;
  delete from public.patients where is_demo;

  update public.demo_clock
  set scale = 1,
      real_anchor = wall,
      sim_anchor = wall,
      updated_at = wall,
      updated_by = p_actor
  where id is true;

  now_ts := private.simulated_now();
  today := now_ts::date;

  for dept in
    select id from public.departments order by display_order
  loop
    perform private.ensure_doctor_status(dept.id);
    update public.doctor_status
    set availability = 'available',
        delay_minutes = 0,
        break_ends_at = null,
        updated_at = now_ts,
        updated_by = p_actor
    where department_id = dept.id;
  end loop;

  create temporary table if not exists demo_seed (
    seq integer primary key,
    display_name text not null,
    age integer not null,
    gender text,
    department_code text not null,
    token_number integer not null,
    status text not null,
    called_offset_minutes integer,
    completed_offset_minutes integer
  ) on commit drop;

  truncate demo_seed;

  insert into demo_seed (
    seq, display_name, age, gender, department_code, token_number, status,
    called_offset_minutes, completed_offset_minutes
  ) values
    (1,  'Demo Patient 01', 34, 'female', 'general_medicine', 1, 'completed', -40, -28),
    (2,  'Demo Patient 02', 52, 'male',   'general_medicine', 2, 'called',    -8, null),
    (3,  'Demo Patient 03', 27, 'other',  'general_medicine', 3, 'waiting',   null, null),
    (4,  'Demo Patient 04', 61, 'female', 'general_medicine', 4, 'waiting',   null, null),
    (5,  'Demo Patient 05', 8,  'male',   'pediatrics',       1, 'completed', -35, -22),
    (6,  'Demo Patient 06', 5,  'female', 'pediatrics',       2, 'waiting',   null, null),
    (7,  'Demo Patient 07', 11, 'undisclosed', 'pediatrics',  3, 'waiting',   null, null),
    (8,  'Demo Patient 08', 29, 'female', 'womens_health',    1, 'waiting',   null, null),
    (9,  'Demo Patient 09', 41, 'female', 'womens_health',    2, 'waiting',   null, null),
    (10, 'Demo Patient 10', 33, 'female', 'womens_health',    3, 'waiting',   null, null),
    (11, 'Demo Patient 11', 48, 'male',   'orthopedics',      1, 'called',    -6, null),
    (12, 'Demo Patient 12', 57, 'female', 'orthopedics',      2, 'waiting',   null, null),
    (13, 'Demo Patient 13', 39, 'male',   'orthopedics',      3, 'waiting',   null, null),
    (14, 'Demo Patient 14', 22, 'female', 'ent',              1, 'completed', -30, -18),
    (15, 'Demo Patient 15', 45, 'male',   'ent',              2, 'waiting',   null, null),
    (16, 'Demo Patient 16', 70, 'female', 'ophthalmology',    1, 'waiting',   null, null),
    (17, 'Demo Patient 17', 63, 'male',   'ophthalmology',    2, 'waiting',   null, null),
    (18, 'Demo Patient 18', 19, 'other',  'dermatology',      1, 'called',    -4, null),
    (19, 'Demo Patient 19', 36, 'female', 'dermatology',      2, 'waiting',   null, null),
    (20, 'Demo Patient 20', 44, 'male',   'dermatology',      3, 'waiting',   null, null);

  declare
    seed record;
    new_patient_id uuid;
    new_entry_id uuid;
    prefix text;
    token_label text;
    called_at timestamptz;
    completed_at timestamptz;
  begin
    for seed in
      select
        s.seq,
        s.display_name,
        s.age,
        s.gender,
        s.token_number,
        s.status,
        s.called_offset_minutes,
        s.completed_offset_minutes,
        d.id as department_id,
        d.code as department_code
      from demo_seed as s
      join public.departments as d on d.code = s.department_code
      order by s.seq
    loop
      prefix := private.token_prefix(seed.department_code);
      token_label := private.format_token(prefix, seed.token_number);

      insert into public.patients (display_name, age, gender, created_at, is_demo)
      values (seed.display_name, seed.age, seed.gender, now_ts, true)
      returning id into new_patient_id;

      created_patients := created_patients + 1;

      called_at := case
        when seed.called_offset_minutes is null then null
        else now_ts + make_interval(mins => seed.called_offset_minutes)
      end;
      completed_at := case
        when seed.completed_offset_minutes is null then null
        else now_ts + make_interval(mins => seed.completed_offset_minutes)
      end;

      insert into public.queue_entries (
        patient_id,
        department_id,
        token_number,
        token_code,
        service_date,
        status,
        queued_at,
        called_at,
        completed_at,
        created_at,
        updated_at,
        is_demo
      )
      values (
        new_patient_id,
        seed.department_id,
        seed.token_number,
        token_label,
        today,
        seed.status,
        coalesce(called_at, now_ts) - interval '1 minute',
        called_at,
        completed_at,
        now_ts,
        now_ts,
        true
      )
      returning id into new_entry_id;

      created_entries := created_entries + 1;

      perform private.write_queue_event(
        new_entry_id,
        'enqueued',
        null,
        'waiting',
        p_actor,
        jsonb_build_object('token_code', token_label, 'demo', true)
      );

      if seed.status = 'called' then
        perform private.write_queue_event(
          new_entry_id,
          'called',
          'waiting',
          'called',
          p_actor,
          jsonb_build_object('token_code', token_label, 'demo', true)
        );
      elsif seed.status = 'completed' then
        perform private.write_queue_event(
          new_entry_id,
          'called',
          'waiting',
          'called',
          p_actor,
          jsonb_build_object('token_code', token_label, 'demo', true)
        );
        perform private.write_queue_event(
          new_entry_id,
          'completed',
          'called',
          'completed',
          p_actor,
          jsonb_build_object('token_code', token_label, 'demo', true)
        );
      end if;
    end loop;
  end;

  if created_patients <> 20 or created_entries <> 20 then
    raise exception 'demo seed did not create exactly 20 patients and entries'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'patients', created_patients,
    'queue_entries', created_entries,
    'service_date', today,
    'clock_scale', 1
  );
end;
$$;

comment on function private.seed_fictional_demo(uuid) is
  'Replaces is_demo patients/queue only with the fixed 20-visit seed. Resets demo clock to wall time.';

create or replace function private.reset_demo()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
begin
  actor := private.require_staff_roles(array['admin', 'queue_manager']);
  return private.seed_fictional_demo(actor);
end;
$$;

create or replace function public.ensure_demo_queue()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date;
  wall timestamptz := pg_catalog.now();
  sim_now timestamptz;
  active_count integer;
  dept_count integer;
  clock_skew_seconds double precision;
  need_seed boolean;
  seed_result jsonb;
begin
  -- Serialize concurrent page loads so reloads cannot double-insert.
  perform pg_advisory_xact_lock(87201425);

  sim_now := private.simulated_now();
  today := sim_now::date;
  clock_skew_seconds := abs(extract(epoch from (sim_now - wall)));

  select count(*)::integer
  into active_count
  from public.queue_entries
  where service_date = today
    and status in ('waiting', 'called');

  select count(distinct department_id)::integer
  into dept_count
  from public.queue_entries
  where service_date = today
    and status in ('waiting', 'called');

  -- Healthy board: enough active tokens across several departments, clock not drifted.
  need_seed :=
    active_count < 10
    or dept_count < 4
    or clock_skew_seconds > (12 * 3600);

  if not need_seed then
    return jsonb_build_object(
      'ok', true,
      'action', 'noop',
      'reason', 'already_populated',
      'active_tokens', active_count,
      'departments_with_queue', dept_count,
      'service_date', today
    );
  end if;

  seed_result := private.seed_fictional_demo(null);

  return jsonb_build_object(
    'ok', true,
    'action', 'seeded',
    'reason', case
      when clock_skew_seconds > (12 * 3600) then 'clock_drift'
      when active_count < 10 then 'sparse_queue'
      else 'sparse_departments'
    end,
    'active_tokens_before', active_count,
    'departments_with_queue_before', dept_count
  ) || seed_result;
end;
$$;

comment on function public.ensure_demo_queue() is
  'Safe public bootstrap: seeds the fixed fictional demo only when today''s board is sparse or the demo clock has drifted. Never stacks duplicate random rows on reload.';

revoke all on function private.seed_fictional_demo(uuid) from public, anon, authenticated;
revoke all on function public.ensure_demo_queue() from public, anon, authenticated;
grant execute on function public.ensure_demo_queue() to anon, authenticated, service_role;
