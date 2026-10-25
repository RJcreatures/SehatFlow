#!/usr/bin/env python3
"""Train and compare hourly OPD-arrival forecasting models on synthetic aggregate data."""
from __future__ import annotations
from pathlib import Path
import json
import math
import warnings
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'opd_traffic_hourly.csv'
OUT = ROOT / 'outputs'
MODELS = ROOT / 'models'
DEPT_CODES = ['GENMED','PEDS','ORTHO','CARDIO','OPHTH','ENT','DERM']
START_HOUR, END_HOUR = 8, 16


def open_for(code: str, ts: pd.Timestamp) -> bool:
    # Same synthetic schedule rule as generator: weekdays 08-16, Saturday 08-12, Sunday closed.
    if ts.dayofweek == 6:
        return False
    if ts.hour < START_HOUR or ts.hour > END_HOUR:
        return False
    if ts.dayofweek == 5 and ts.hour > 12:
        return False
    return True


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    ts = pd.to_datetime(d['observed_at'], utc=True).dt.tz_convert('Asia/Kolkata')
    d['_ts'] = ts
    d['hour'] = ts.dt.hour.astype(int)
    d['day_of_week'] = ts.dt.dayofweek.astype(int)
    d['month'] = ts.dt.month.astype(int)
    d['day_of_year'] = ts.dt.dayofyear.astype(int)
    d['hour_sin'] = np.sin(2*np.pi*d['hour']/24)
    d['hour_cos'] = np.cos(2*np.pi*d['hour']/24)
    d['dow_sin'] = np.sin(2*np.pi*d['day_of_week']/7)
    d['dow_cos'] = np.cos(2*np.pi*d['day_of_week']/7)
    d['doy_sin'] = np.sin(2*np.pi*d['day_of_year']/365.25)
    d['doy_cos'] = np.cos(2*np.pi*d['day_of_year']/365.25)
    d['weekend_num'] = d['is_weekend'].astype(int)
    d['clinic_open_num'] = d['clinic_open'].astype(int)
    d['special_schedule_num'] = d['is_special_schedule_day'].astype(int)
    d = d.sort_values(['department_code','_ts']).reset_index(drop=True)
    for lag, name in [(1,'lag_1'),(24,'lag_24'),(168,'lag_168')]:
        d[name] = d.groupby('department_code')['arrivals_count'].shift(lag)
    d['rolling_mean_24'] = d.groupby('department_code')['arrivals_count'].transform(lambda s: s.shift(1).rolling(24, min_periods=24).mean())
    d['rolling_mean_168'] = d.groupby('department_code')['arrivals_count'].transform(lambda s: s.shift(1).rolling(168, min_periods=168).mean())
    dep_onehot = pd.get_dummies(d['department_code'], prefix='dept', dtype=int)
    for code in DEPT_CODES:
        col = f'dept_{code}'
        if col not in dep_onehot:
            dep_onehot[col] = 0
    d = pd.concat([d, dep_onehot[[f'dept_{c}' for c in DEPT_CODES]]], axis=1)
    return d

FEATURES = [
    'hour','day_of_week','month','day_of_year','hour_sin','hour_cos','dow_sin','dow_cos','doy_sin','doy_cos',
    'weekend_num','clinic_open_num','special_schedule_num','lag_1','lag_24','lag_168','rolling_mean_24','rolling_mean_168',
] + [f'dept_{c}' for c in DEPT_CODES]


def metrics(y, pred) -> dict:
    y = np.asarray(y, dtype=float); pred = np.asarray(pred, dtype=float)
    denom = float(np.abs(y).sum())
    return {
        'mae': round(float(mean_absolute_error(y, pred)), 4),
        'rmse': round(float(np.sqrt(mean_squared_error(y, pred))), 4),
        'wape_percent': round(float(np.abs(y-pred).sum()/denom*100) if denom else 0.0, 3),
        'r2': round(float(r2_score(y, pred)), 4) if len(np.unique(y)) > 1 else None,
    }


def create_models():
    return {
        'ridge_regression': make_pipeline(StandardScaler(), Ridge(alpha=4.0)),
        'hist_gradient_boosting': HistGradientBoostingRegressor(
            learning_rate=0.08, max_iter=140, max_leaf_nodes=31,
            l2_regularization=1.0, random_state=20261024
        ),
    }


