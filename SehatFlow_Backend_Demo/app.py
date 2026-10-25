from __future__ import annotations
from pathlib import Path
from datetime import date, timedelta
import json
import subprocess
import sys
import time

import joblib
import numpy as np
import pandas as pd
import streamlit as st

ROOT = Path(__file__).resolve().parent
TRAFFIC_ROOT = ROOT / "sehatflow_opd_traffic_ml"
TRAFFIC_DATA = TRAFFIC_ROOT / "data"
TRAFFIC_OUT = TRAFFIC_ROOT / "outputs"
TRAFFIC_HOURLY_PATH = TRAFFIC_DATA / "opd_traffic_hourly.csv"
TRAFFIC_DAILY_PATH = TRAFFIC_DATA / "opd_traffic_daily.csv"
TRAFFIC_METRICS_PATH = TRAFFIC_OUT / "forecast_metrics_overall.csv"
TRAFFIC_FORECAST_PATH = TRAFFIC_OUT / "forecast_next_7_days.csv"
TRAFFIC_SUMMARY_PATH = TRAFFIC_OUT / "forecast_summary.json"
PATIENT_DATA_PATH = ROOT / "data" / "patient_consultations_synthetic.csv"
PATIENT_METRICS_PATH = ROOT / "outputs" / "patient_duration_metrics.json"
PATIENT_HOLDOUT_PATH = ROOT / "outputs" / "patient_duration_holdout_predictions.csv"
PATIENT_MODEL_PATH = ROOT / "models" / "patient_duration_model.joblib"

sys.path.insert(0, str(ROOT))
from patient_duration_model import (  # noqa: E402
    FEATURES as PATIENT_FEATURES,
    REASONS,
    train_and_save as train_patient_model,
)

