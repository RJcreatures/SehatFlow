/** Pure metric helpers mirrored by the Python evaluation pipeline. */

export function meanAbsoluteError(
  actual: readonly number[],
  predicted: readonly number[],
): number {
  if (actual.length === 0 || actual.length !== predicted.length) {
    return Number.NaN
  }
  let sum = 0
  for (let i = 0; i < actual.length; i += 1) {
    sum += Math.abs((actual[i] ?? 0) - (predicted[i] ?? 0))
  }
  return sum / actual.length
}

export function rootMeanSquaredError(
  actual: readonly number[],
  predicted: readonly number[],
): number {
  if (actual.length === 0 || actual.length !== predicted.length) {
    return Number.NaN
  }
  let sum = 0
  for (let i = 0; i < actual.length; i += 1) {
    const err = (actual[i] ?? 0) - (predicted[i] ?? 0)
    sum += err * err
  }
  return Math.sqrt(sum / actual.length)
}
