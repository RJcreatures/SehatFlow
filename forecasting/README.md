# SehatFlow Phase 8 — Synthetic OPD demand forecasting

**Synthetic demonstration data — not live hospital activity.**

This folder isolates the Python training pipeline from the Vite frontend. The app consumes precomputed JSON artifacts; it does not call Python at runtime and does not train on real patient or queue records.

## Reproduce

```bash
cd forecasting
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run_pipeline.py
```

Artifacts are written to:

- `data/forecasting/` — CSV/JSON source of truth
- `public/forecasting/forecast_bundle.json` — static fetch copy
- `src/domain/forecasting/forecast_bundle.json` — bundled for the staff dashboard

## Design (short)

| Item | Value |
|------|--------|
| Seed | `20261024` (fixed) |
| History | 120 days of hourly counts |
| Departments | Configured SehatFlow OPD demo list |
| Holdout | Last 14 chronological days |
| Horizon | Next 24 hours after history end |
| Model | Closed-form ridge regression (NumPy) on department + cyclical time features |
| Baseline | Seasonal historical mean (department × day-of-week × hour) from training only |
| Simple week guide | Average synthetic arrivals per weekday (Mon–Sun); highlights busiest and least-busy days for staff |

## Privacy

- Aggregate synthetic arrival counts only.
- No patient names, tokens, access codes, QR tokens, or queue row IDs.
- Do not use outputs to deny care, triage, or reorder live queues.
