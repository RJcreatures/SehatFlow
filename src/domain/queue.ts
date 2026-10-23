export type DurationSample = {
  calledAt: Date
  completedAt: Date
}

/**
 * OPD consultation duration bounds used for wait estimates.
 *
 * Durations outside this range are treated as invalid samples (for example a
 * token left in "called" for a long wall-clock stretch, or a 10× demo-clock
 * stretch that produces a multi-hour simulated consultation). They must not
 * inflate peopleAhead * meanDuration.
 *
 * Bounds: inclusive [1, 60] minutes.
 */
export const MIN_CONSULTATION_MINUTES = 1
export const MAX_CONSULTATION_MINUTES = 60
export const MAX_DURATION_SAMPLES = 10

/** People ahead of a waiting token: earlier waiting or called tokens. */
export function countPeopleAhead(params: {
  ownTokenNumber: number
  ownStatus: "waiting" | "called" | "completed" | "no_show" | "skipped" | "cancelled"
  peers: Array<{ tokenNumber: number; status: string }>
}): number {
  if (params.ownStatus === "called") {
    return 0
  }
  if (params.ownStatus !== "waiting") {
    return 0
  }
  return params.peers.filter(
    (peer) =>
      peer.tokenNumber < params.ownTokenNumber &&
      (peer.status === "waiting" || peer.status === "called"),
  ).length
}

export function consultationDurationMinutes(sample: DurationSample): number {
  return (sample.completedAt.getTime() - sample.calledAt.getTime()) / 60_000
}

export function isValidConsultationDuration(minutes: number): boolean {
  return (
    Number.isFinite(minutes) &&
    minutes >= MIN_CONSULTATION_MINUTES &&
    minutes <= MAX_CONSULTATION_MINUTES
  )
}

/** Median of a non-empty sorted numeric list. */
export function medianMinutes(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1]! + sorted[middle]!) / 2
  }
  return sorted[middle]!
}

/**
 * Robust mean consultation length from recent completed samples.
 * Uses the median of up to the last ten valid durations; falls back to
 * departments.estimated_minutes when none are valid.
 */
export function meanConsultationMinutes(
  samples: DurationSample[],
  fallbackMinutes: number,
): number {
  const valid = samples
    .filter((sample) => sample.completedAt.getTime() > sample.calledAt.getTime())
    .map((sample) => ({
      sample,
      minutes: consultationDurationMinutes(sample),
    }))
    .filter((row) => isValidConsultationDuration(row.minutes))
    .sort(
      (a, b) => b.sample.completedAt.getTime() - a.sample.completedAt.getTime(),
    )
    .slice(0, MAX_DURATION_SAMPLES)
    .map((row) => row.minutes)
    .sort((a, b) => a - b)

  if (valid.length === 0) {
    return fallbackMinutes
  }

  return medianMinutes(valid)
}

export function roundToNearestFiveMinutes(rawMinutes: number): number {
  return Math.round(rawMinutes / 5) * 5
}

/**
 * Approximate wait in minutes. Label as an estimate, not a guarantee.
 * raw = peopleAhead * meanDuration + lateMinutes + breakRemaining
 */
export function estimateWaitMinutes(input: {
  peopleAhead: number
  meanDurationMinutes: number
  lateMinutes: number
  breakRemainingMinutes: number
}): number {
  const raw =
    input.peopleAhead * input.meanDurationMinutes +
    input.lateMinutes +
    input.breakRemainingMinutes
  return roundToNearestFiveMinutes(raw)
}

/** Fill a catalog template such as "About {minutes} minutes". */
export function formatAboutWaitMinutes(
  minutes: number,
  template = "About {minutes} minutes",
): string {
  return template.replace(/\{minutes\}/g, String(minutes))
}
