-- Phase 2 foundation for the fictional Nagar Civil Hospital demo.
-- Seeds departments only. It does not create patients, tokens, or queue mutations.
-- Browser roles receive no direct write grants. Later phases add narrow functions.

create schema private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

comment on schema private is
  'Security helpers. Do not add this schema to the Data API exposed schemas.';

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name_en text not null,
  name_hi text not null,
  room_en text not null,
  room_hi text not null,
  floor_en text not null,
  floor_hi text not null,
  estimated_minutes integer not null,
  display_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_code_unique unique (code),
  constraint departments_display_order_unique unique (display_order),
  constraint departments_code_check check (code ~ '^[a-z0-9_]{2,32}$'),
  constraint departments_name_en_check check (char_length(btrim(name_en)) between 1 and 80),
  constraint departments_name_hi_check check (char_length(btrim(name_hi)) between 1 and 80),
  constraint departments_room_en_check check (char_length(btrim(room_en)) between 1 and 80),
  constraint departments_room_hi_check check (char_length(btrim(room_hi)) between 1 and 80),
  constraint departments_floor_en_check check (char_length(btrim(floor_en)) between 1 and 80),
  constraint departments_floor_hi_check check (char_length(btrim(floor_hi)) between 1 and 80),
  constraint departments_estimated_minutes_check check (estimated_minutes between 5 and 120),
  constraint departments_display_order_check check (display_order between 1 and 100)
);

create table public.staff_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role text not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_members_role_check check (
    role in ('admin', 'registrar', 'doctor', 'queue_manager')
  ),
  constraint staff_members_display_name_check check (
    char_length(btrim(display_name)) between 1 and 80
  )
);

comment on table public.staff_members is
  'Provision rows from the SQL editor. There is no public staff registration.';

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  age integer not null,
  gender text,
  created_at timestamptz not null default now(),
  constraint patients_display_name_check check (
    char_length(btrim(display_name)) between 1 and 80
  ),
  constraint patients_age_check check (age between 0 and 120),
  constraint patients_gender_check check (
    gender is null or gender in ('female', 'male', 'other', 'undisclosed')
  )
);

comment on table public.patients is
  'Fictional demo identities only. Do not add a phone column or store real patient data.';

create table public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete restrict,
  department_id uuid not null references public.departments (id) on delete restrict,
  token_number integer not null,
  token_code text not null,
  service_date date not null,
  status text not null,
  queued_at timestamptz not null default now(),
  called_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint queue_entries_token_number_check check (token_number between 1 and 9999),
  constraint queue_entries_token_code_check check (token_code ~ '^[A-Z0-9]{1,8}-[0-9]{1,4}$'),
  constraint queue_entries_status_check check (
    status in ('waiting', 'called', 'completed', 'no_show', 'skipped', 'cancelled')
  ),
  constraint queue_entries_token_number_unique unique (department_id, service_date, token_number),
  constraint queue_entries_token_code_unique unique (department_id, service_date, token_code)
);

create index queue_entries_department_date_status_idx
  on public.queue_entries (department_id, service_date, status);

create index queue_entries_waiting_order_idx
  on public.queue_entries (department_id, service_date, token_number)
  where status in ('waiting', 'called');

create index queue_entries_patient_id_idx
  on public.queue_entries (patient_id);

create table public.doctor_status (
  department_id uuid primary key references public.departments (id) on delete restrict,
  availability text not null,
  delay_minutes integer not null default 0,
  break_ends_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff_members (user_id) on delete set null,
  constraint doctor_status_availability_check check (
    availability in ('available', 'on_break', 'running_late')
  ),
  constraint doctor_status_delay_check check (
    (
      availability = 'available'
      and delay_minutes = 0
      and break_ends_at is null
    )
    or (
      availability = 'on_break'
      and delay_minutes = 0
    )
    or (
      availability = 'running_late'
      and delay_minutes between 1 and 240
      and break_ends_at is null
    )
  )
);

create index doctor_status_updated_by_idx
  on public.doctor_status (updated_by);

create table public.urgent_flags (
  id uuid primary key default gen_random_uuid(),
  queue_entry_id uuid references public.queue_entries (id) on delete restrict,
  department_id uuid references public.departments (id) on delete restrict,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.staff_members (user_id) on delete set null,
  constraint urgent_flags_status_check check (status in ('open', 'acknowledged')),
  constraint urgent_flags_acknowledgement_check check (
    (
      status = 'open'
      and acknowledged_at is null
      and acknowledged_by is null
    )
    or (
      status = 'acknowledged'
      and acknowledged_at is not null
    )
  )
);

comment on table public.urgent_flags is
  'A help-needed flag. It does not store a diagnosis or change queue order.';

create index urgent_flags_queue_entry_id_idx
  on public.urgent_flags (queue_entry_id);

create index urgent_flags_department_id_idx
  on public.urgent_flags (department_id);

create index urgent_flags_acknowledged_by_idx
  on public.urgent_flags (acknowledged_by);

create index urgent_flags_open_idx
  on public.urgent_flags (created_at)
  where status = 'open';

create table public.queue_events (
  id uuid primary key default gen_random_uuid(),
  queue_entry_id uuid not null references public.queue_entries (id) on delete restrict,
  event_type text not null,
  previous_status text,
  new_status text,
  actor_user_id uuid references public.staff_members (user_id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint queue_events_type_check check (
    event_type in ('enqueued', 'called', 'completed', 'no_show', 'skipped', 'cancelled')
  ),
  constraint queue_events_previous_status_check check (
    previous_status is null
    or previous_status in ('waiting', 'called', 'completed', 'no_show', 'skipped', 'cancelled')
  ),
  constraint queue_events_new_status_check check (
    new_status is null
    or new_status in ('waiting', 'called', 'completed', 'no_show', 'skipped', 'cancelled')
  ),
  constraint queue_events_metadata_check check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 500
    and not (
      metadata ?| array[
        'name',
        'display_name',
        'phone',
        'mobile',
        'age',
        'gender',
        'diagnosis',
        'symptom',
        'symptoms',
        'note'
      ]
    )
  )
);

