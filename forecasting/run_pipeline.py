#!/usr/bin/env python3
"""
SehatFlow Phase 8 — synthetic OPD demand generation, baseline, and model training.

Produces deterministic artifacts under data/forecasting/ for the staff dashboard.
Uses only synthetic aggregate traffic — never real patient or queue records.
"""

from __future__ import annotations

import csv
import json
import math
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from departments import DEPARTMENT_CODES, DEPARTMENTS

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "forecasting"
PUBLIC_DIR = ROOT / "public" / "forecasting"
SRC_BUNDLE = ROOT / "src" / "domain" / "forecasting" / "forecast_bundle.json"

SEED = 20261024
HISTORY_DAYS = 120
HOLDOUT_DAYS = 14
HORIZON_HOURS = 24
VERSION = "forecast-v1.1"
GRANULARITY = "hourly"
DAY_NAMES = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
)

BASE_RATE = {
    "general_medicine": 6.5,
    "pediatrics": 4.2,
    "womens_health": 3.8,
    "orthopedics": 3.4,
    "ent": 2.6,
    "ophthalmology": 2.4,
    "dermatology": 2.2,
}


@dataclass
class Metrics:
    mae: float
    rmse: float
    n: int


def mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean(np.abs(y_true - y_pred)))


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def metrics_pair(y_true: np.ndarray, y_pred: np.ndarray) -> Metrics:
    return Metrics(mae=mae(y_true, y_pred), rmse=rmse(y_true, y_pred), n=int(len(y_true)))


def _weekday_summary(
    daily_totals: dict[str, float],
) -> dict:
    """Rank weekdays by average daily arrivals (simple seasonal day model)."""
    by_dow: dict[int, list[float]] = {d: [] for d in range(7)}
    for service_date, total in daily_totals.items():
        dow = date.fromisoformat(service_date).weekday()
        by_dow[dow].append(float(total))

    days = []
    for dow in range(7):
        values = by_dow[dow]
        avg = float(np.mean(values)) if values else 0.0
        days.append(
            {
                "dow": dow,
                "day_name": DAY_NAMES[dow],
                "avg_daily_arrivals": round(avg, 1),
                "sample_days": len(values),
            }
        )
    ranked = sorted(days, key=lambda row: (-row["avg_daily_arrivals"], row["dow"]))
    for rank, row in enumerate(ranked, start=1):
        row["rank"] = rank
    # Restore Monday→Sunday order for display; ranks stay attached.
    days_ordered = sorted(days, key=lambda row: row["dow"])
    busiest = ranked[0]
    least = ranked[-1]
    return {
        "days": days_ordered,
        "busiest": {
            "dow": busiest["dow"],
            "day_name": busiest["day_name"],
            "avg_daily_arrivals": busiest["avg_daily_arrivals"],
        },
        "least_busy": {
            "dow": least["dow"],
            "day_name": least["day_name"],
            "avg_daily_arrivals": least["avg_daily_arrivals"],
        },
    }


def build_simple_week_guide(history: list[dict]) -> dict:
    """
    Basic readable model: average total arrivals per weekday from synthetic history.
    No machine learning — just historical weekday averages so staff can see
    which days are typically busiest or quietest.
    """
    overall_daily: dict[str, float] = {}
    per_dept_daily: dict[str, dict[str, float]] = {
        code: {} for code in DEPARTMENT_CODES
    }
    for row in history:
        service_date = row["service_date"]
        arrivals = float(row["arrivals"])
        overall_daily[service_date] = overall_daily.get(service_date, 0.0) + arrivals
        dept = row["department_code"]
        per_dept_daily[dept][service_date] = (
            per_dept_daily[dept].get(service_date, 0.0) + arrivals
        )

    overall = _weekday_summary(overall_daily)
    by_department = {
        code: _weekday_summary(per_dept_daily[code]) for code in DEPARTMENT_CODES
    }
    return {
        "label": "Synthetic demonstration data — simple weekday averages, not live hospital activity.",
        "method": (
            "Average total patient arrivals per weekday from the full synthetic "
            "historical period. This is a basic seasonal day model (no neural net)."
        ),
        "units": "patients per day",
        "history_days": HISTORY_DAYS,
        "overall": overall,
        "by_department": by_department,
    }


