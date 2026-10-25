#!/usr/bin/env python3
"""Generate deterministic synthetic aggregate OPD traffic for SehatFlow demos.

No patient-level data is generated. Every row is explicitly synthetic.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
import pandas as pd

DEPARTMENTS = [
    {"department_code":"GENMED", "department_name":"General Medicine", "base_rate":17.0, "service_minutes":10.0, "doctors":5, "staff":7, "shape":"general"},
    {"department_code":"PEDS", "department_name":"Pediatrics", "base_rate":8.6, "service_minutes":12.0, "doctors":3, "staff":5, "shape":"morning"},
    {"department_code":"ORTHO", "department_name":"Orthopedics", "base_rate":7.3, "service_minutes":15.0, "doctors":3, "staff":4, "shape":"morning"},
    {"department_code":"CARDIO", "department_name":"Cardiology", "base_rate":5.0, "service_minutes":18.0, "doctors":2, "staff":3, "shape":"late_morning"},
    {"department_code":"OPHTH", "department_name":"Ophthalmology / Eye Clinic", "base_rate":7.0, "service_minutes":11.0, "doctors":3, "staff":4, "shape":"afternoon"},
    {"department_code":"ENT", "department_name":"ENT", "base_rate":4.7, "service_minutes":13.0, "doctors":2, "staff":3, "shape":"afternoon"},
    {"department_code":"DERM", "department_name":"Dermatology", "base_rate":4.2, "service_minutes":14.0, "doctors":2, "staff":3, "shape":"midday"},
]
HOUR_FACTOR = {
    "general":      {8:0.64,9:1.12,10:1.28,11:1.20,12:0.78,13:0.68,14:1.04,15:1.15,16:0.72},
    "morning":      {8:0.70,9:1.30,10:1.38,11:1.25,12:0.73,13:0.52,14:0.76,15:0.82,16:0.40},
    "late_morning": {8:0.35,9:0.78,10:1.12,11:1.35,12:1.20,13:0.70,14:0.70,15:0.65,16:0.30},
    "afternoon":    {8:0.35,9:0.62,10:0.80,11:0.85,12:0.72,13:0.62,14:1.15,15:1.30,16:0.78},
    "midday":       {8:0.35,9:0.70,10:0.92,11:1.08,12:1.15,13:0.90,14:0.95,15:0.82,16:0.43},
}

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--start-date', default='2024-01-01')
    ap.add_argument('--end-date', default='2026-10-23')
    ap.add_argument('--seed', type=int, default=20261024)
    ap.add_argument('--out-dir', default='data')
    args = ap.parse_args()
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(args.seed)
    dates = pd.date_range(args.start_date, args.end_date, freq='D')
    hours = pd.date_range(pd.Timestamp(args.start_date), pd.Timestamp(args.end_date) + pd.Timedelta(hours=23), freq='h')
    # All hours are localized to India time. These calendar dates are simulation timestamps,
    # not claims of observed hospital history.
    hours = hours.tz_localize('Asia/Kolkata')

    # Fixed, seeded reduced-schedule dates emulate occasional clinic schedule changes.
    # They are deliberately NOT labelled as actual public holidays.
    all_dates = [d.date() for d in dates]
    reduced = set()
    for year in sorted(set(d.year for d in all_dates)):
        eligible = [d for d in all_dates if d.year == year and d.weekday() < 5]
        if eligible:
            pick = rng.choice(len(eligible), size=min(10, len(eligible)), replace=False)
            reduced.update(eligible[int(i)] for i in pick)

    rows = []
    # Stable weekly pattern plus small smooth seasonality and noise. Queues reset at the
    # start of each synthetic service day; this is an illustrative model, not operational data.
    daily_season = {d.date(): float(1.0 + 0.07*np.sin(2*np.pi*(d.dayofyear/365.25)) + 0.025*np.sin(4*np.pi*(d.dayofyear/365.25))) for d in dates}
    for dep in DEPARTMENTS:
        for day in dates:
            date_key = day.date()
            dow = day.dayofweek
            is_weekend = dow >= 5
            is_reduced = date_key in reduced
            # Sundays model outpatient departments as closed. Saturday clinics are shorter/lower-volume.
            service_hours = list(range(8, 17)) if dow < 5 else (list(range(8, 13)) if dow == 5 else [])
            if is_reduced:
                service_hours = [h for h in service_hours if h <= 12]
            weekday_factor = [1.17, 1.00, 1.00, 0.98, 1.05, 0.72, 0.0][dow]
            dept_factor = daily_season[date_key]
            # Department-specific seasonality with modest amplitude.
            phase = {"GENMED":0.2,"PEDS":1.8,"ORTHO":2.4,"CARDIO":0.5,"OPHTH":3.1,"ENT":4.2,"DERM":5.0}[dep['department_code']]
            dept_factor *= (1 + 0.045*np.sin(2*np.pi*(day.dayofyear/365.25) + phase))
            if is_reduced:
                dept_factor *= 0.63
            queue = 0
            for hour in range(24):
                is_open = hour in service_hours
                docs = 0
                support = 0
                arrivals = 0
                completed = 0
                q_start = queue if is_open else 0
                if is_open:
                    # Staffing fluctuates slightly in a deterministic synthetic schedule.
                    docs = int(dep['doctors'])
                    if hour in (12, 13):
                        docs = max(1, docs - 1)
                    if is_weekend:
                        docs = max(1, int(round(docs * 0.67)))
                    if is_reduced:
                        docs = max(1, int(round(docs * 0.67)))
                    support = max(docs, int(dep['staff'] * (0.70 if is_weekend or is_reduced else 1.0)))
                    shape = HOUR_FACTOR[dep['shape']].get(hour, 0.0)
                    # Monday/late-morning peaks emerge from weekday and hour factors.
                    expected = dep['base_rate'] * shape * weekday_factor * dept_factor
                    # Gamma-Poisson mixture supplies realistic-looking overdispersion.
                    multiplier = rng.gamma(shape=5.0, scale=0.2) if expected > 0 else 0.0
                    arrivals = int(rng.poisson(max(0.0, expected * multiplier)))
                    # Slightly noisier service rate so queues sometimes build during peaks.
                    service_noise = float(rng.uniform(0.83, 1.13))
                    capacity = max(0, int(round(docs * 60.0 / dep['service_minutes'] * service_noise)))
                    people_available = q_start + arrivals
                    completed = min(people_available, capacity)
                    queue = max(0, people_available - completed)
                    q_end = queue
                else:
                    docs = 0
                    support = 0
                    q_start = 0
                    q_end = 0
                    queue = 0
                ts = pd.Timestamp(day.date()) + pd.Timedelta(hours=hour)
                ts = ts.tz_localize('Asia/Kolkata')
                rows.append({
                    'observed_at': ts.isoformat(),
                    'department_code': dep['department_code'],
                    'department_name': dep['department_name'],
                    'arrivals_count': arrivals,
                    'completed_count': completed,
                    'queue_start_count': q_start,
                    'queue_end_count': q_end,
                    'avg_service_minutes': round(float(dep['service_minutes']), 2),
                    'doctors_on_duty': docs,
                    'support_staff_on_duty': support,
                    'clinic_open': bool(is_open),
                    'is_weekend': bool(is_weekend),
                    'is_special_schedule_day': bool(is_reduced),
                    'data_origin': 'synthetic'
                })
    hourly = pd.DataFrame(rows)
    # Keep time and department sorting stable for training and bulk import.
    hourly['__sort_ts'] = pd.to_datetime(hourly['observed_at'], utc=True)
    hourly = hourly.sort_values(['__sort_ts','department_code']).drop(columns='__sort_ts').reset_index(drop=True)
    hourly.to_csv(out/'opd_traffic_hourly.csv', index=False)

    hourly['_day'] = pd.to_datetime(hourly['observed_at'], utc=True).dt.tz_convert('Asia/Kolkata').dt.strftime('%Y-%m-%d')
    daily = hourly.groupby(['_day','department_code','department_name','data_origin'], as_index=False).agg(
        arrivals_count=('arrivals_count','sum'), completed_count=('completed_count','sum'),
        peak_queue_count=('queue_end_count','max'), mean_service_minutes=('avg_service_minutes','mean'),
        open_hours=('clinic_open','sum'), doctors_peak=('doctors_on_duty','max'),
        support_staff_peak=('support_staff_on_duty','max'), is_weekend=('is_weekend','max'),
        is_special_schedule_day=('is_special_schedule_day','max')
    ).rename(columns={'_day':'service_date'})
    daily.to_csv(out/'opd_traffic_daily.csv', index=False, float_format='%.2f')

    summary = hourly.groupby(['department_code','department_name'], as_index=False).agg(
        hourly_rows=('arrivals_count','size'), total_arrivals=('arrivals_count','sum'),
        avg_arrivals_per_hour=('arrivals_count','mean'), peak_hourly_arrivals=('arrivals_count','max'),
        total_completed=('completed_count','sum'), max_queue_sample=('queue_end_count','max'),
        open_hour_rows=('clinic_open','sum')
    )
    summary.to_csv(out/'opd_department_summary.csv', index=False, float_format='%.3f')
    # Quarter-sized files are convenient for safe, repeatable dashboard imports.
    chunks_dir = out / 'hourly_chunks'
    chunks_dir.mkdir(parents=True, exist_ok=True)
    for stale in chunks_dir.glob('opd_traffic_*.csv'):
        stale.unlink()
    chunk_dates = pd.to_datetime(hourly['observed_at'], utc=True).dt.tz_convert('Asia/Kolkata')
    for (year, quarter), idx in pd.Series(range(len(hourly))).groupby([chunk_dates.dt.year, chunk_dates.dt.quarter]):
        positions = idx.to_numpy()
        chunk_name = f'opd_traffic_{year}_Q{quarter}.csv'
        hourly.iloc[positions].to_csv(chunks_dir / chunk_name, index=False)
    print(f'Wrote {len(hourly):,} hourly aggregate rows across {len(DEPARTMENTS)} departments.')
    print(f'Date range: {args.start_date} through {args.end_date}; seed={args.seed}.')
    print(f'Total synthetic arrivals: {int(hourly.arrivals_count.sum()):,}')

if __name__ == '__main__':
    main()