comment on table public.queue_events is
  'Append-oriented audit rows. Metadata must stay free of personal and medical detail.';

create index queue_events_entry_created_idx
  on public.queue_events (queue_entry_id, created_at);

create index queue_events_actor_user_id_idx
  on public.queue_events (actor_user_id);

create function private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_members
    where staff_members.user_id = (select auth.uid())
      and staff_members.active
  );
$$;

comment on function private.is_active_staff() is
  'True when auth.uid() is an active staff member. Returns no staff or patient rows.';

create function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create function private.reject_staff_membership_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    raise exception 'staff membership cannot be changed from a signed-in session'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at = pg_catalog.now();
  end if;

  return new;
end;
$$;

comment on function private.reject_staff_membership_write() is
  'Blocks membership changes from any session that has auth.uid(). SQL-editor provisioning has no user id.';

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_active_staff() to authenticated;

create trigger departments_touch_updated_at
  before update on public.departments
  for each row
  execute function private.touch_updated_at();

create trigger queue_entries_touch_updated_at
  before update on public.queue_entries
  for each row
  execute function private.touch_updated_at();

create trigger doctor_status_touch_updated_at
  before update on public.doctor_status
  for each row
  execute function private.touch_updated_at();

create trigger staff_members_guard_membership
  before insert or update on public.staff_members
  for each row
  execute function private.reject_staff_membership_write();

insert into public.departments (
  code,
  name_en,
  name_hi,
  room_en,
  room_hi,
  floor_en,
  floor_hi,
  estimated_minutes,
  display_order
)
values
  (
    'general_medicine',
    'General Medicine',
    'सामान्य चिकित्सा',
    'Room 12',
    'कक्ष 12',
    'Ground floor',
    'भूतल',
    10,
    1
  ),
  (
    'pediatrics',
    'Children (Pediatrics)',
    'बाल चिकित्सा',
    'Room 14',
    'कक्ष 14',
    'Ground floor',
    'भूतल',
    12,
    2
  ),
  (
    'womens_health',
    'Women''s Health',
    'महिला स्वास्थ्य',
    'Room 16',
    'कक्ष 16',
    'Ground floor',
    'भूतल',
    12,
    3
  ),
  (
    'orthopedics',
    'Bones and Joints (Orthopedics)',
    'हड्डी और जोड़',
    'Room 21',
    'कक्ष 21',
    'First floor',
    'पहली मंज़िल',
    12,
    4
  ),
  (
    'ent',
    'ENT',
    'कान, नाक और गला',
    'Room 23',
    'कक्ष 23',
    'First floor',
    'पहली मंज़िल',
    10,
    5
  ),
  (
    'ophthalmology',
    'Eyes (Ophthalmology)',
    'नेत्र',
    'Room 25',
    'कक्ष 25',
    'First floor',
    'पहली मंज़िल',
    10,
    6
  ),
  (
    'dermatology',
    'Skin (Dermatology)',
    'त्वचा',
    'Room 27',
    'कक्ष 27',
    'First floor',
    'पहली मंज़िल',
    8,
    7
  );

alter table public.departments enable row level security;
alter table public.staff_members enable row level security;
alter table public.patients enable row level security;
alter table public.queue_entries enable row level security;
alter table public.doctor_status enable row level security;
alter table public.urgent_flags enable row level security;
alter table public.queue_events enable row level security;

create policy departments_public_read
  on public.departments
  for select
  to anon, authenticated
  using (active = true);

create policy departments_staff_read
  on public.departments
  for select
  to authenticated
  using ((select private.is_active_staff()));

create policy staff_members_staff_read
  on public.staff_members
  for select
  to authenticated
  using ((select private.is_active_staff()));

create policy patients_staff_read
  on public.patients
  for select
  to authenticated
  using ((select private.is_active_staff()));

create policy queue_entries_staff_read
  on public.queue_entries
  for select
  to authenticated
  using ((select private.is_active_staff()));

create policy doctor_status_staff_read
  on public.doctor_status
  for select
  to authenticated
  using ((select private.is_active_staff()));

create policy urgent_flags_staff_read
  on public.urgent_flags
  for select
  to authenticated
  using ((select private.is_active_staff()));

create policy queue_events_staff_read
  on public.queue_events
  for select
  to authenticated
  using ((select private.is_active_staff()));

-- Cloud default privileges grant every Data API role full access to new public
-- tables. Revoke those grants, then add the reads this phase actually allows.
revoke all on table
  public.departments,
  public.staff_members,
  public.patients,
  public.queue_entries,
  public.doctor_status,
  public.urgent_flags,
  public.queue_events
from public, anon, authenticated;

grant select on table public.departments to anon, authenticated;
grant select on table
  public.staff_members,
  public.patients,
  public.queue_entries,
  public.doctor_status,
  public.urgent_flags,
  public.queue_events
to authenticated;

grant all on table
  public.departments,
  public.staff_members,
  public.patients,
  public.queue_entries,
  public.doctor_status,
  public.urgent_flags,
  public.queue_events
to service_role;

-- Realtime still passes each change through RLS. Anonymous subscribers get no
-- queue, doctor, or urgent rows because they have no select grant or policy.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.queue_entries;
    alter publication supabase_realtime add table public.doctor_status;
    alter publication supabase_realtime add table public.urgent_flags;
  else
    raise notice 'supabase_realtime publication not found; queue tables were not added to Realtime';
  end if;
end;
$$;
