import bundleJson from "./forecast_bundle.json"
import {
  isForecastBundle,
  type ForecastBundle,
  type WeekdayDemandSummary,
} from "./types.ts"

export type ForecastLoadResult =
  | { ok: true; bundle: ForecastBundle }
  | { ok: false; reason: "missing" | "corrupt" }

/** Load the versioned synthetic forecast bundle shipped with the app. */
export function loadForecastBundle(
  source: unknown = bundleJson,
): ForecastLoadResult {
  if (source == null) {
    return { ok: false, reason: "missing" }
  }
  if (!isForecastBundle(source)) {
    return { ok: false, reason: "corrupt" }
  }
  const { metadata, evaluation } = source
  if (
    typeof metadata.seed !== "number" ||
    typeof evaluation.model?.mae !== "number" ||
    typeof evaluation.baseline?.mae !== "number"
  ) {
    return { ok: false, reason: "corrupt" }
  }
  return { ok: true, bundle: source }
}

export function departmentName(
  bundle: ForecastBundle,
  code: string,
): string {
  return (
    bundle.metadata.departments.find((d) => d.code === code)?.name ?? code
  )
}

export function filterHorizon(
  bundle: ForecastBundle,
  departmentCode: string | "all",
) {
  if (departmentCode === "all") {
    return bundle.next_horizon_forecasts
  }
  return bundle.next_horizon_forecasts.filter(
    (row) => row.department_code === departmentCode,
  )
}

export function aggregateHorizonByHour(
  bundle: ForecastBundle,
  departmentCode: string | "all",
): Array<{ hour: number; model: number; baseline: number }> {
  const rows = filterHorizon(bundle, departmentCode)
  const byHour = new Map<number, { model: number; baseline: number }>()
  for (const row of rows) {
    const current = byHour.get(row.hour) ?? { model: 0, baseline: 0 }
    current.model += row.model_forecast
    current.baseline += row.baseline_forecast
    byHour.set(row.hour, current)
  }
  return [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, value]) => ({ hour, ...value }))
}

export function filterHeldout(
  bundle: ForecastBundle,
  departmentCode: string | "all",
  limit = 168,
) {
  const rows =
    departmentCode === "all"
      ? bundle.heldout_comparison
      : bundle.heldout_comparison.filter(
          (row) => row.department_code === departmentCode,
        )
  // Last N points for chart readability (still synthetic held-out data).
  return rows.slice(-limit)
}

/** Basic weekday averages for the simple busiest / least-busy day view. */
export function simpleWeekSummary(
  bundle: ForecastBundle,
  departmentCode: string | "all",
): WeekdayDemandSummary | null {
  const guide = bundle.simple_week_guide
  if (!guide?.overall?.days?.length) {
    return null
  }
  if (departmentCode === "all") {
    return guide.overall
  }
  return guide.by_department[departmentCode] ?? null
}
