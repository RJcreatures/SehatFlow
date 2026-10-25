#!/usr/bin/env python3
"""Generate and train a synthetic-only consultation-duration demo model.

This predicts consultation duration for demonstration/planning. It is not a
clinical decision system and does not recommend diagnoses or medication.
"""
from __future__ import annotations
from pathlib import Path
import json
import warnings
import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "outputs"
MODEL_DIR = ROOT / "models"
DATA_PATH = DATA_DIR / "patient_consultations_synthetic.csv"
METRICS_PATH = OUT_DIR / "patient_duration_metrics.json"
MODEL_PATH = MODEL_DIR / "patient_duration_model.joblib"
HOLDOUT_PATH = OUT_DIR / "patient_duration_holdout_predictions.csv"
SEED = 20261024
DEPARTMENTS = {
    "General Medicine": 16.0,
    "Pediatrics": 18.0,
    "Orthopedics": 21.0,
    "Cardiology": 24.0,
    "Ophthalmology / Eye Clinic": 14.0,
    "ENT": 15.0,
    "Dermatology": 14.0,
}
REASONS = {
    "General Medicine": ["General symptoms", "Chronic condition review", "Routine follow-up"],
    "Pediatrics": ["Child health review", "General symptoms", "Follow-up review"],
    "Orthopedics": ["Injury assessment", "Mobility complaint", "Recovery follow-up"],
    "Cardiology": ["Heart health review", "Chronic condition review", "Follow-up review"],
    "Ophthalmology / Eye Clinic": ["Eye complaint", "Vision follow-up", "Routine review"],
    "ENT": ["ENT complaint", "Follow-up review", "General symptoms"],
    "Dermatology": ["Skin complaint", "Chronic condition review", "Routine follow-up"],
}
CATEGORICAL = ["department", "visit_reason_group", "visit_type"]
NUMERIC = ["age_years", "symptom_count", "has_previous_visit", "days_since_previous_visit", "previous_visit_duration_minutes"]
FEATURES = CATEGORICAL + NUMERIC
TARGET = "consultation_minutes"