st.set_page_config(
    page_title="SehatFlow | ML Demo Lab",
    page_icon="S",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
:root { --sf-ink:#142b2a; --sf-muted:#5c706e; --sf-accent:#0a766e; --sf-soft:#eaf6f3; }
.stApp { background: #f6f9f8; color: var(--sf-ink); }
[data-testid="stHeader"] { background: rgba(246,249,248,0.88); }
[data-testid="stSidebar"] { background: #ffffff; border-right: 1px solid #e2ece9; }
h1, h2, h3 { color: var(--sf-ink); letter-spacing: -0.025em; }
.hero { background: linear-gradient(115deg,#123d3b 0%,#0d756b 100%); padding: 1.35rem 1.5rem; border-radius: 18px; color: #fff; margin: .25rem 0 1rem; }
.hero h1 { color:#fff; margin:0; font-size:2.2rem; }
.hero p { color:#d8efea; margin:.35rem 0 0; font-size:1.02rem; }
.pill { display:inline-block; padding:.28rem .6rem; border-radius:999px; font-weight:700; font-size:.72rem; letter-spacing:.06em; background:#fff1d6; color:#734b00; margin-bottom:.7rem; }
.step-card { background:white; border:1px solid #e1ebe8; border-radius:13px; padding:14px 16px; min-height:104px; }
.step-card .n { font-size:.72rem; color:#0a766e; font-weight:800; letter-spacing:.07em; }
.step-card .t { font-weight:750; color:#142b2a; margin:.28rem 0; }
.step-card .d { color:#5c706e; font-size:.9rem; line-height:1.4; }
.small-note { color:#647876; font-size:.84rem; }
[data-testid="stMetric"] { background:#fff; border:1px solid #e2ece9; padding:14px 16px; border-radius:13px; }
[data-testid="stMetricLabel"] { color:#617572; }
[data-testid="stMetricValue"] { color:#123d3b; }
.stButton > button[kind="primary"] { background:#0a766e; border-color:#0a766e; }
hr { border-color:#e0eae7; }
</style>
""", unsafe_allow_html=True)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@st.cache_data(show_spinner="Loading the synthetic OPD datasets…")
def load_traffic_daily() -> pd.DataFrame:
    df = pd.read_csv(TRAFFIC_DAILY_PATH)
    df["service_date"] = pd.to_datetime(df["service_date"], errors="coerce")
    df["arrivals_count"] = pd.to_numeric(df["arrivals_count"], errors="coerce").fillna(0)
    return df


@st.cache_data(show_spinner="Preparing the model-input example…")
def load_traffic_feature_example() -> tuple[pd.DataFrame, dict]:
    df = pd.read_csv(TRAFFIC_HOURLY_PATH)
    df["_ts"] = pd.to_datetime(df["observed_at"], utc=True).dt.tz_convert("Asia/Kolkata")
    df = df.sort_values(["department_code", "_ts"]).reset_index(drop=True)
    grouped = df.groupby("department_code", sort=False)["arrivals_count"]
    df["lag_1"] = grouped.shift(1)
    df["lag_24"] = grouped.shift(24)
    df["lag_168"] = grouped.shift(168)
    df["rolling_mean_24"] = grouped.transform(lambda s: s.shift(1).rolling(24, min_periods=24).mean())
    df["rolling_mean_168"] = grouped.transform(lambda s: s.shift(1).rolling(168, min_periods=168).mean())
    summary = {
        "rows": int(len(df)),
        "start": df["_ts"].min().strftime("%Y-%m-%d"),
        "end": df["_ts"].max().strftime("%Y-%m-%d"),
        "departments": int(df["department_code"].nunique()),
        "arrivals": int(df["arrivals_count"].sum()),
    }
    valid = df[(df["clinic_open"].astype(bool)) & (df["arrivals_count"] > 0) & df["rolling_mean_168"].notna()]
    # Select a compact set of informative recent examples rather than closed-hour zeros.
    recent_timestamps = sorted(valid["_ts"].drop_duplicates().tail(2))
    example = valid[valid["_ts"].isin(recent_timestamps)][[
        "observed_at", "department_name", "arrivals_count", "lag_1", "lag_24",
        "lag_168", "rolling_mean_24", "rolling_mean_168", "is_weekend",
    ]].copy()
    raw_example = df[(df["clinic_open"].astype(bool)) & (df["arrivals_count"] > 0)].tail(8)[[
        "observed_at", "department_name", "arrivals_count", "completed_count", "clinic_open", "doctors_on_duty", "data_origin"
    ]].copy()
    raw_example = raw_example.rename(columns={
        "observed_at": "observed_at", "department_name": "department_name", "arrivals_count": "arrivals_count",
        "completed_count": "completed_count", "clinic_open": "clinic_open", "doctors_on_duty": "doctors_on_duty", "data_origin": "data_origin"
    })
    example = example.rename(columns={
        "observed_at": "Timestamp", "department_name": "Department", "arrivals_count": "Actual arrivals",
        "lag_1": "Previous hour", "lag_24": "Same hour yesterday", "lag_168": "Same hour last week",
        "rolling_mean_24": "Previous 24h mean", "rolling_mean_168": "Previous 168h mean", "is_weekend": "Weekend",
    })
    numeric_cols = ["Previous hour", "Same hour yesterday", "Same hour last week", "Previous 24h mean", "Previous 168h mean"]
    example[numeric_cols] = example[numeric_cols].round(2)
    return example, raw_example, summary


@st.cache_data(show_spinner=False)
def load_patient_data() -> pd.DataFrame:
    df = pd.read_csv(PATIENT_DATA_PATH)
    df["service_date"] = pd.to_datetime(df["service_date"], errors="coerce")
    return df


def model_names(series: pd.Series) -> pd.Series:
    mapping = {
        "hist_gradient_boosting": "Histogram Gradient Boosting",
        "ridge_regression": "Ridge Regression",
        "seasonal_naive_168h": "Seasonal-naive baseline (same hour last week)",
    }
    return series.map(mapping).fillna(series)


def traffic_forecast_daily() -> pd.DataFrame:
    forecast = pd.read_csv(TRAFFIC_FORECAST_PATH)
    forecast["forecast_at"] = pd.to_datetime(forecast["forecast_at"], utc=True).dt.tz_convert("Asia/Kolkata")
    forecast["forecast_date"] = forecast["forecast_at"].dt.date
    # Sum department-hour estimates into an all-department daily estimate.
    out = forecast.groupby("forecast_date", as_index=False).agg(
        predicted_arrivals=("predicted_arrivals", "sum"),
        open_department_hours=("clinic_open", "sum"),
    )
    out["clinics_open"] = out["open_department_hours"] > 0
    out["predicted_arrivals"] = out["predicted_arrivals"].round(0).astype(int)
    out["forecast_date"] = pd.to_datetime(out["forecast_date"])
    return out


def top_step_cards() -> None:
    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown('<div class="step-card"><div class="n">STEP 01</div><div class="t">Synthetic records</div><div class="d">Inspect the generated data and the exact fields used as model inputs.</div></div>', unsafe_allow_html=True)
    with c2:
        st.markdown('<div class="step-card"><div class="n">STEP 02</div><div class="t">Train and evaluate</div><div class="d">Use an earlier period for training and a later, unseen period for testing.</div></div>', unsafe_allow_html=True)
    with c3:
        st.markdown('<div class="step-card"><div class="n">STEP 03</div><div class="t">Show predictions</div><div class="d">Review model estimates alongside baselines and held-out outcomes.</div></div>', unsafe_allow_html=True)


# Sidebar is also a persistent, unmistakable label for screen recording.
with st.sidebar:
    st.markdown("## SehatFlow")
    st.caption("Backend ML demonstration workspace")
    st.warning("SYNTHETIC DEMO DATA ONLY", icon="⚠️")
    st.markdown("**Two model demonstrations**")
    st.markdown("1. Aggregate OPD arrivals by day\n2. Consultation duration per visit")
    st.divider()
    st.markdown("**Scope**")
    st.caption("Local-only demo. It does not connect to the deployed SehatFlow website or Supabase.")
    st.caption("No real patient records are included.")

st.markdown('''<div class="hero">
  <div class="pill">SYNTHETIC DATA · REPRODUCIBLE DEMO</div>
  <h1>SehatFlow ML Demo Lab</h1>
  <p>From generated records → trained models → measurable predictions. Built for a clear, judge-friendly walkthrough.</p>
</div>''', unsafe_allow_html=True)
top_step_cards()
st.write("")

traffic_tab, patient_tab = st.tabs(["01 · Daily traffic forecast", "02 · Patient consultation time"])

with traffic_tab:
    summary = read_json(TRAFFIC_SUMMARY_PATH)
    daily = load_traffic_daily()
    hourly_example, raw_example, hourly_summary = load_traffic_feature_example()
    metrics_df = pd.read_csv(TRAFFIC_METRICS_PATH)
    forecast_daily = traffic_forecast_daily()

    st.subheader("1. Show the size and shape of the generated data")
    k1, k2, k3, k4 = st.columns(4)
    k1.metric("Hourly aggregate rows", f"{summary['hourly_rows']:,}")
    k2.metric("Daily department rows", f"{len(daily):,}")
    k3.metric("Simulation period", f"{(pd.to_datetime(summary['dataset_end']).date() - pd.to_datetime(summary['dataset_start']).date()).days + 1:,} days")
    k4.metric("Generated arrivals", f"{summary['total_synthetic_arrivals']:,}")
    st.caption(f"Departments: {summary['department_count']} · Dates: {summary['dataset_start'][:10]} to {summary['dataset_end'][:10]} · Seed: 20261024. An arrival is a simulated visit count, not a unique person. All timestamps are simulated.")

    with st.expander("Inspect raw hourly records and engineered model inputs", expanded=True):
        st.markdown("**Raw data sample** — each row is an hour × department. The arrival count is the target the traffic model learns to predict.")
        st.dataframe(raw_example, hide_index=True, use_container_width=True)
        st.markdown("**Engineered input sample** — the algorithm adds recent history and calendar patterns. These lag values are based on earlier observations for the same department; they are not future data.")
        st.dataframe(hourly_example, hide_index=True, use_container_width=True)
        st.markdown("**Features sent to the model:** hour/day/month and seasonal calendar encodings, clinic schedule, department category, previous-hour / 24-hour / 168-hour arrival lags, and rolling 24-/168-hour means.")

    st.subheader("2. Show the evaluation that selected the model")
    display_metrics = metrics_df.copy()
    display_metrics["model"] = model_names(display_metrics["model"])
    display_metrics = display_metrics.rename(columns={"model":"Model", "test_rows":"Held-out rows", "mae":"MAE (arrivals/hour)", "rmse":"RMSE (arrivals/hour)", "wape_percent":"WAPE (%)", "r2":"R²", "evaluation":"Evaluation mode"})
    st.dataframe(display_metrics[["Model", "Held-out rows", "MAE (arrivals/hour)", "RMSE (arrivals/hour)", "WAPE (%)", "R²"]].round(4), hide_index=True, use_container_width=True)
    hgb_row = metrics_df.loc[metrics_df["model"].eq("hist_gradient_boosting")].iloc[0]
    baseline_row = metrics_df.loc[metrics_df["model"].eq("seasonal_naive_168h")].iloc[0]
    improvement = (baseline_row["mae"] - hgb_row["mae"]) / baseline_row["mae"] * 100
    a, b, c = st.columns(3)
    a.metric("Selected model", "Gradient boosting")
    b.metric("Holdout MAE", f"{hgb_row['mae']:.4f} arrivals/hour")
    c.metric("MAE improvement vs weekly baseline", f"{improvement:.1f}%")
    st.caption("Evaluation: chronological last-90-day holdout with rolling one-hour-ahead predictions and previously observed test-period lags. This is not a seven-day-ahead backtest. These results are from synthetic data only; WAPE is elevated partly because closed hours have zero arrivals.")

    with st.expander("Retrain the daily-traffic forecasting models on this machine", expanded=False):
        st.write("This reruns the included training script on the full synthetic hourly dataset, refreshes the holdout metrics, and rebuilds the next-seven-day demo forecast. It does not access Supabase or the deployed website.")
        if st.button("Run traffic model training", type="primary", key="train_traffic"):
            with st.spinner("Engineering lag features, training models, and evaluating the holdout…"):
                try:
                    proc = subprocess.run(
                        [sys.executable, "src/train_forecast.py"],
                        cwd=str(TRAFFIC_ROOT), capture_output=True, text=True, timeout=900,
                    )
                    st.session_state["traffic_train_returncode"] = proc.returncode
                    st.session_state["traffic_train_log"] = (proc.stdout + "\n" + proc.stderr)[-5000:]
                    st.session_state["traffic_train_finished_at"] = time.strftime("%H:%M:%S")
                    st.cache_data.clear()
                    if proc.returncode == 0:
                        st.session_state["traffic_train_success"] = True
                    else:
                        st.session_state["traffic_train_success"] = False
                except Exception as exc:
                    st.session_state["traffic_train_success"] = False
                    st.session_state["traffic_train_log"] = repr(exc)
            st.rerun()
        if st.session_state.get("traffic_train_success"):
            st.success("Training completed. The table and seven-day forecast above use the refreshed output files.")
        elif st.session_state.get("traffic_train_success") is False:
            st.error("Training did not complete. Review the log below.")
        if "traffic_train_log" in st.session_state:
            st.caption(f"Last run: {st.session_state.get('traffic_train_finished_at', 'unknown')} · exit code {st.session_state.get('traffic_train_returncode', 'unknown')}")
            st.code(st.session_state["traffic_train_log"], language="text")

    st.subheader("3. Turn the model output into a daily traffic view")
    left, right = st.columns([1.4, 1])
    with left:
        st.markdown("**Historical simulated arrivals**")
        department_options = ["All departments"] + sorted(daily["department_name"].dropna().unique().tolist())
        chosen_dept = st.selectbox("Department", department_options, key="traffic_historical_department")
        max_date = daily["service_date"].max().date()
        min_date = daily["service_date"].min().date()
        default_start = max(min_date, max_date - timedelta(days=59))
        selected_dates = st.date_input("Historical date window", value=(default_start, max_date), min_value=min_date, max_value=max_date, key="traffic_historical_window")
        if isinstance(selected_dates, tuple) and len(selected_dates) == 2:
            start_date, end_date = selected_dates
        else:
            start_date = end_date = selected_dates
        hist = daily[(daily["service_date"].dt.date >= start_date) & (daily["service_date"].dt.date <= end_date)].copy()
        if chosen_dept != "All departments":
            hist = hist[hist["department_name"].eq(chosen_dept)]
        chart_data = hist.groupby("service_date", as_index=False)["arrivals_count"].sum().sort_values("service_date")
        if not chart_data.empty:
            st.line_chart(chart_data.set_index("service_date"), y="arrivals_count", use_container_width=True)
        st.caption("Historical line shows generated arrivals, not real hospital attendance.")
    with right:
        st.markdown("**Next 7 days — model output**")
        st.caption("Daily totals are aggregated from the included hourly forecasts across all seven departments.")
        fc_chart = forecast_daily.rename(columns={"forecast_date":"Date", "predicted_arrivals":"Predicted arrivals"}).set_index("Date")
        st.bar_chart(fc_chart[["Predicted arrivals"]], use_container_width=True)
        open_days = forecast_daily[forecast_daily["clinics_open"]]
        lowest = open_days.loc[open_days["predicted_arrivals"].idxmin()]
        highest = open_days.loc[open_days["predicted_arrivals"].idxmax()]
        x1, x2 = st.columns(2)
        x1.metric("Lowest estimate on an open day", lowest["forecast_date"].strftime("%a, %d %b"), f"{int(lowest['predicted_arrivals']):,} simulated arrivals")
        x2.metric("Highest estimate on an open day", highest["forecast_date"].strftime("%a, %d %b"), f"{int(highest['predicted_arrivals']):,} simulated arrivals")
        display_forecast = forecast_daily.rename(columns={"forecast_date":"Date", "predicted_arrivals":"Predicted arrivals", "clinics_open":"Any clinic open"})
        display_forecast["Date"] = display_forecast["Date"].dt.strftime("%a, %d %b %Y")
        st.dataframe(display_forecast[["Date", "Predicted arrivals", "Any clinic open"]], hide_index=True, use_container_width=True)
    st.info("Presentation-safe wording: ‘The model estimates relative OPD traffic from synthetic arrival patterns. Compare only days when clinics are open; a lower estimate is not a guaranteed quiet day. This forecast is not connected to live queue data.’")

with patient_tab:
    patient_df = load_patient_data()
    patient_metrics = read_json(PATIENT_METRICS_PATH)
    patient_model = joblib.load(PATIENT_MODEL_PATH)
    holdout = pd.read_csv(PATIENT_HOLDOUT_PATH)

    st.subheader("1. Show the synthetic patient-visit history")
    p1, p2, p3, p4 = st.columns(4)
    p1.metric("Synthetic visit records", f"{patient_metrics['records']:,}")
    p2.metric("Synthetic patient profiles", f"{patient_metrics['unique_synthetic_patients']:,}")
    p3.metric("Model features", f"{len(patient_metrics['features'])}")
    p4.metric("Held-out records", f"{patient_metrics['test_rows']:,}")
    st.caption(f"Dates: {patient_metrics['date_start']} to {patient_metrics['date_end']} · Seed: {patient_metrics['seed']} · All patient IDs and visit records are generated for this demo.")

    with st.expander("Inspect the patient dataset and model inputs", expanded=True):
        st.markdown("**Sample synthetic encounters** — each row records a simulated consultation and, for return visits, the previous consultation duration and time since that visit.")
        preview_cols = ["service_date", "synthetic_patient_id", "visit_number", "department", "age_years", "visit_reason_group", "visit_type", "symptom_count", "previous_visit_duration_minutes", "consultation_minutes"]
        st.dataframe(patient_df[preview_cols].head(10), hide_index=True, use_container_width=True)
        st.markdown("**Inputs used by the duration model:** department, broad reason group, first-visit/follow-up flag, age, symptom count, whether a prior visit exists, days since the prior visit, and the prior consultation’s duration.")
        st.markdown("**What the model predicts:** estimated minutes spent in the consultation. It does not predict the queue’s total waiting time, diagnose a condition, or recommend medication.")

    st.subheader("2. Show an honest held-out test")
    model_score = patient_metrics["model_metrics"]
    base_score = patient_metrics["department_median_baseline_metrics"]
    pc1, pc2, pc3 = st.columns(3)
    pc1.metric("Model: holdout MAE", f"{model_score['mae_minutes']:.2f} min")
    pc2.metric("Department-median baseline MAE", f"{base_score['mae_minutes']:.2f} min")
    pc3.metric("MAE improvement vs baseline", f"{patient_metrics['model_mae_improvement_vs_baseline_percent']:.1f}%")
    st.caption(f"Chronological split: training dates before {patient_metrics['cutoff_date']}; evaluation on later dates. The model was tested on {patient_metrics['test_rows']:,} records not used to fit the evaluation model. The reported final model artifact is then refit on all synthetic history for the interactive demo.")
    score_df = pd.DataFrame([
        {"Method":"HistGradientBoostingRegressor", "MAE (minutes)":model_score["mae_minutes"], "RMSE (minutes)":model_score["rmse_minutes"], "R²":model_score["r2"]},
        {"Method":"Department median baseline", "MAE (minutes)":base_score["mae_minutes"], "RMSE (minutes)":base_score["rmse_minutes"], "R²":base_score["r2"]},
    ])
    st.dataframe(score_df, hide_index=True, use_container_width=True)

    sample_test = holdout.sort_values("absolute_error_minutes").iloc[[len(holdout) // 2]].iloc[0]
    t1, t2, t3 = st.columns(3)
    t1.metric("Example held-out estimate", f"{sample_test['predicted_consultation_minutes']:.1f} min")
    t2.metric("Simulated duration", f"{sample_test['consultation_minutes']:.1f} min")
    t3.metric("Absolute error", f"{sample_test['absolute_error_minutes']:.1f} min")
    st.caption(f"Example test record: {sample_test['synthetic_patient_id']} · {sample_test['department']} · {sample_test['service_date']} · {sample_test['visit_type']}. The recorded duration is synthetic ground truth; it is shown to demonstrate how a held-out estimate is checked.")

    show_holdout = holdout.sort_values("service_date").tail(12).copy()
    show_holdout = show_holdout.rename(columns={
        "service_date":"Date", "synthetic_patient_id":"Synthetic ID", "department":"Department",
        "visit_type":"Visit type", "consultation_minutes":"Simulated duration (min)",
        "predicted_consultation_minutes":"Model estimate (min)", "absolute_error_minutes":"Absolute error (min)",
    })
    st.markdown("**Examples across the held-out period**")
    st.dataframe(show_holdout[["Date", "Synthetic ID", "Department", "Visit type", "Simulated duration (min)", "Model estimate (min)", "Absolute error (min)"]], hide_index=True, use_container_width=True)

    with st.expander("Retrain the consultation-duration model", expanded=False):
        st.write("Retrains the included model using the same chronological evaluation procedure, rewrites the metrics and holdout predictions, then saves a demo model trained on all synthetic history.")
        if st.button("Run patient-duration model training", type="primary", key="train_patient"):
            with st.spinner("Training on synthetic visit history and checking the later-date holdout…"):
                try:
                    _, newly_reported = train_patient_model(patient_df.drop(columns=[], errors="ignore"))
                    st.session_state["patient_train_success"] = True
                    st.session_state["patient_train_report"] = newly_reported
                    st.cache_data.clear()
                except Exception as exc:
                    st.session_state["patient_train_success"] = False
                    st.session_state["patient_train_error"] = repr(exc)
            st.rerun()
        if st.session_state.get("patient_train_success"):
            st.success("Training completed. Reloaded model and metrics are available in this tab.")
        elif "patient_train_error" in st.session_state:
            st.error(st.session_state["patient_train_error"])

    st.subheader("3. Use a previous visit to estimate the next consultation")
    st.markdown("Choose a synthetic profile to show its repeat-visit history, then estimate consultation time for a sample next visit. All details below are fictional.")
    patient_counts = patient_df.groupby("synthetic_patient_id").size()
    repeated_ids = patient_counts[patient_counts >= 2].index.tolist()[:100]
    # Choose an uncomplicated but repeat-visit example by default.
    default_patient_idx = min(8, len(repeated_ids) - 1) if repeated_ids else 0
    chosen_pid = st.selectbox("Synthetic patient profile", repeated_ids, index=default_patient_idx, key="duration_profile")
    history = patient_df[patient_df["synthetic_patient_id"].eq(chosen_pid)].sort_values("service_date").copy()
    latest = history.iloc[-1]
    history_show = history[["service_date", "visit_number", "department", "visit_type", "visit_reason_group", "consultation_minutes"]].rename(columns={
        "service_date":"Visit date", "visit_number":"Visit #", "department":"Department", "visit_type":"Type",
        "visit_reason_group":"Reason group", "consultation_minutes":"Consultation duration (min)"
    })
    st.markdown(f"**History for {chosen_pid}** · {len(history)} recorded synthetic visits")
    st.dataframe(history_show, hide_index=True, use_container_width=True)
    st.caption(f"The most recent simulated consultation lasted {latest['consultation_minutes']:.1f} minutes. The form below uses this as previous-visit context for a hypothetical follow-up; it does not claim the next visit has happened.")

    with st.form("duration_prediction_form"):
        c1, c2, c3 = st.columns(3)
        with c1:
            dep_options = list(REASONS.keys())
            dept_default = dep_options.index(str(latest["department"])) if str(latest["department"]) in dep_options else 0
            chosen_department = st.selectbox("Department", dep_options, index=dept_default)
            age = st.slider("Patient age", min_value=0, max_value=100, value=int(latest["age_years"]))
            reason_options = REASONS[chosen_department]
            default_reason = str(latest["visit_reason_group"])
            reason_idx = reason_options.index(default_reason) if default_reason in reason_options else 0
            reason = st.selectbox("Broad visit reason", reason_options, index=reason_idx)
        with c2:
            visit_type = st.selectbox("Visit type", ["First visit", "Follow-up"], index=1)
            symptoms = st.slider("Number of reported symptoms", min_value=1, max_value=5, value=int(np.clip(latest["symptom_count"], 1, 5)))
            days_gap = st.slider("Days since previous visit", min_value=1, max_value=365, value=30)
        with c3:
            previous_minutes = st.slider("Previous consultation duration (min)", min_value=5, max_value=60, value=int(np.clip(round(latest["consultation_minutes"]), 5, 60)))
            st.markdown("<div class='small-note'>For a first visit, previous-visit fields are ignored by the model input builder.</div>", unsafe_allow_html=True)
        estimate_clicked = st.form_submit_button("Estimate consultation time", type="primary")

    if estimate_clicked:
        has_previous = int(visit_type == "Follow-up")
        input_row = pd.DataFrame([{
            "department": chosen_department,
            "visit_reason_group": reason,
            "visit_type": visit_type,
            "age_years": int(age),
            "symptom_count": int(symptoms),
            "has_previous_visit": has_previous,
            "days_since_previous_visit": int(days_gap) if has_previous else 0,
            "previous_visit_duration_minutes": float(previous_minutes) if has_previous else 0.0,
        }], columns=PATIENT_FEATURES)
        estimate = float(np.clip(patient_model.predict(input_row)[0], 5, 60))
        st.session_state["last_duration_prediction"] = {
            "estimate": estimate, "department": chosen_department, "age": int(age), "visit_type": visit_type,
            "reason": reason, "symptoms": int(symptoms), "days_gap": int(days_gap) if has_previous else 0,
            "previous_minutes": float(previous_minutes) if has_previous else 0.0,
        }

    if "last_duration_prediction" in st.session_state:
        pred = st.session_state["last_duration_prediction"]
        st.success(f"Estimated consultation duration: about {pred['estimate']:.0f} minutes")
        st.write(f"Input summary: {pred['department']} · age {pred['age']} · {pred['visit_type'].lower()} · {pred['symptoms']} symptom(s) · reason group: {pred['reason']}.")
        st.caption("This is a model estimate of consultation duration, not a diagnosis, medicine recommendation, triage decision, or a promise of total queue waiting time.")

st.divider()
st.caption("SehatFlow HackCache demo · reproducible synthetic datasets · local-only ML showcase · not validated for real hospital operations")
