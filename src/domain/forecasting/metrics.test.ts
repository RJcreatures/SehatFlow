import { describe, expect, it } from "vitest"
import { meanAbsoluteError, rootMeanSquaredError } from "./metrics.ts"

describe("forecast metrics", () => {
  it("computes MAE and RMSE on held-out style samples", () => {
    const actual = [2, 4, 6, 0]
    const predicted = [3, 4, 5, 1]
    // |2-3|+|4-4|+|6-5|+|0-1| = 3 → MAE 0.75; RMSE sqrt(3/4)
    expect(meanAbsoluteError(actual, predicted)).toBeCloseTo(0.75, 8)
    expect(rootMeanSquaredError(actual, predicted)).toBeCloseTo(Math.sqrt(0.75), 8)
  })

  it("returns NaN for empty or mismatched lengths", () => {
    expect(Number.isNaN(meanAbsoluteError([], []))).toBe(true)
    expect(Number.isNaN(meanAbsoluteError([1], [1, 2]))).toBe(true)
  })
})