def generate_dataset(path: Path = DATA_PATH, seed: int = SEED, n_patients: int = 4200) -> pd.DataFrame:
    """Create repeat visits with previous-visit history; all rows are simulated."""
    rng = np.random.default_rng(seed)
    start = pd.Timestamp("2024-01-01")
    end = pd.Timestamp("2026-10-23")
    rows: list[dict] = []
    dep_names = list(DEPARTMENTS)
    for pid in range(1, n_patients + 1):
        # Bias first encounter earlier so repeated-visit history is available.
        first_day = start + pd.Timedelta(days=int(rng.integers(0, 780)))
        age_start = int(rng.integers(0, 91))
        dept = str(rng.choice(dep_names, p=[.35, .12, .13, .09, .11, .10, .10]))
        n_visits = int(rng.integers(2, 8))
        prev_date = None
        prev_minutes = 0.0
        current_date = first_day
        for visit_no in range(n_visits):
            if current_date > end:
                break
            if visit_no > 0:
                current_date = current_date + pd.Timedelta(days=int(rng.integers(18, 155)))
                if current_date > end:
                    break
            age = min(100, age_start + int((current_date - first_day).days // 365.25))
            has_prev = prev_date is not None
            days_since = int((current_date - prev_date).days) if has_prev else 0
            visit_type = "Follow-up" if has_prev else "First visit"
            reason = str(rng.choice(REASONS[dept]))
            symptom_count = int(rng.integers(1, 5 if has_prev else 6))
            base = DEPARTMENTS[dept]
            reason_offset = {
                "General symptoms": 2.0, "Chronic condition review": 1.5,
                "Routine follow-up": -1.5, "Follow-up review": -1.5,
                "Injury assessment": 2.5, "Mobility complaint": 2.0,
                "Recovery follow-up": -1.0, "Heart health review": 2.0,
                "Child health review": 1.5, "Eye complaint": 1.5,
                "Vision follow-up": -1.0, "Routine review": -1.5,
                "ENT complaint": 1.5, "Skin complaint": 1.5,
            }.get(reason, 0.0)
            age_offset = 2.8 if age <= 5 else (2.7 if age >= 70 else (0.7 if age >= 60 else 0.0))
            prior_offset = (0.12 * (prev_minutes - base)) if has_prev else 0.0
            # This formula is a synthetic data-generating rule, not clinical evidence.
            minutes = base + (5.0 if not has_prev else -1.0) + 1.35 * (symptom_count - 1) + age_offset + reason_offset + prior_offset
            minutes += float(rng.normal(0, 2.8))
            minutes = float(np.clip(minutes, 5, 60))
            rows.append({
                "service_date": current_date.strftime("%Y-%m-%d"),
                "synthetic_patient_id": f"SIM-{pid:05d}",
                "visit_number": visit_no + 1,
                "department": dept,
                "age_years": age,
                "visit_reason_group": reason,
                "visit_type": visit_type,
                "symptom_count": symptom_count,
                "has_previous_visit": int(has_prev),
                "days_since_previous_visit": days_since,
                "previous_visit_duration_minutes": round(prev_minutes, 1) if has_prev else 0.0,
                "consultation_minutes": round(minutes, 1),
                "data_origin": "synthetic",
            })
            prev_date = current_date
            prev_minutes = minutes
    df = pd.DataFrame(rows).sort_values(["service_date", "synthetic_patient_id", "visit_number"]).reset_index(drop=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    return df


def build_model() -> Pipeline:
    preprocess = ColumnTransformer([
        ("categorical", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL),
        ("numeric", "passthrough", NUMERIC),
    ], remainder="drop", verbose_feature_names_out=False)
    reg = HistGradientBoostingRegressor(
        learning_rate=0.08,
        max_iter=140,
        max_leaf_nodes=20,
        min_samples_leaf=25,
        l2_regularization=1.0,
        random_state=SEED,
    )
    return Pipeline([("features", preprocess), ("model", reg)])


def _metrics(y: np.ndarray, pred: np.ndarray) -> dict:
    return {
        "mae_minutes": round(float(mean_absolute_error(y, pred)), 3),
        "rmse_minutes": round(float(np.sqrt(mean_squared_error(y, pred))), 3),
        "r2": round(float(r2_score(y, pred)), 4),
    }


def train_and_save(df: pd.DataFrame | None = None) -> tuple[Pipeline, dict]:
    if df is None:
        if not DATA_PATH.exists():
            df = generate_dataset()
        else:
            df = pd.read_csv(DATA_PATH)
    df = df.copy()
    df["service_date"] = pd.to_datetime(df["service_date"])
    df = df.sort_values("service_date").reset_index(drop=True)
    cutoff = df["service_date"].quantile(0.80)
    train = df[df["service_date"] < cutoff]
    test = df[df["service_date"] >= cutoff]
    X_train, y_train = train[FEATURES], train[TARGET].astype(float)
    X_test, y_test = test[FEATURES], test[TARGET].astype(float)

    evaluated_model = build_model()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        evaluated_model.fit(X_train, y_train)
    model_pred = np.clip(evaluated_model.predict(X_test), 5, 60)

    # A fair, easily explained baseline: historical median duration by department.
    dept_medians = train.groupby("department")[TARGET].median().to_dict()
    fallback_median = float(train[TARGET].median())
    baseline_pred = test["department"].map(dept_medians).fillna(fallback_median).to_numpy(dtype=float)
    model_metrics = _metrics(y_test.to_numpy(dtype=float), model_pred)
    baseline_metrics = _metrics(y_test.to_numpy(dtype=float), baseline_pred)
    holdout = test[["service_date", "synthetic_patient_id", "visit_number", "department", "age_years", "visit_reason_group", "visit_type", "symptom_count", "has_previous_visit", "days_since_previous_visit", "previous_visit_duration_minutes", TARGET]].copy()
    holdout["predicted_consultation_minutes"] = np.round(model_pred, 1)
    holdout["department_median_baseline_minutes"] = np.round(baseline_pred, 1)
    holdout["absolute_error_minutes"] = np.round(np.abs(holdout[TARGET].to_numpy(dtype=float) - model_pred), 1)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    holdout.to_csv(HOLDOUT_PATH, index=False)

    # Refit the artifact on all generated historical rows after untouched holdout evaluation.
    final_model = build_model()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        final_model.fit(df[FEATURES], df[TARGET].astype(float))
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(final_model, MODEL_PATH)
    result = {
        "title": "SehatFlow synthetic patient consultation duration demo",
        "data_origin": "synthetic",
        "warning": "Synthetic consultation records. Metrics are not evidence of real clinical workflow performance. This model estimates consultation duration only and does not recommend diagnosis or medicine.",
        "seed": SEED,
        "records": int(len(df)),
        "unique_synthetic_patients": int(df["synthetic_patient_id"].nunique()),
        "departments": sorted(df["department"].unique().tolist()),
        "date_start": df["service_date"].min().strftime("%Y-%m-%d"),
        "date_end": df["service_date"].max().strftime("%Y-%m-%d"),
        "split_method": "Chronological holdout: earliest 80% of dates for training; latest 20% of dates for evaluation.",
        "cutoff_date": pd.Timestamp(cutoff).strftime("%Y-%m-%d"),
        "training_rows": int(len(train)),
        "test_rows": int(len(test)),
        "model": "HistGradientBoostingRegressor with one-hot encoded categorical inputs",
        "features": FEATURES,
        "target": "consultation_minutes (simulated doctor consultation duration; not total waiting time)",
        "model_metrics": model_metrics,
        "department_median_baseline_metrics": baseline_metrics,
        "model_mae_improvement_vs_baseline_percent": round((baseline_metrics["mae_minutes"] - model_metrics["mae_minutes"]) / baseline_metrics["mae_minutes"] * 100, 1) if baseline_metrics["mae_minutes"] else None,
        "model_artifact": str(MODEL_PATH.name),
        "holdout_predictions_file": str(HOLDOUT_PATH.name),
        "target_generation_method": "Simulated durations use configurable department-level assumptions, visit type, age band, symptom-count effect, broad reason-group offset, previous duration for returning visits, and seeded random noise. This is a teaching/demo mechanism, not a clinically validated duration rule.",
    }
    METRICS_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return final_model, result


def load_assets() -> tuple[pd.DataFrame, dict, Pipeline]:
    if not DATA_PATH.exists():
        generate_dataset()
    if not METRICS_PATH.exists() or not MODEL_PATH.exists():
        train_and_save()
    df = pd.read_csv(DATA_PATH)
    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    model = joblib.load(MODEL_PATH)
    return df, metrics, model


if __name__ == "__main__":
    generated = generate_dataset()
    _, metrics = train_and_save(generated)
    print(json.dumps(metrics, indent=2))
