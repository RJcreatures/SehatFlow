-- REVIEWABLE SQL TEMPLATE for synthetic demo data only.
-- Ask Cursor to integrate this through a newly generated Supabase migration.
-- Do not execute against production until the table names and access model are reviewed.

create table if not exists public.demo_opd_traffic_hourly (
  observed_at timestamptz not null,
  department_code text not null check (department_code in ('GENMED','PEDS','ORTHO','CARDIO','OPHTH','ENT','DERM')),
  department_name text not null,
  arrivals_count integer not null check (arrivals_count >= 0),
  completed_count integer not null check (completed_count >= 0),
  queue_start_count integer not null check (queue_start_count >= 0),
  queue_end_count integer not null check (queue_end_count >= 0),
  avg_service_minutes numeric(6,2) not null check (avg_service_minutes > 0),
  doctors_on_duty smallint not null check (doctors_on_duty >= 0),
  support_staff_on_duty smallint not null check (support_staff_on_duty >= 0),
  clinic_open boolean not null,
  is_weekend boolean not null,
  is_special_schedule_day boolean not null,
  data_origin text not null default 'synthetic' check (data_origin = 'synthetic'),
  primary key (observed_at, department_code)
);

create index if not exists demo_opd_traffic_hourly_department_time_idx
  on public.demo_opd_traffic_hourly (department_code, observed_at desc);

alter table public.demo_opd_traffic_hourly enable row level security;
revoke all on table public.demo_opd_traffic_hourly from anon, authenticated;
grant select on table public.demo_opd_traffic_hourly to anon, authenticated;
grant all on table public.demo_opd_traffic_hourly to service_role;
drop policy if exists "public may read synthetic OPD traffic" on public.demo_opd_traffic_hourly;
create policy "public may read synthetic OPD traffic"
  on public.demo_opd_traffic_hourly for select to anon, authenticated
  using (data_origin = 'synthetic');

comment on table public.demo_opd_traffic_hourly is
  'Synthetic aggregate hourly OPD traffic for SehatFlow demonstrations and ML experiments. Not observed hospital data.';

create table if not exists public.demo_opd_traffic_daily (
  service_date date not null,
  department_code text not null check (department_code in ('GENMED','PEDS','ORTHO','CARDIO','OPHTH','ENT','DERM')),
  department_name text not null,
  data_origin text not null default 'synthetic' check (data_origin = 'synthetic'),
  arrivals_count integer not null check (arrivals_count >= 0),
  completed_count integer not null check (completed_count >= 0),
  peak_queue_count integer not null check (peak_queue_count >= 0),
  mean_service_minutes numeric(6,2) not null check (mean_service_minutes > 0),
  open_hours smallint not null check (open_hours >= 0),
  doctors_peak smallint not null check (doctors_peak >= 0),
  support_staff_peak smallint not null check (support_staff_peak >= 0),
  is_weekend boolean not null,
  is_special_schedule_day boolean not null,
  primary key (service_date, department_code)
);

create index if not exists demo_opd_traffic_daily_department_date_idx
  on public.demo_opd_traffic_daily (department_code, service_date desc);

alter table public.demo_opd_traffic_daily enable row level security;
revoke all on table public.demo_opd_traffic_daily from anon, authenticated;
grant select on table public.demo_opd_traffic_daily to anon, authenticated;
grant all on table public.demo_opd_traffic_daily to service_role;
drop policy if exists "public may read synthetic OPD daily traffic" on public.demo_opd_traffic_daily;
create policy "public may read synthetic OPD daily traffic"
  on public.demo_opd_traffic_daily for select to anon, authenticated
  using (data_origin = 'synthetic');

comment on table public.demo_opd_traffic_daily is
  'Synthetic aggregate daily OPD traffic derived from demo_opd_traffic_hourly for SehatFlow charts. Not observed hospital data.';
