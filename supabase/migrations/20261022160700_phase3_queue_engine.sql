-- Phase 3 queue engine for the fictional Nagar Civil Hospital demo.
-- Adds demo provenance, a shared 10x demo clock, staff RPCs, and a public board snapshot.
-- Does not implement patient registration or public token lookup.

-- ---------------------------------------------------------------------------
-- Schema extensions
-- ---------------------------------------------------------------------------

alter table public.patients
  add column is_demo boolean not null default false;

alter table public.queue_entries
  add column is_demo boolean not null default false;

alter table public.urgent_flags
  add column is_demo boolean not null default false;

create index patients_is_demo_idx on public.patients (id) where is_demo;
create index queue_entries_is_demo_idx on public.queue_entries (id) where is_demo;
create index urgent_flags_is_demo_idx on public.urgent_flags (id) where is_demo;

comment on column public.patients.is_demo is
  'True only for rows created by reset_demo. Reset deletes these rows and no others.';
comment on column public.queue_entries.is_demo is
  'True only for rows created by reset_demo. Reset deletes these rows and no others.';
comment on column public.urgent_flags.is_demo is
  'True only for rows created by reset_demo. Reset deletes these rows and no others.';

alter table public.queue_events
  alter column queue_entry_id drop not null;

alter table public.queue_events
  drop constraint queue_events_type_check;

alter table public.queue_events
  add constraint queue_events_type_check check (
    event_type in (
      'enqueued',
      'called',
      'completed',
      'no_show',
      'skipped',
      'cancelled',
      'reassigned',
      'sent_to_end',
      'doctor_updated',
      'urgent_acknowledged'
    )
  );

create table public.demo_clock (
  id boolean primary key default true check (id),
  scale integer not null default 1,
  real_anchor timestamptz not null default now(),
  sim_anchor timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff_members (user_id) on delete set null,
  constraint demo_clock_scale_check check (scale in (1, 10))
);

comment on table public.demo_clock is
  'Single-row 1x/10x demo clock. simulated_now = sim_anchor + (wall_now - real_anchor) * scale.';

insert into public.demo_clock (id, scale, real_anchor, sim_anchor)
values (true, 1, now(), now());

alter table public.demo_clock enable row level security;

create policy demo_clock_staff_read
  on public.demo_clock
  for select
  to authenticated
  using ((select private.is_active_staff()));

revoke all on table public.demo_clock from public, anon, authenticated;
grant select on table public.demo_clock to authenticated;
grant all on table public.demo_clock to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.demo_clock;
    exception
      when duplicate_object then
        null;
    end;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

create function private.simulated_now()
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  clock public.demo_clock%rowtype;
begin
  select * into clock from public.demo_clock where id is true;
  if not found then
    return pg_catalog.now();
  end if;
  return clock.sim_anchor
    + (pg_catalog.now() - clock.real_anchor) * clock.scale;
end;
$$;

create function private.service_date()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (private.simulated_now())::date;
$$;

create function private.require_staff_roles(allowed_roles text[])
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  membership public.staff_members%rowtype;
begin
  if actor is null then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  select * into membership
  from public.staff_members
  where staff_members.user_id = actor
    and staff_members.active;

  if not found then
    raise exception 'active staff membership required'
      using errcode = '42501';
  end if;

  if not (membership.role = any (allowed_roles)) then
    raise exception 'role % is not allowed for this operation', membership.role
      using errcode = '42501';
  end if;

  return actor;
end;
$$;