def generate_history(rng: np.random.Generator, end_day: date) -> list[dict]:
    start_day = end_day - timedelta(days=HISTORY_DAYS - 1)
    rows: list[dict] = []
    day = start_day
    day_index = 0
    while day <= end_day:
        dow = day.weekday()
        is_weekend = dow >= 5
        for hour in range(24):
            if 8 <= hour <= 17:
                diurnal = 1.0 + 0.55 * math.sin((hour - 8) / 9 * math.pi)
            elif 7 <= hour <= 19:
                diurnal = 0.35
            else:
                diurnal = 0.05
            weekend_factor = 0.55 if is_weekend else 1.0
            dow_factor = {0: 1.15, 1: 1.1, 2: 1.0, 3: 0.98, 4: 0.9, 5: 1.0, 6: 1.0}[
                dow
            ]
            trend = 1.0 + 0.08 * (day_index / max(HISTORY_DAYS - 1, 1))
            surge = 1.55 if rng.random() < 0.04 else 1.0
            for code in DEPARTMENT_CODES:
                lam = (
                    BASE_RATE[code]
                    * diurnal
                    * weekend_factor
                    * dow_factor
                    * trend
                    * surge
                )
                if code == "pediatrics" and 9 <= hour <= 12:
                    lam *= 1.25
                if code == "orthopedics" and 14 <= hour <= 17:
                    lam *= 1.2
                count = int(rng.poisson(max(lam, 0.01)))
                rows.append(
                    {
                        "timestamp_utc": datetime(
                            day.year,
                            day.month,
                            day.day,
                            hour,
                            tzinfo=timezone.utc,
                        )
                        .isoformat()
                        .replace("+00:00", "Z"),
                        "department_code": code,
                        "arrivals": count,
                        "hour": hour,
                        "dow": dow,
                        "is_weekend": int(is_weekend),
                        "service_date": day.isoformat(),
                    }
                )
        day += timedelta(days=1)
        day_index += 1
    return rows


def one_hot_dept(code: str) -> list[float]:
    return [1.0 if code == c else 0.0 for c in DEPARTMENT_CODES]


def feature_row(row: dict) -> list[float]:
    hour = float(row["hour"])
    dow = float(row["dow"])
    is_weekend = float(row["is_weekend"])
    morning = 1.0 if 8 <= hour <= 11 else 0.0
    afternoon = 1.0 if 14 <= hour <= 17 else 0.0
    return one_hot_dept(row["department_code"]) + [
        math.sin(2 * math.pi * hour / 24),
        math.cos(2 * math.pi * hour / 24),
        math.sin(2 * math.pi * dow / 7),
        math.cos(2 * math.pi * dow / 7),
        is_weekend,
        morning,
        afternoon,
        morning * is_weekend,
        afternoon * is_weekend,
    ]


def fit_ridge(x: np.ndarray, y: np.ndarray, alpha: float = 2.0) -> np.ndarray:
    """Closed-form ridge: (X'X + αI)^-1 X'y with intercept column."""
    ones = np.ones((x.shape[0], 1))
    xb = np.hstack([ones, x])
    eye = np.eye(xb.shape[1])
    eye[0, 0] = 0.0  # do not shrink intercept
    gram = xb.T @ xb + alpha * eye
    coeffs = np.linalg.solve(gram, xb.T @ y)
    return coeffs


def predict_ridge(coeffs: np.ndarray, x: np.ndarray) -> np.ndarray:
    ones = np.ones((x.shape[0], 1))
    xb = np.hstack([ones, x])
    return xb @ coeffs


