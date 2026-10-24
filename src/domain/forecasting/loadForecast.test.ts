import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  aggregateHorizonByHour,
  filterHorizon,
  loadForecastBundle,
  simpleWeekSummary,
} from "./loadForecast.ts"
import { meanAbsoluteError, rootMeanSquaredError } from "./metrics.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")

describe("forecast bundle artifacts", () => {
  it("loads the versioned synthetic bundle with required labels", () => {
    const loaded = loadForecastBundle()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) {
      return
    }
    expect(loaded.bundle.metadata.label).toMatch(/Synthetic demonstration data/i)
    expect(loaded.bundle.metadata.seed).toBe(20261024)
    expect(loaded.bundle.metadata.history_days).toBe(120)
    expect(loaded.bundle.metadata.granularity).toBe("hourly")
    expect(loaded.bundle.metadata.departments.map((d) => d.code)).toEqual([
      "general_medicine",
      "pediatrics",
      "womens_health",
      "orthopedics",
      "ent",
      "ophthalmology",
      "dermatology",
    ])
    expect(loaded.bundle.next_horizon_forecasts).toHaveLength(24 * 7)
  })

  it("keeps forecasts finite and non-negative", () => {
    const loaded = loadForecastBundle()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) {
      return
    }
    for (const row of loaded.bundle.next_horizon_forecasts) {
      expect(Number.isFinite(row.model_forecast)).toBe(true)
      expect(row.model_forecast).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(row.model_forecast)).toBe(true)
    }
  })

  it("filters by department and aggregates hours", () => {
    const loaded = loadForecastBundle()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) {
      return
    }
    const ped = filterHorizon(loaded.bundle, "pediatrics")
    expect(ped).toHaveLength(24)
    expect(ped.every((row) => row.department_code === "pediatrics")).toBe(true)
    const hours = aggregateHorizonByHour(loaded.bundle, "pediatrics")
    expect(hours).toHaveLength(24)
  })

  it("stores honest evaluation metrics on the same held-out sample count", () => {
    const loaded = loadForecastBundle()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) {
      return
    }
    const { evaluation, heldout_comparison } = loaded.bundle
    expect(evaluation.test_rows).toBe(2352)
    expect(evaluation.train_rows).toBe(17808)
    expect(evaluation.model.n).toBe(evaluation.test_rows)
    expect(evaluation.baseline.n).toBe(evaluation.test_rows)
    expect(evaluation.model_beats_baseline_on_mae).toBe(
      evaluation.model.mae < evaluation.baseline.mae,
    )
    expect(evaluation.mae_improvement_vs_baseline).toBeCloseTo(
      evaluation.baseline.mae - evaluation.model.mae,
      8,
    )
    // Chart window is a recent subset; full held-out predictions live in CSV.
    expect(heldout_comparison.length).toBeGreaterThan(0)
    expect(heldout_comparison.length).toBeLessThanOrEqual(evaluation.test_rows)
    const sampleActual = heldout_comparison.map((r) => r.arrivals)
    const sampleModel = heldout_comparison.map((r) => r.model_prediction)
    expect(meanAbsoluteError(sampleActual, sampleModel)).toBeGreaterThanOrEqual(0)
    expect(
      rootMeanSquaredError(
        sampleActual,
        heldout_comparison.map((r) => r.baseline_prediction),
      ),
    ).toBeGreaterThanOrEqual(0)
  })

  it("contains no patient-level fields in artifacts", () => {
    const csv = readFileSync(
      join(root, "data/forecasting/historical_hourly.csv"),
      "utf8",
    )
    expect(csv).not.toMatch(/access_code|qr_token|display_name|patient_id/i)
    const header = csv.split("\n")[0] ?? ""
    expect(header).toContain("department_code")
    expect(header).toContain("arrivals")

    const loaded = loadForecastBundle()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) {
      return
    }
    const blob = JSON.stringify(loaded.bundle)
    expect(blob).not.toMatch(/access_code|qr_token|service_role|SARVAM/i)
  })

  it("rejects corrupt payloads", () => {
    expect(loadForecastBundle(null).ok).toBe(false)
    expect(loadForecastBundle({ metadata: {} }).ok).toBe(false)
  })

  it("exposes a simple weekday busyness guide with busiest and least-busy days", () => {
    const loaded = loadForecastBundle()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) {
      return
    }
    const overall = simpleWeekSummary(loaded.bundle, "all")
    expect(overall).not.toBeNull()
    if (!overall) {
      return
    }
    expect(overall.days).toHaveLength(7)
    expect(overall.days.map((d) => d.dow)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(overall.busiest.avg_daily_arrivals).toBeGreaterThanOrEqual(
      overall.least_busy.avg_daily_arrivals,
    )
    expect(overall.busiest.dow).not.toBe(overall.least_busy.dow)
    const ranks = overall.days.map((d) => d.rank).sort((a, b) => a - b)
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7])

    const ped = simpleWeekSummary(loaded.bundle, "pediatrics")
    expect(ped).not.toBeNull()
    expect(ped?.days).toHaveLength(7)
    expect(loaded.bundle.simple_week_guide.label).toMatch(/Synthetic demonstration/i)
  })
})