def future_features(ts: pd.Timestamp, code: str, hist: list[int], dep_index: int) -> dict:
    local = ts.tz_convert('Asia/Kolkata') if ts.tzinfo else ts.tz_localize('Asia/Kolkata')
    h = local.hour; dow = local.dayofweek; doy = local.dayofyear
    last1 = hist[-1] if len(hist)>=1 else 0
    last24 = hist[-24] if len(hist)>=24 else (float(np.mean(hist)) if hist else 0)
    last168 = hist[-168] if len(hist)>=168 else (float(np.mean(hist)) if hist else 0)
    mean24 = float(np.mean(hist[-24:])) if len(hist)>=24 else (float(np.mean(hist)) if hist else 0)
    mean168 = float(np.mean(hist[-168:])) if len(hist)>=168 else (float(np.mean(hist)) if hist else 0)
    row = {
        'hour':h,'day_of_week':dow,'month':local.month,'day_of_year':doy,
        'hour_sin':math.sin(2*math.pi*h/24),'hour_cos':math.cos(2*math.pi*h/24),
        'dow_sin':math.sin(2*math.pi*dow/7),'dow_cos':math.cos(2*math.pi*dow/7),
        'doy_sin':math.sin(2*math.pi*doy/365.25),'doy_cos':math.cos(2*math.pi*doy/365.25),
        'weekend_num':int(dow>=5),'clinic_open_num':int(open_for(code, local)),
        # Future synthetic special-schedule days are unknown; use normal scheduled hours.
        'special_schedule_num':0,'lag_1':last1,'lag_24':last24,'lag_168':last168,
        'rolling_mean_24':mean24,'rolling_mean_168':mean168,
    }
    for c in DEPT_CODES:
        row[f'dept_{c}'] = int(c==code)
    return row


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True); MODELS.mkdir(parents=True, exist_ok=True)
    if not DATA.exists():
        raise FileNotFoundError(f'{DATA} not found. Run src/generate_dataset.py first.')
    raw = pd.read_csv(DATA)
    raw['observed_at'] = pd.to_datetime(raw['observed_at'], utc=True).dt.tz_convert('Asia/Kolkata').astype(str)
    feat = add_features(raw).dropna(subset=FEATURES).reset_index(drop=True)
    ts = pd.to_datetime(feat['_ts'], utc=True)
    latest = ts.max()
    cutoff = latest - pd.Timedelta(days=90)
    train_mask = ts < cutoff
    test_mask = ts >= cutoff
    train = feat.loc[train_mask].copy(); test = feat.loc[test_mask].copy()
    X_train, y_train = train[FEATURES], train['arrivals_count'].astype(float)
    X_test, y_test = test[FEATURES], test['arrivals_count'].astype(float)

    model_metrics = []
    fitted = {}
    # Seasonal baseline: same department's observed count at the same hour one week earlier.
    baseline_pred = test['lag_168'].astype(float).clip(lower=0).to_numpy()
    model_metrics.append({'model':'seasonal_naive_168h','evaluation':'rolling_one_hour_ahead','test_rows':int(len(test)),**metrics(y_test, baseline_pred)})
    for name, model in create_models().items():
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            model.fit(X_train, y_train)
        pred = np.clip(model.predict(X_test), 0, None)
        model_metrics.append({'model':name,'evaluation':'rolling_one_hour_ahead','test_rows':int(len(test)),**metrics(y_test, pred)})
        fitted[name] = model
    metrics_df = pd.DataFrame(model_metrics).sort_values('mae')
    metrics_df.to_csv(OUT/'forecast_metrics_overall.csv', index=False)

    per_dep = []
    dep_test_ts = pd.to_datetime(test['_ts'], utc=True)
    for code in DEPT_CODES:
        mask = test['department_code'].eq(code).to_numpy()
        y = y_test.to_numpy()[mask]
        preds = {'seasonal_naive_168h':baseline_pred[mask]}
        for name, model in fitted.items():
            preds[name] = np.clip(model.predict(X_test.loc[mask]), 0, None)
        for name, pred in preds.items():
            per_dep.append({'department_code':code,'model':name,'test_rows':int(mask.sum()),**metrics(y,pred)})
    pd.DataFrame(per_dep).to_csv(OUT/'forecast_metrics_by_department.csv', index=False)

    # Choose the lowest-MAE model only after comparing to the seasonal baseline on held-out data.
    winning_name = str(metrics_df.iloc[0]['model'])
    metric_by_name = {row['model']: row for row in model_metrics}

    # Retrain ML candidates on all eligible historical rows for future demo forecasts.
    full_X, full_y = feat[FEATURES], feat['arrivals_count'].astype(float)
    for name, model in fitted.items():
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            model.fit(full_X, full_y)
        joblib.dump(model, MODELS/f'{name}.joblib')

    start_future = latest + pd.Timedelta(hours=1)
    start_future = start_future.tz_convert('Asia/Kolkata').floor('h')
    future_times = pd.date_range(start_future, periods=24*7, freq='h')
    histories = {}
    for code in DEPT_CODES:
        vals = raw.loc[raw['department_code'].eq(code)].sort_values('observed_at')['arrivals_count'].astype(int).tolist()
        histories[code] = vals
    forecast_rows = []
    for future_ts in future_times:
        for code in DEPT_CODES:
            f = future_features(future_ts, code, histories[code], DEPT_CODES.index(code))
            opened = bool(f['clinic_open_num'])
            preds = {}
            for name, model in fitted.items():
                p = float(np.clip(model.predict(pd.DataFrame([f])[FEATURES])[0],0,None)) if opened else 0.0
                preds[name] = p
            seasonal = float(f['lag_168']) if opened else 0.0
            all_preds = {'seasonal_naive_168h':seasonal, **preds}
            rec_model = winning_name
            rec_pred = all_preds[rec_model]
            forecast_rows.append({
                'forecast_at':future_ts.isoformat(), 'department_code':code,
                'department_name':next(d['department_name'] for d in raw[['department_code','department_name']].drop_duplicates().to_dict('records') if d['department_code']==code),
                'predicted_arrivals':round(float(rec_pred),2),
                'seasonal_naive_prediction':round(float(seasonal),2),
                'ridge_prediction':round(float(preds.get('ridge_regression',0)),2),
                'hist_gradient_boosting_prediction':round(float(preds.get('hist_gradient_boosting',0)),2),
                'selected_model':rec_model,
                'clinic_open':opened,
                'data_origin':'synthetic_demo_forecast'
            })
            histories[code].append(int(round(rec_pred)))
    future_df = pd.DataFrame(forecast_rows)
    future_df.to_csv(OUT/'forecast_next_7_days.csv', index=False)

    metadata = {
        'title':'SehatFlow synthetic OPD traffic forecast',
        'data_origin':'synthetic',
        'warning':'Synthetic demo data and model outputs only. Not observed hospital data and not validated for operational use.',
        'dataset_start':str(pd.to_datetime(raw['observed_at'], utc=True).min().tz_convert('Asia/Kolkata')),
        'dataset_end':str(latest.tz_convert('Asia/Kolkata')),
        'hourly_rows':int(len(raw)),
        'department_count':int(raw['department_code'].nunique()),
        'total_synthetic_arrivals':int(raw['arrivals_count'].sum()),
        'evaluation':'Chronological holdout: last 90 days, rolling one-hour-ahead predictions with previously observed test-period lags. This is not a seven-day-ahead backtest.',
        'selected_model_by_lowest_holdout_mae':winning_name,
        'model_metrics':model_metrics,
        'forecast_start':str(future_times[0]),
        'forecast_end':str(future_times[-1]),
        'forecast_rows':int(len(future_df)),
        'departments':[{k:v for k,v in x.items() if k in ('department_code','department_name')} for x in raw[['department_code','department_name']].drop_duplicates().to_dict('records')],
        'hourly_forecasts':future_df.to_dict('records')
    }
    (OUT/'forecast_summary.json').write_text(json.dumps(metadata, indent=2, default=str), encoding='utf-8')
    print('Model comparison (chronological 90-day holdout; rolling one-hour-ahead):')
    print(metrics_df.to_string(index=False))
    print(f'Selected model by holdout MAE: {winning_name}')
    print(f'Wrote {len(future_df):,} rows to {OUT / "forecast_next_7_days.csv"}')
    print(f'Full summary: {OUT / "forecast_summary.json"}')

if __name__ == '__main__':
    main()