def seasonal_baseline_predict(train: list[dict], target: list[dict]) -> np.ndarray:
    keyed: dict[tuple, list[int]] = {}
    dept_hour: dict[tuple, list[int]] = {}
    dept_mean: dict[str, list[int]] = {}
    all_vals: list[int] = []
    for row in train:
        keyed.setdefault((row["department_code"], row["dow"], row["hour"]), []).append(
            row["arrivals"]
        )
        dept_hour.setdefault((row["department_code"], row["hour"]), []).append(
            row["arrivals"]
        )
        dept_mean.setdefault(row["department_code"], []).append(row["arrivals"])
        all_vals.append(row["arrivals"])

    def avg(vals: list[int]) -> float:
        return sum(vals) / len(vals)

    keyed_m = {k: avg(v) for k, v in keyed.items()}
    dh_m = {k: avg(v) for k, v in dept_hour.items()}
    d_m = {k: avg(v) for k, v in dept_mean.items()}
    global_mean = avg(all_vals)

    preds = []
    for row in target:
        key = (row["department_code"], row["dow"], row["hour"])
        if key in keyed_m:
            preds.append(keyed_m[key])
        elif (row["department_code"], row["hour"]) in dh_m:
            preds.append(dh_m[(row["department_code"], row["hour"])])
        elif row["department_code"] in d_m:
            preds.append(d_m[row["department_code"]])
        else:
            preds.append(global_mean)
    return np.asarray(preds, dtype=float)


def nonneg_round(pred: np.ndarray) -> np.ndarray:
    return np.maximum(0, np.rint(pred)).astype(int)


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row[k] for k in fieldnames})


