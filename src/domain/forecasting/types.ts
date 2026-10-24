export type ForecastDepartment = {
  code: string
  name: string
}

export type ForecastMetrics = {
  mae: number
  rmse: number
  n: number
}

export type ForecastBundle = {
  metadata: {
    label: string
    version: string
    seed: number
    generated_at_utc: string
    history_start: string
    history_end: string
    history_days: number
    granularity: string
    departments: ForecastDepartment[]
    holdout_days: number
    holdout_start_utc: string
    holdout_end_utc: string
    train_rows: number
    test_rows: number
    horizon_hours: number
    model: { type: string; alpha: number; features: string[] }
    baseline: { type: string; description: string }
    assumptions: string[]
  }
  evaluation: {
    label: string
    holdout_start_utc: string
    holdout_end_utc: string
    train_rows: number
    test_rows: number
    units: string
    lower_error_is_better: boolean
    model: ForecastMetrics
    baseline: ForecastMetrics
    mae_improvement_vs_baseline: number
    rmse_improvement_vs_baseline: number
    model_beats_baseline_on_mae: boolean
    per_department: Record<
      string,
      { model: ForecastMetrics; baseline: ForecastMetrics; n: number }
    >
    note: string
  }
  next_horizon_forecasts: Array<{
    timestamp_utc: string
    department_code: string
    hour: number
    dow: number
    model_forecast: number
    baseline_forecast: number
  }>
  peaks: {
    per_department: Array<{
      department_code: string
      timestamp_utc: string
      hour: number
      model_forecast: number
    }>
    overall: {
      department_code: string
      timestamp_utc: string
      hour: number
      model_forecast: number
    }
  }
  /** Basic weekday averages — easiest view for busiest / least-busy days. */
  simple_week_guide: SimpleWeekGuide
  heldout_comparison: Array<{
    timestamp_utc: string
    department_code: string
    hour: number
    dow: number
    arrivals: number
    model_prediction: number
    baseline_prediction: number
  }>
}

export type WeekdayDemandRow = {
  dow: number
  day_name: string
  avg_daily_arrivals: number
  sample_days: number
  rank: number
}

export type WeekdayDemandSummary = {
  days: WeekdayDemandRow[]
  busiest: {
    dow: number
    day_name: string
    avg_daily_arrivals: number
  }
  least_busy: {
    dow: number
    day_name: string
    avg_daily_arrivals: number
  }
}

export type SimpleWeekGuide = {
  label: string
  method: string
  units: string
  history_days: number
  overall: WeekdayDemandSummary
  by_department: Record<string, WeekdayDemandSummary>
}

export function isForecastBundle(value: unknown): value is ForecastBundle {
  if (!value || typeof value !== "object") {
    return false
  }
  const record = value as Record<string, unknown>
  const guide = (record as { simple_week_guide?: unknown }).simple_week_guide
  return (
    typeof record.metadata === "object" &&
    record.metadata !== null &&
    typeof record.evaluation === "object" &&
    record.evaluation !== null &&
    typeof guide === "object" &&
    guide !== null &&
    Array.isArray(record.next_horizon_forecasts) &&
    Array.isArray(record.heldout_comparison)
  )
}
