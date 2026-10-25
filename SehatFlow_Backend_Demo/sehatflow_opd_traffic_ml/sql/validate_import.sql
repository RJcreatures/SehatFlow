-- Run after the CSVs have been imported. These are read-only validation queries.
select count(*) as hourly_rows,
       count(distinct department_code) as department_count,
       min(observed_at) as first_timestamp,
       max(observed_at) as last_timestamp,
       sum(arrivals_count) as aggregate_synthetic_arrivals
from public.demo_opd_traffic_hourly;
-- Expected: 172536 rows, 7 departments, local date range 2024-01-01 to 2026-10-23,
-- and 341360 synthetic aggregate arrivals.

select count(*) as daily_rows,
       count(distinct department_code) as department_count,
       min(service_date) as first_service_date,
       max(service_date) as last_service_date,
       sum(arrivals_count) as aggregate_synthetic_arrivals
from public.demo_opd_traffic_daily;
-- Expected: 7189 rows, 7 departments, 2024-01-01 to 2026-10-23,
-- and the same total of 341360 synthetic aggregate arrivals.

select data_origin, count(*)
from public.demo_opd_traffic_hourly
 group by data_origin;
-- Expected: one row with data_origin = 'synthetic'.
