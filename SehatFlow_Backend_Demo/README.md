# SehatFlow ML Demo Lab — recording build

This is a **standalone local demo dashboard** for recording the backend/model story for HackCache. It is not integrated into the deployed SehatFlow website and does not connect to Supabase. Every traffic row and every patient-visit row is synthetic.

## What the demo shows

### 1. Daily OPD traffic
- Opens the included synthetic traffic dataset: **172,536 hourly aggregate rows**, **7 departments**, **1,027 simulated days** (2024-01-01 to 2026-10-23), deterministic seed `20261024`.
- Displays a raw data sample and engineered lag/rolling features that are fed into the forecasting pipeline.
- Shows the held-out model comparison for the seasonal-naive weekly baseline, Ridge regression, and Histogram Gradient Boosting.
- Aggregates included model-produced hourly forecasts into a daily, seven-day forecast chart.
- Includes a button to rerun the traffic training script locally.

### 2. Patient consultation duration
- Includes **17,813 synthetic consultation records** across **4,200 synthetic patient profiles**, with repeat-visit history and previous consultation duration.
- Shows the model inputs, chronological holdout evaluation, model-vs-baseline metrics, and some held-out predictions alongside simulated outcomes.
- Lets the presenter select a synthetic patient, view the visit history, adjust a hypothetical next-visit scenario, and predict consultation duration.
- Uses **HistGradientBoostingRegressor** for duration estimation. It predicts consultation minutes, **not total queue waiting time**, and does not suggest diagnoses or medicines.

## Run it on macOS

1. Download and unzip `SehatFlow_Backend_Demo.zip`.
2. Open the extracted folder.
3. Double-click `START_DEMO.command` (or right-click and choose **Open** if macOS blocks it on the first launch).
4. The first launch creates a local virtual environment, installs the listed Python packages, and starts Streamlit. A browser tab should open. If it does not, look in the terminal output for the local URL (usually `http://localhost:8501`).
5. Use the two tabs at the top of the dashboard to switch between the model demos.

If double-clicking is blocked, open Terminal in this folder and run:

```bash
chmod +x START_DEMO.command run_demo.sh
./run_demo.sh
```

Python 3.11+ is recommended. The dataset, model artifact, and scripts are included, so normal viewing does not require API keys or cloud credentials.

## To record a convincing walkthrough

Use `RECORDING_GUIDE.md`. Recommended order:
1. Show traffic dataset size and the raw/engineered feature sample.
2. Explain the training/holdout comparison.
3. Show the seven-day daily forecast totals and point out that the source forecasts are hourly model output aggregated by day.
4. Switch to patient duration, show one synthetic patient's repeated history, then run a hypothetical next-visit estimate.
5. End on the caveat that the metrics are from synthetic data and are not real-hospital validation.

## Metric definitions and honest claims

- **Traffic model:** chronological last-90-day holdout, with rolling one-hour-ahead predictions using previously observed test-period lags. It is not a seven-day-ahead backtest. In the included run, Gradient Boosting MAE is 0.8818 arrivals/hour vs. 1.2554 for the seasonal-naive same-hour-last-week baseline. The daily forecast view sums the output of the trained hourly forecast into dates.
- **Consultation duration model:** chronological split by service date (training on earlier dates; evaluation on later dates). In the included synthetic holdout, MAE is 2.260 minutes for HistGradientBoostingRegressor vs. 3.352 minutes for a department-median baseline.
- These results demonstrate code, pipeline, and evaluation on generated data only. They do **not** demonstrate accuracy on real patients or actual hospital queues.

## Main files

- `app.py` — interactive recording dashboard.
- `patient_duration_model.py` — deterministic patient-visit data generator and training/evaluation pipeline.
- `data/patient_consultations_synthetic.csv` — generated patient-visit data.
- `outputs/patient_duration_metrics.json` — split metadata and metrics.
- `outputs/patient_duration_holdout_predictions.csv` — held-out estimates and simulated outcomes.
- `models/patient_duration_model.joblib` — fitted interactive-demo model.
- `sehatflow_opd_traffic_ml/` — included traffic dataset, generator/trainer scripts, metrics, artifacts, and forecast outputs.
- `RECORDING_GUIDE.md` — recommended screen actions and voice-over.

## Important boundaries

This demo is intentionally isolated from real patient/queue tables and the public website. Do not use it for live staffing decisions, clinical triage, consultation promises, diagnosis, or medicine recommendations. To claim real operational value, SehatFlow would need suitable real-world data governance, a representative evaluation, privacy review, and clinical/operational validation.
