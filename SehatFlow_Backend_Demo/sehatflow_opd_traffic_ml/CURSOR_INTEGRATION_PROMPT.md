# Cursor prompt: integrate the SehatFlow synthetic traffic dataset and ML demo

Inspect the existing SehatFlow repository, Phase 8 forecast implementation, existing Supabase schema/RLS, staff route guards, forecast JSON format, and test scripts first. Integrate the supplied `sehatflow_opd_traffic_ml` pack without replacing existing working code unnecessarily.

## Goal

Add a credible, staff-gated OPD traffic analytics and model-comparison experience based on the provided synthetic aggregate dataset. Use Supabase for browsing historical aggregate traffic; run model training offline through the supplied Python script and serve only the compact generated forecast artifact to the app. Do not execute Python ML models in the browser.

## Strict constraints

- All new traffic records are synthetic aggregates, not real hospital data and not patient-level data.
- Preserve existing uncommitted changes and all existing patient/queue data. Never call a reset function, truncate, delete, or seed the production patient/queue tables.
- Keep this isolated in new `demo_opd_*` tables; do not mix it with live token or patient tables.
- Do not connect to or mutate remote Supabase automatically. Create a migration through the repository's normal Supabase CLI workflow, show me the migration, and state exactly how to apply it. Do not apply the remote migration unless I explicitly ask.
- Review the provided SQL template rather than blindly copying it. Ensure RLS is enabled, client roles have SELECT only on the synthetic demo tables, explicit grants are present, and insert/update/delete are denied to `anon` and `authenticated`. If actual staff-only table access is practical with the existing auth pattern, prefer it; otherwise the only public-readable tables must contain synthetic aggregate rows with no personal data. Keep the page itself behind the existing staff gate.
- Keep the bulk CSV files out of `public/` and out of the production JS bundle. Do not import both the full hourly CSV and its quarter-sized duplicates.
- Do not expose a Supabase service-role key, database password, or other secret in frontend variables.
- Keep the existing Phase 8 forecast artifact and route compatible. Inspect before modifying.

## Integration work

1. **Data tables:** Add schema for `demo_opd_traffic_hourly` and `demo_opd_traffic_daily`, with primary keys, checks, indexes, data-origin disclosure, explicit grants and RLS. Use the columns in the provided SQL template. Ensure CSV imports map to these columns correctly.
2. **Reproducible offline training:** Add/adjust scripts so `src/generate_dataset.py` creates the aggregate data deterministically and `src/train_forecast.py` compares seasonal-naive, Ridge and histogram-based gradient boosting models using a chronological holdout. The training command must write compact evaluation JSON/CSV and the next-seven-day prediction artifact. Do not silently overwrite the existing production forecast artifact; create an isolated artifact or adapt only after understanding the current format.
3. **Data import instructions:** Document the safe import of `data/opd_traffic_daily.csv` once and either the full hourly CSV OR the 12 quarterly hourly chunks into the demo tables. Import should be a one-time admin operation, never run in the user's browser. Provide row-count validation queries; expected counts are 7,189 daily rows and 172,536 hourly rows.
4. **Staff forecast UI:** Extend the existing staff-only forecast page rather than creating multiple new navigation pages. Keep it minimal. Use:
   - Persistent “SYNTHETIC DEMO DATA” label.
   - Date range and department filter.
   - Daily arrivals trend from the daily table.
   - Hour-of-day patterns from bounded hourly queries.
   - Actual-synthetic-history vs forecast chart.
   - Compact model comparison (MAE, RMSE, WAPE, R²), the 90-day test window and clear wording that evaluation is rolling one-hour-ahead.
   - No arbitrary patient-level rows, no made-up KPIs, no real-hospital claims.
5. **Performance:** Never fetch all 172,536 rows at once. Paginate or filter by date, query daily aggregates for long ranges, and use indexed hour queries only for drill-downs. Handle loading, no-data, stale/failed query and retry states.
6. **Tests:** Add tests for metrics artifact parsing, no accidental public-bundle inclusion of raw CSVs/models, department/date filtering, empty/failure UI state, and data-origin label. Add SQL/RLS tests if the repo's test setup supports them. Do not claim tests were run unless actually run.
7. **Verification:** Run existing tests, typecheck, lint and build scripts discovered from `package.json`. Report real outcomes and any pre-existing warnings. Do not deploy.

## The current reproducible model result (must not be hard-coded as live performance)

On this supplied synthetic data the chronological last-90-day rolling one-hour-ahead evaluation produced:
- Histogram gradient boosting: MAE 0.8818, RMSE 2.3581, WAPE 47.480%, R² 0.7175.
- Ridge regression: MAE 1.1515, RMSE 2.6771, WAPE 62.002%, R² 0.6359.
- Seasonal naive (168-hour lag): MAE 1.2554, RMSE 3.3685, WAPE 67.597%, R² 0.4236.

Load metrics from the generated artifact instead of typing these values into components. If the pipeline is rerun and results change, the UI must reflect the artifact. Label these as synthetic-data metrics, not real hospital accuracy.

## Acceptance criteria

- Existing patient registration, queue management, Find, Ask SehatFlow, emergency behaviour and Phase 8 routes continue working.
- The demo traffic is visually and technically separate from the operational queue tables.
- The staff page can show daily synthetic traffic and model forecast/evaluation data with bounded queries.
- No frontend path can mutate demo traffic rows.
- No bulk training CSV is exposed in the site bundle.
- The app makes no claim that the synthetic forecast predicts real demand.
- A clear import, validation, test and deployment checklist is returned; no remote changes are made automatically.