create function private.token_prefix(department_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case department_code
    when 'general_medicine' then 'GM'
    when 'pediatrics' then 'PD'
    when 'womens_health' then 'WH'
    when 'orthopedics' then 'OR'
    when 'ent' then 'ENT'
    when 'ophthalmology' then 'EY'
    when 'dermatology' then 'SK'
    else upper(left(department_code, 3))
  end;
$$;

create function private.format_token(prefix text, token_number integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select prefix || '-' || lpad(token_number::text, 3, '0');
$$;

create function private.lock_department(p_department_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    874221,
    pg_catalog.hashtext(p_department_id::text)
  );
end;
$$;

create function private.mean_duration_minutes(p_department_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mean_value numeric;
  fallback integer;
begin
  select avg(extract(epoch from (sample.completed_at - sample.called_at)) / 60.0)
  into mean_value
  from (
    select called_at, completed_at
    from public.queue_entries
    where department_id = p_department_id
      and status = 'completed'
      and called_at is not null
      and completed_at is not null
      and completed_at > called_at
    order by completed_at desc
    limit 10
  ) as sample;

  if mean_value is not null then
    return mean_value;
  end if;

  select estimated_minutes into fallback
  from public.departments
  where id = p_department_id;

  return coalesce(fallback, 10)::numeric;
end;
$$;

create function private.round_wait_minutes(raw numeric)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (round(raw / 5.0) * 5)::integer;
$$;

create function private.break_remaining_minutes(
  p_break_ends_at timestamptz,
  p_now timestamptz
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_break_ends_at is null then 0
    when p_break_ends_at <= p_now then 0
    else greatest(
      0,
      ceiling(extract(epoch from (p_break_ends_at - p_now)) / 60.0)
    )::integer
  end;
$$;

create function private.people_ahead(
  p_department_id uuid,
  p_service_date date,
  p_token_number integer,
  p_status text
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_status = 'called' then 0
    when p_status <> 'waiting' then 0
    else (
      select count(*)::integer
      from public.queue_entries as peer
      where peer.department_id = p_department_id
        and peer.service_date = p_service_date
        and peer.status in ('waiting', 'called')
        and peer.token_number < p_token_number
    )
  end;
$$;

create function private.estimate_wait_for_entry(
  p_department_id uuid,
  p_service_date date,
  p_token_number integer,
  p_status text,
  p_now timestamptz
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ahead integer;
  mean_minutes numeric;
  late integer := 0;
  break_minutes integer := 0;
  doctor public.doctor_status%rowtype;
begin
  ahead := private.people_ahead(
    p_department_id,
    p_service_date,
    p_token_number,
    p_status
  );
  mean_minutes := private.mean_duration_minutes(p_department_id);

  select * into doctor
  from public.doctor_status
  where department_id = p_department_id;

  if found then
    if doctor.availability = 'running_late' then
      late := doctor.delay_minutes;
    elsif doctor.availability = 'on_break' then
      break_minutes := private.break_remaining_minutes(doctor.break_ends_at, p_now);
    end if;
  end if;

  return private.round_wait_minutes(
    ahead::numeric * mean_minutes + late::numeric + break_minutes::numeric
  );
end;
$$;

create function private.write_queue_event(
  p_queue_entry_id uuid,
  p_event_type text,
  p_previous_status text,
  p_new_status text,
  p_actor uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.queue_events (
    queue_entry_id,
    event_type,
    previous_status,
    new_status,
    actor_user_id,
    created_at,
    metadata
  )
  values (
    p_queue_entry_id,
    p_event_type,
    p_previous_status,
    p_new_status,
    p_actor,
    private.simulated_now(),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create function private.next_token_number(
  p_department_id uuid,
  p_service_date date
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(token_number), 0) + 1
  from public.queue_entries
  where department_id = p_department_id
    and service_date = p_service_date;
$$;

create function private.ensure_doctor_status(p_department_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.doctor_status (
    department_id,
    availability,
    delay_minutes,
    break_ends_at,
    updated_at
  )
  values (
    p_department_id,
    'available',
    0,
    null,
    private.simulated_now()
  )
  on conflict (department_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private operations
-- ---------------------------------------------------------------------------

create function private.call_next(p_department_id uuid)
returns public.queue_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  today date := private.service_date();
  now_ts timestamptz := private.simulated_now();
  called_count integer;
  next_entry public.queue_entries%rowtype;
begin
  actor := private.require_staff_roles(array['admin', 'queue_manager']);
  perform private.lock_department(p_department_id);

  if not exists (
    select 1 from public.departments
    where id = p_department_id and active
  ) then
    raise exception 'department not found'
      using errcode = 'P0002';
  end if;

  perform private.ensure_doctor_status(p_department_id);

  select count(*) into called_count
  from public.queue_entries
  where department_id = p_department_id
    and service_date = today
    and status = 'called';

  if called_count > 0 then
    raise exception 'a token is already called in this department'
      using errcode = 'P0001';
  end if;

  select *
  into next_entry
  from public.queue_entries
  where department_id = p_department_id
    and service_date = today
    and status = 'waiting'
  order by token_number asc, queued_at asc, id asc
  limit 1
  for update;

  if not found then
    raise exception 'no waiting token in this department'
      using errcode = 'P0002';
  end if;

  update public.queue_entries
  set status = 'called',
      called_at = now_ts,
      updated_at = now_ts
  where id = next_entry.id
  returning * into next_entry;

  perform private.write_queue_event(
    next_entry.id,
    'called',
    'waiting',
    'called',
    actor,
    jsonb_build_object('token_code', next_entry.token_code)
  );

  return next_entry;
end;
$$;

create function private.complete_token(p_queue_entry_id uuid)
returns public.queue_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  now_ts timestamptz := private.simulated_now();
  entry public.queue_entries%rowtype;
begin
  actor := private.require_staff_roles(array['admin', 'queue_manager', 'doctor']);
  select * into entry from public.queue_entries where id = p_queue_entry_id for update;
  if not found then
    raise exception 'queue entry not found' using errcode = 'P0002';
  end if;

  perform private.lock_department(entry.department_id);

  if entry.status <> 'called' then
    raise exception 'only a called token can be completed'
      using errcode = 'P0001';
  end if;

  update public.queue_entries
  set status = 'completed',
      completed_at = now_ts,
      updated_at = now_ts
  where id = entry.id
  returning * into entry;

  perform private.write_queue_event(
    entry.id,
    'completed',
    'called',
    'completed',
    actor,
    jsonb_build_object('token_code', entry.token_code)
  );

  return entry;
end;
$$;

create function private.mark_no_show(p_queue_entry_id uuid)
returns public.queue_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  now_ts timestamptz := private.simulated_now();
  entry public.queue_entries%rowtype;
begin
  actor := private.require_staff_roles(array['admin', 'queue_manager']);
  select * into entry from public.queue_entries where id = p_queue_entry_id for update;
  if not found then
    raise exception 'queue entry not found' using errcode = 'P0002';
  end if;

  perform private.lock_department(entry.department_id);

  if entry.status <> 'called' then
    raise exception 'only a called token can be marked no-show'
      using errcode = 'P0001';
  end if;

  update public.queue_entries
  set status = 'no_show',
      updated_at = now_ts
  where id = entry.id
  returning * into entry;

  perform private.write_queue_event(
    entry.id,
    'no_show',
    'called',
    'no_show',
    actor,
    jsonb_build_object('token_code', entry.token_code)
  );

  return entry;
end;
$$;

create function private.send_to_end(p_queue_entry_id uuid)
returns public.queue_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  now_ts timestamptz := private.simulated_now();
  entry public.queue_entries%rowtype;
  dept public.departments%rowtype;
  new_number integer;
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

  select * into dept from public.departments where id = entry.department_id;
  previous_status := entry.status;
  new_number := private.next_token_number(entry.department_id, entry.service_date);

  update public.queue_entries
  set status = 'waiting',
      token_number = new_number,
      token_code = private.format_token(private.token_prefix(dept.code), new_number),
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

create function private.reassign_token(
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

  -- Lock both departments in UUID order to avoid deadlocks.
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

create function private.set_doctor_status(
  p_department_id uuid,
  p_availability text,
  p_delay_minutes integer,
  p_break_ends_at timestamptz
)
returns public.doctor_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  now_ts timestamptz := private.simulated_now();
  row public.doctor_status%rowtype;
  delay integer := coalesce(p_delay_minutes, 0);
  break_at timestamptz := p_break_ends_at;
begin
  actor := private.require_staff_roles(array['admin', 'queue_manager', 'doctor']);
  perform private.lock_department(p_department_id);

  if not exists (
    select 1 from public.departments where id = p_department_id
  ) then
    raise exception 'department not found' using errcode = 'P0002';
  end if;

  if p_availability = 'available' then
    delay := 0;
    break_at := null;
  elsif p_availability = 'on_break' then
    delay := 0;
    if break_at is null or break_at <= now_ts then
      raise exception 'break end time must be in the simulated future'
        using errcode = 'P0001';
    end if;
  elsif p_availability = 'running_late' then
    break_at := null;
    if delay < 1 or delay > 240 then
      raise exception 'delay must be between 1 and 240 minutes'
        using errcode = 'P0001';
    end if;
  else
    raise exception 'invalid doctor availability'
      using errcode = 'P0001';
  end if;

  insert into public.doctor_status (
    department_id,
    availability,
    delay_minutes,
    break_ends_at,
    updated_at,
    updated_by
  )
  values (
    p_department_id,
    p_availability,
    delay,
    break_at,
    now_ts,
    actor
  )
  on conflict (department_id) do update
  set availability = excluded.availability,
      delay_minutes = excluded.delay_minutes,
      break_ends_at = excluded.break_ends_at,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  returning * into row;

  perform private.write_queue_event(
    null,
    'doctor_updated',
    null,
    null,
    actor,
    jsonb_build_object(
      'department_id', p_department_id::text,
      'availability', p_availability,
      'delay_minutes', delay
    )
  );

  return row;
end;
$$;

create function private.acknowledge_urgent(p_flag_id uuid)
returns public.urgent_flags
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  now_ts timestamptz := private.simulated_now();
  flag public.urgent_flags%rowtype;
begin
  actor := private.require_staff_roles(array['admin', 'queue_manager']);

  select * into flag from public.urgent_flags where id = p_flag_id for update;
  if not found then
    raise exception 'urgent flag not found' using errcode = 'P0002';
  end if;

  if flag.status <> 'open' then
    raise exception 'urgent flag is already acknowledged'
      using errcode = 'P0001';
  end if;

  update public.urgent_flags
  set status = 'acknowledged',
      acknowledged_at = now_ts,
      acknowledged_by = actor
  where id = flag.id
  returning * into flag;

  perform private.write_queue_event(
    flag.queue_entry_id,
    'urgent_acknowledged',
    null,
    null,
    actor,
    jsonb_build_object('flag_id', flag.id::text)
  );

  return flag;
end;
$$;

create function private.set_demo_clock(p_scale integer)
returns public.demo_clock
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  wall timestamptz := pg_catalog.now();
  current_sim timestamptz;
  row public.demo_clock%rowtype;
begin
  actor := private.require_staff_roles(array['admin', 'queue_manager']);

  if p_scale not in (1, 10) then
    raise exception 'demo clock scale must be 1 or 10'
      using errcode = 'P0001';
  end if;

  current_sim := private.simulated_now();

  update public.demo_clock
  set scale = p_scale,
      real_anchor = wall,
      sim_anchor = current_sim,
      updated_at = wall,
      updated_by = actor
  where id is true
  returning * into row;

  return row;
end;
$$;

create function private.reset_demo()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  now_ts timestamptz;
  today date;
  wall timestamptz := pg_catalog.now();
  dept record;
  patient_ids uuid[] := array[]::uuid[];
  created_patients integer := 0;
  created_entries integer := 0;
begin
  actor := private.require_staff_roles(array['admin', 'queue_manager']);

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
      updated_by = actor
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
        updated_by = actor
    where department_id = dept.id;
  end loop;

  -- Exactly 20 fictional patients and queue entries.
  -- Distribution: GM 4, PD 3, WH 3, OR 3, ENT 2, EY 2, SK 3.
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
      patient_ids := patient_ids || new_patient_id;

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
        actor,
        jsonb_build_object('token_code', token_label, 'demo', true)
      );

      if seed.status = 'called' then
        perform private.write_queue_event(
          new_entry_id,
          'called',
          'waiting',
          'called',
          actor,
          jsonb_build_object('token_code', token_label, 'demo', true)
        );
      elsif seed.status = 'completed' then
        perform private.write_queue_event(
          new_entry_id,
          'called',
          'waiting',
          'called',
          actor,
          jsonb_build_object('token_code', token_label, 'demo', true)
        );
        perform private.write_queue_event(
          new_entry_id,
          'completed',
          'called',
          'completed',
          actor,
          jsonb_build_object('token_code', token_label, 'demo', true)
        );
      end if;
    end loop;
  end;

  if created_patients <> 20 or created_entries <> 20 then
    raise exception 'demo reset did not create exactly 20 patients and entries'
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

-- ---------------------------------------------------------------------------
-- Public wrappers (SECURITY DEFINER, one private call each)
-- ---------------------------------------------------------------------------

create function public.call_next(p_department_id uuid)
returns public.queue_entries
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.call_next(p_department_id);
end;
$$;

create function public.complete_token(p_queue_entry_id uuid)
returns public.queue_entries
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.complete_token(p_queue_entry_id);
end;
$$;

create function public.mark_no_show(p_queue_entry_id uuid)
returns public.queue_entries
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.mark_no_show(p_queue_entry_id);
end;
$$;

create function public.send_to_end(p_queue_entry_id uuid)
returns public.queue_entries
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.send_to_end(p_queue_entry_id);
end;
$$;

create function public.reassign_token(
  p_queue_entry_id uuid,
  p_target_department_id uuid
)
returns public.queue_entries
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.reassign_token(p_queue_entry_id, p_target_department_id);
end;
$$;

create function public.set_doctor_status(
  p_department_id uuid,
  p_availability text,
  p_delay_minutes integer default 0,
  p_break_ends_at timestamptz default null
)
returns public.doctor_status
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.set_doctor_status(
    p_department_id,
    p_availability,
    p_delay_minutes,
    p_break_ends_at
  );
end;
$$;

create function public.acknowledge_urgent(p_flag_id uuid)
returns public.urgent_flags
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.acknowledge_urgent(p_flag_id);
end;
$$;

create function public.set_demo_clock(p_scale integer)
returns public.demo_clock
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.set_demo_clock(p_scale);
end;
$$;

create function public.reset_demo()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.reset_demo();
end;
$$;

create function public.get_demo_clock()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  clock public.demo_clock%rowtype;
  now_ts timestamptz;
begin
  perform private.require_staff_roles(
    array['admin', 'queue_manager', 'doctor', 'registrar']
  );
  select * into clock from public.demo_clock where id is true;
  now_ts := private.simulated_now();
  return jsonb_build_object(
    'scale', clock.scale,
    'real_anchor', clock.real_anchor,
    'sim_anchor', clock.sim_anchor,
    'simulated_now', now_ts,
    'service_date', now_ts::date
  );
end;
$$;

-- Sanitized public board snapshot. Fixed columns only. No patient identity.
create function public.get_board_snapshot()
returns table (
  department_code text,
  department_name_en text,
  department_name_hi text,
  room_en text,
  room_hi text,
  floor_en text,
  floor_hi text,
  display_order integer,
  called_token text,
  next_waiting_tokens text[],
  availability text,
  delay_minutes integer,
  break_ends_at timestamptz,
  estimated_wait_minutes integer,
  clock_scale integer,
  simulated_now timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  now_ts timestamptz := private.simulated_now();
  today date := now_ts::date;
  scale_value integer;
begin
  select scale into scale_value from public.demo_clock where id is true;
  scale_value := coalesce(scale_value, 1);

  return query
  select
    d.code,
    d.name_en,
    d.name_hi,
    d.room_en,
    d.room_hi,
    d.floor_en,
    d.floor_hi,
    d.display_order,
    (
      select q.token_code
      from public.queue_entries as q
      where q.department_id = d.id
        and q.service_date = today
        and q.status = 'called'
      order by q.token_number asc
      limit 1
    ) as called_token,
    coalesce(
      (
        select array_agg(waiting.token_code order by waiting.token_number)
        from (
          select q.token_code, q.token_number
          from public.queue_entries as q
          where q.department_id = d.id
            and q.service_date = today
            and q.status = 'waiting'
          order by q.token_number asc
          limit 3
        ) as waiting
      ),
      array[]::text[]
    ) as next_waiting_tokens,
    coalesce(ds.availability, 'available'),
    coalesce(ds.delay_minutes, 0),
    ds.break_ends_at,
    (
      select private.estimate_wait_for_entry(
        d.id,
        today,
        coalesce(
          (
            select q.token_number
            from public.queue_entries as q
            where q.department_id = d.id
              and q.service_date = today
              and q.status = 'waiting'
            order by q.token_number asc
            limit 1
          ),
          0
        ),
        case
          when exists (
            select 1
            from public.queue_entries as q
            where q.department_id = d.id
              and q.service_date = today
              and q.status = 'waiting'
          ) then 'waiting'
          else 'completed'
        end,
        now_ts
      )
    ) as estimated_wait_minutes,
    scale_value,
    now_ts
  from public.departments as d
  left join public.doctor_status as ds on ds.department_id = d.id
  where d.active
  order by d.display_order;
end;
$$;

comment on function public.get_board_snapshot() is
  'Public waiting-room feed. Returns department, token, room, and wait fields only.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function private.simulated_now() from public, anon, authenticated;
revoke all on function private.service_date() from public, anon, authenticated;
revoke all on function private.require_staff_roles(text[]) from public, anon, authenticated;
revoke all on function private.token_prefix(text) from public, anon, authenticated;
revoke all on function private.format_token(text, integer) from public, anon, authenticated;
revoke all on function private.lock_department(uuid) from public, anon, authenticated;
revoke all on function private.mean_duration_minutes(uuid) from public, anon, authenticated;
revoke all on function private.round_wait_minutes(numeric) from public, anon, authenticated;
revoke all on function private.break_remaining_minutes(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.people_ahead(uuid, date, integer, text) from public, anon, authenticated;
revoke all on function private.estimate_wait_for_entry(uuid, date, integer, text, timestamptz) from public, anon, authenticated;
revoke all on function private.write_queue_event(uuid, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.next_token_number(uuid, date) from public, anon, authenticated;
revoke all on function private.ensure_doctor_status(uuid) from public, anon, authenticated;
revoke all on function private.call_next(uuid) from public, anon, authenticated;
revoke all on function private.complete_token(uuid) from public, anon, authenticated;
revoke all on function private.mark_no_show(uuid) from public, anon, authenticated;
revoke all on function private.send_to_end(uuid) from public, anon, authenticated;
revoke all on function private.reassign_token(uuid, uuid) from public, anon, authenticated;
revoke all on function private.set_doctor_status(uuid, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function private.acknowledge_urgent(uuid) from public, anon, authenticated;
revoke all on function private.set_demo_clock(integer) from public, anon, authenticated;
revoke all on function private.reset_demo() from public, anon, authenticated;

revoke all on function public.call_next(uuid) from public, anon, authenticated;
revoke all on function public.complete_token(uuid) from public, anon, authenticated;
revoke all on function public.mark_no_show(uuid) from public, anon, authenticated;
revoke all on function public.send_to_end(uuid) from public, anon, authenticated;
revoke all on function public.reassign_token(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_doctor_status(uuid, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.acknowledge_urgent(uuid) from public, anon, authenticated;
revoke all on function public.set_demo_clock(integer) from public, anon, authenticated;
revoke all on function public.reset_demo() from public, anon, authenticated;
revoke all on function public.get_demo_clock() from public, anon, authenticated;
revoke all on function public.get_board_snapshot() from public, anon, authenticated;

grant execute on function public.call_next(uuid) to authenticated;
grant execute on function public.complete_token(uuid) to authenticated;
grant execute on function public.mark_no_show(uuid) to authenticated;
grant execute on function public.send_to_end(uuid) to authenticated;
grant execute on function public.reassign_token(uuid, uuid) to authenticated;
grant execute on function public.set_doctor_status(uuid, text, integer, timestamptz) to authenticated;
grant execute on function public.acknowledge_urgent(uuid) to authenticated;
grant execute on function public.set_demo_clock(integer) to authenticated;
grant execute on function public.reset_demo() to authenticated;
grant execute on function public.get_demo_clock() to authenticated;
grant execute on function public.get_board_snapshot() to anon, authenticated;

-- Keep the Phase 2 staff helper available to authenticated for RLS.
grant execute on function private.is_active_staff() to authenticated;
