# SehatFlow Synthetic OPD Traffic + Forecasting Pack

This package provides a larger, reproducible traffic dataset for SehatFlow's staff forecasting/demo view and an offline ML experiment.

## Dataset at a glance

- **172,536 hourly aggregate records** (24 hours × 1,027 calendar days × 7 departments)
- **7,189 daily aggregate records** (1,027 dates × 7 departments)
- Simulated calendar range: **2024-01-01 through 2026-10-23**, timestamps in Asia/Kolkata (`+05:30`)
- Seed: `20261024` (deterministic reproduction)
- Total generated arrivals: **341,360** (aggregate synthetic count, not unique people)
- Departments: General Medicine, Pediatrics, Orthopedics, Cardiology, Ophthalmology / Eye Clinic, ENT, Dermatology
- No names, phone numbers, token IDs, diagnoses, patient-level rows, or other personal/medical identifiers

**Important:** the entire dataset is synthetic. Dates are simulation timestamps, not observed history from a real hospital. Department names and schedules represent a configurable sample OPD. Queue and service values are generated assumptions. They are suitable for demonstration and code testing only—not staffing decisions, real wait-time promises, clinical operations, or claims about a real hospital.

## Files

- `data/opd_traffic_hourly.csv` — complete hourly dataset; 172,536 rows, approximately 15 MB.
- `data/hourly_chunks/opd_traffic_YYYY_QN.csv` — the same hourly data split into 12 quarter-sized CSVs for easier importing. **Import either this set OR the full hourly CSV, never both.**
- `data/opd_traffic_daily.csv` — daily aggregate dataset for trend charts.
- `data/opd_department_summary.csv` — one summary row per department.
- `data/data_dictionary.csv` — field definitions.
- `sql/demo_opd_traffic_schema.sql` — reviewable SQL template for two separate, synthetic-only demo tables with read-only client access. It is not an automatically applied migration.
- `src/generate_dataset.py` — deterministic synthetic data generator.
- `src/train_forecast.py` — time-aware holdout evaluation, offline model training, per-department metrics and recursive seven-day demo forecast.
- `outputs/forecast_metrics_overall.csv` — overall model comparison.
- `outputs/forecast_metrics_by_department.csv` — per-department comparison.
- `outputs/forecast_next_7_days.csv` — forecast output, including selected model and comparison predictions.
- `outputs/forecast_summary.json` — machine-readable metadata, metric table and demo forecast series.
- `models/*.joblib` — fitted model artifacts for offline reproduction (not for direct browser use).
- `CURSOR_INTEGRATION_PROMPT.md` — prompt to integrate the data into the existing app safely.

## Model experiment

The target is **hourly aggregate arrivals**, not diagnosis, clinical urgency, individual patient outcomes, or wait-time estimates.

Models compared:
1. Seasonal-naive baseline (observed arrivals at the same hour one week earlier).
2. Ridge regression with time, department, and lag/rolling features.
3. Histogram-based gradient boosting regression with the same input features.

Evaluation uses a chronological holdout of the last 90 days. Reported test metrics are for **rolling one-hour-ahead predictions**, where previous observed arrivals remain available as lag features. This is not a seven-day-ahead backtest and is not evidence of real-hospital performance.

The current deterministic run produced:

| Model | MAE | RMSE | WAPE | R² |
|---|---:|---:|---:|---:|
| HistGradientBoostingRegressor | 0.8818 | 2.3581 | 47.480% | 0.7175 |
| Ridge regression | 1.1515 | 2.6771 | 62.002% | 0.6359 |
| Seasonal-naive, 168-hour lag | 1.2554 | 3.3685 | 67.597% | 0.4236 |

These metrics demonstrate that the code can run a model comparison on this synthetic dataset. They are not real-world validation. WAPE is relatively high partly because many closed-hours observations are zero; report MAE/RMSE/R² alongside WAPE rather than presenting one metric alone.

## Reproduce locally

Python 3.11+ is recommended. From this directory:

```bash
python -m venv .venv
source .venv/bin/activate        # macOS/Linux
# On Windows use: .venv\\Scripts\\activate
pip install -r requirements.txt
python src/generate_dataset.py
python src/train_forecast.py
```

The generator overwrites only files under `data/` that it owns; the training script writes model artifacts and results under `models/` and `outputs/`. Neither script connects to Supabase or changes the deployed website.

## Supabase import path

1. Back up/check the project and inspect existing schema before adding tables. Do not alter the real patient/queue tables.
2. Ask Cursor to create a new migration using the project's existing Supabase CLI workflow. Review `sql/demo_opd_traffic_schema.sql` first; do not blindly run it against production.
3. Apply the reviewed migration to the intended environment. The intended schema uses separate table names: `demo_opd_traffic_hourly` and `demo_opd_traffic_daily`.
4. In Supabase Table Editor, import `data/opd_traffic_daily.csv` into `demo_opd_traffic_daily` once.
5. Import either `data/opd_traffic_hourly.csv` once, or each of the 12 files in `data/hourly_chunks/` in chronological order into `demo_opd_traffic_hourly`. Do not import both copies.
6. Validate total row counts and timestamps. Expected counts are 172,536 hourly rows and 7,189 daily rows.
7. Verify that the browser/client role can select but cannot insert, update or delete from the demo tables. The tables contain only explicitly synthetic aggregate data.

Supabase's dashboard CSV import has a documented 100 MB limit, so the current ~15 MB hourly CSV is below that limit; quarter-sized chunks are included for easier retry/recovery. See https://supabase.com/docs/guides/database/import-data. Keep RLS and explicit grants/policies aligned; see https://supabase.com/docs/guides/database/postgres/row-level-security.

## Dashboard presentation guidance

A clear, compact staff forecasting screen can show:
- A persistent **SYNTHETIC DEMO DATA** label.
- Daily arrivals trend with department filter and date range.
- Hour-of-day / day-of-week traffic patterns.
- Queue sample trends (labelled simulated).
- A seven-day per-department forecast chart with observed synthetic history separated visually from predicted values.
- A simple model comparison table: MAE, RMSE, WAPE and R², with the test window and one-hour-ahead evaluation definition.
- One sentence: “Model metrics are measured on synthetic demo data and are not validated for real hospital operations.”

Do not query all 172,536 rows into the browser. Query bounded date ranges, use the daily table for broad date trends, and use the hourly table for hourly drill-downs. Keep the route staff-gated even though the aggregate demo rows contain no private data, and never place the full raw dataset in the public web build.