def main() -> None:
    rng = np.random.default_rng(SEED)
    end_day = date(2026, 10, 23)
    history = generate_history(rng, end_day)
    history.sort(key=lambda r: (r["timestamp_utc"], r["department_code"]))

    holdout_start = datetime(
        end_day.year, end_day.month, end_day.day, tzinfo=timezone.utc
    ) - timedelta(days=HOLDOUT_DAYS - 1)
    holdout_start_iso = holdout_start.isoformat().replace("+00:00", "Z")

    train = [r for r in history if r["timestamp_utc"] < holdout_start_iso]
    test = [r for r in history if r["timestamp_utc"] >= holdout_start_iso]
    assert train and test
    assert train[-1]["timestamp_utc"] < test[0]["timestamp_utc"]

    x_train = np.asarray([feature_row(r) for r in train], dtype=float)
    y_train = np.asarray([r["arrivals"] for r in train], dtype=float)
    x_test = np.asarray([feature_row(r) for r in test], dtype=float)
    y_test = np.asarray([r["arrivals"] for r in test], dtype=float)

    coeffs = fit_ridge(x_train, y_train, alpha=2.0)
    model_pred = nonneg_round(predict_ridge(coeffs, x_test))
    baseline_pred = nonneg_round(seasonal_baseline_predict(train, test))

    model_metrics = metrics_pair(y_test, model_pred.astype(float))
    baseline_metrics = metrics_pair(y_test, baseline_pred.astype(float))

    per_dept: dict[str, dict] = {}
    for code in DEPARTMENT_CODES:
        idx = [i for i, r in enumerate(test) if r["department_code"] == code]
        if not idx:
            continue
        yt = y_test[idx]
        per_dept[code] = {
            "model": asdict(metrics_pair(yt, model_pred[idx].astype(float))),
            "baseline": asdict(metrics_pair(yt, baseline_pred[idx].astype(float))),
            "n": len(idx),
        }

    mae_delta = baseline_metrics.mae - model_metrics.mae
    rmse_delta = baseline_metrics.rmse - model_metrics.rmse
    model_beats_baseline = model_metrics.mae < baseline_metrics.mae

    last_ts = datetime.fromisoformat(history[-1]["timestamp_utc"].replace("Z", "+00:00"))
    horizon: list[dict] = []
    for step in range(1, HORIZON_HOURS + 1):
        ts = last_ts + timedelta(hours=step)
        for code in DEPARTMENT_CODES:
            horizon.append(
                {
                    "timestamp_utc": ts.isoformat().replace("+00:00", "Z"),
                    "department_code": code,
                    "hour": ts.hour,
                    "dow": ts.weekday(),
                    "is_weekend": int(ts.weekday() >= 5),
                    "service_date": ts.date().isoformat(),
                }
            )
    x_h = np.asarray([feature_row(r) for r in horizon], dtype=float)
    horizon_model = nonneg_round(predict_ridge(coeffs, x_h))
    horizon_base = nonneg_round(seasonal_baseline_predict(train, horizon))
    for i, row in enumerate(horizon):
        row["model_forecast"] = int(horizon_model[i])
        row["baseline_forecast"] = int(horizon_base[i])

    peaks_by_dept = []
    for code in DEPARTMENT_CODES:
        subset = [r for r in horizon if r["department_code"] == code]
        best = max(subset, key=lambda r: r["model_forecast"])
        peaks_by_dept.append(
            {
                "department_code": code,
                "timestamp_utc": best["timestamp_utc"],
                "hour": best["hour"],
                "model_forecast": best["model_forecast"],
            }
        )
    overall = max(horizon, key=lambda r: r["model_forecast"])

    heldout = []
    for i, row in enumerate(test):
        heldout.append(
            {
                "timestamp_utc": row["timestamp_utc"],
                "department_code": row["department_code"],
                "hour": row["hour"],
                "dow": row["dow"],
                "arrivals": row["arrivals"],
                "model_prediction": int(model_pred[i]),
                "baseline_prediction": int(baseline_pred[i]),
            }
        )

    metadata = {
        "label": "Synthetic demonstration data — not live hospital activity.",
        "version": VERSION,
        "seed": SEED,
        "generated_at_utc": datetime.now(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "history_start": history[0]["service_date"],
        "history_end": history[-1]["service_date"],
        "history_days": HISTORY_DAYS,
        "granularity": GRANULARITY,
        "departments": DEPARTMENTS,
        "holdout_days": HOLDOUT_DAYS,
        "holdout_start_utc": holdout_start_iso,
        "holdout_end_utc": history[-1]["timestamp_utc"],
        "train_rows": len(train),
        "test_rows": len(test),
        "horizon_hours": HORIZON_HOURS,
        "model": {
            "type": "Ridge regression (closed-form NumPy)",
            "alpha": 2.0,
            "features": [
                "department one-hot",
                "hour sin/cos",
                "dow sin/cos",
                "is_weekend",
                "morning/afternoon bands",
                "weekend × band interactions",
            ],
        },
        "baseline": {
            "type": "seasonal historical mean",
            "description": "Mean arrivals for same department, day-of-week, and hour from training data only.",
        },
        "assumptions": [
            "Counts are synthetic Poisson draws around department-specific base rates.",
            "Diurnal clinic hours, weekend reduction, mild weekday effects, gradual trend, and rare surge days are simulated.",
            "No real patient registrations, queue entries, access codes, or patient-level records were used.",
            "Patterns may not match any real hospital.",
        ],
    }

    evaluation = {
        "label": "Held-out evaluation on synthetic data only",
        "holdout_start_utc": holdout_start_iso,
        "holdout_end_utc": history[-1]["timestamp_utc"],
        "train_rows": len(train),
        "test_rows": len(test),
        "units": "patients per hour",
        "lower_error_is_better": True,
        "model": asdict(model_metrics),
        "baseline": asdict(baseline_metrics),
        "mae_improvement_vs_baseline": mae_delta,
        "rmse_improvement_vs_baseline": rmse_delta,
        "model_beats_baseline_on_mae": model_beats_baseline,
        "per_department": per_dept,
        "note": "Positive mae_improvement_vs_baseline means the model MAE is lower than the baseline.",
    }

    next_forecasts = [
        {
            "timestamp_utc": r["timestamp_utc"],
            "department_code": r["department_code"],
            "hour": r["hour"],
            "dow": r["dow"],
            "model_forecast": r["model_forecast"],
            "baseline_forecast": r["baseline_forecast"],
        }
        for r in horizon
    ]

    # Full held-out rows stay in CSV; the UI bundle keeps a recent window for charts.
    heldout_chart = heldout[-(3 * 24 * len(DEPARTMENT_CODES)) :]
    simple_week_guide = build_simple_week_guide(history)

    bundle = {
        "metadata": metadata,
        "evaluation": evaluation,
        "simple_week_guide": simple_week_guide,
        "next_horizon_forecasts": next_forecasts,
        "peaks": {
            "per_department": peaks_by_dept,
            "overall": {
                "department_code": overall["department_code"],
                "timestamp_utc": overall["timestamp_utc"],
                "hour": int(overall["hour"]),
                "model_forecast": int(overall["model_forecast"]),
            },
        },
        "heldout_comparison": heldout_chart,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    SRC_BUNDLE.parent.mkdir(parents=True, exist_ok=True)

    write_csv(
        OUT_DIR / "historical_hourly.csv",
        history,
        [
            "timestamp_utc",
            "department_code",
            "arrivals",
            "hour",
            "dow",
            "is_weekend",
            "service_date",
        ],
    )
    write_csv(
        OUT_DIR / "heldout_predictions.csv",
        heldout,
        [
            "timestamp_utc",
            "department_code",
            "hour",
            "dow",
            "arrivals",
            "model_prediction",
            "baseline_prediction",
        ],
    )
    write_csv(
        OUT_DIR / "next_horizon_forecasts.csv",
        next_forecasts,
        [
            "timestamp_utc",
            "department_code",
            "hour",
            "dow",
            "model_forecast",
            "baseline_forecast",
        ],
    )
    (OUT_DIR / "metadata.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    (OUT_DIR / "evaluation.json").write_text(
        json.dumps(evaluation, indent=2) + "\n", encoding="utf-8"
    )
    (OUT_DIR / "next_horizon_forecasts.json").write_text(
        json.dumps(next_forecasts, indent=2) + "\n", encoding="utf-8"
    )
    (OUT_DIR / "simple_week_guide.json").write_text(
        json.dumps(simple_week_guide, indent=2) + "\n", encoding="utf-8"
    )
    bundle_text = json.dumps(bundle, indent=2) + "\n"
    (OUT_DIR / "forecast_bundle.json").write_text(bundle_text, encoding="utf-8")
    (PUBLIC_DIR / "forecast_bundle.json").write_text(bundle_text, encoding="utf-8")
    SRC_BUNDLE.write_text(bundle_text, encoding="utf-8")

    print("SehatFlow Phase 8 forecasting pipeline complete")
    print(f"  seed={SEED} history_days={HISTORY_DAYS} holdout_days={HOLDOUT_DAYS}")
    print(f"  train_rows={len(train)} test_rows={len(test)}")
    print(
        f"  model MAE={model_metrics.mae:.3f} RMSE={model_metrics.rmse:.3f} | "
        f"baseline MAE={baseline_metrics.mae:.3f} RMSE={baseline_metrics.rmse:.3f}"
    )
    print(
        f"  model_beats_baseline_on_mae={model_beats_baseline} "
        f"mae_improvement={mae_delta:.3f}"
    )
    print(
        "  simple week guide: busiest="
        f"{simple_week_guide['overall']['busiest']['day_name']} "
        f"least={simple_week_guide['overall']['least_busy']['day_name']}"
    )
    print(f"  wrote {OUT_DIR}")


if __name__ == "__main__":
    main()
