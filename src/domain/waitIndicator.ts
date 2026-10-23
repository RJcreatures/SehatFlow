export type WaitStatus =
  | "waiting"
  | "called"
  | "completed"
  | "no_show"
  | "skipped"
  | "cancelled"
  | string

export type WaitServerSnapshot = {
  tokenCode: string
  status: WaitStatus
  estimatedWaitMinutes: number | null
  patientsAhead: number
  receivedAtMs: number
}

export type WaitDisplayModel = {
  tokenCode: string
  status: WaitStatus
  /** Minutes shown to the visitor (local countdown reconciled to server). */
  displayMinutes: number | null
  /** 0–1 remaining fraction for the progress bar; null when not waiting. */
  progressRatio: number | null
  phase:
    | "waiting"
    | "called"
    | "completed"
    | "inactive"
    | "estimate_overdue"
    | "unavailable"
  baselineMinutes: number | null
}

/**
 * Local wait model: countdown from the last *changed* server estimate using
 * real elapsed wall time. Identical polls must not reset the countdown.
 */
export function reconcileWaitDisplay(input: {
  previous: WaitServerSnapshot | null
  next: WaitServerSnapshot
  baselineMinutes: number | null
  nowMs: number
}): { model: WaitDisplayModel; snapshot: WaitServerSnapshot; baselineMinutes: number | null } {
  const { next, nowMs } = input
  let snapshot = next
  let baseline = input.baselineMinutes

  if (next.status === "called") {
    return {
      snapshot,
      baselineMinutes: baseline,
      model: {
        tokenCode: next.tokenCode,
        status: next.status,
        displayMinutes: 0,
        progressRatio: 0,
        phase: "called",
        baselineMinutes: baseline,
      },
    }
  }

  if (next.status === "completed") {
    return {
      snapshot,
      baselineMinutes: baseline,
      model: {
        tokenCode: next.tokenCode,
        status: next.status,
        displayMinutes: null,
        progressRatio: null,
        phase: "completed",
        baselineMinutes: baseline,
      },
    }
  }

  if (
    next.status === "no_show" ||
    next.status === "skipped" ||
    next.status === "cancelled"
  ) {
    return {
      snapshot,
      baselineMinutes: baseline,
      model: {
        tokenCode: next.tokenCode,
        status: next.status,
        displayMinutes: null,
        progressRatio: null,
        phase: "inactive",
        baselineMinutes: baseline,
      },
    }
  }

  if (next.status !== "waiting" || next.estimatedWaitMinutes == null) {
    return {
      snapshot,
      baselineMinutes: baseline,
      model: {
        tokenCode: next.tokenCode,
        status: next.status,
        displayMinutes: null,
        progressRatio: null,
        phase: "unavailable",
        baselineMinutes: baseline,
      },
    }
  }

  const previous = input.previous
  const estimateChanged =
    !previous ||
    previous.estimatedWaitMinutes !== next.estimatedWaitMinutes ||
    previous.tokenCode !== next.tokenCode ||
    previous.status !== next.status

  if (!estimateChanged && previous) {
    // Keep the earlier receivedAt so the countdown continues smoothly.
    snapshot = {
      ...next,
      receivedAtMs: previous.receivedAtMs,
      estimatedWaitMinutes: previous.estimatedWaitMinutes,
    }
  }

  if (baseline == null || estimateChanged) {
    const candidate = snapshot.estimatedWaitMinutes ?? next.estimatedWaitMinutes
    baseline = Math.max(baseline ?? 0, candidate ?? 0, 1)
  }

  const elapsedMinutes = Math.max(
    0,
    Math.floor((nowMs - snapshot.receivedAtMs) / 60_000),
  )
  const remaining = Math.max(
    0,
    (snapshot.estimatedWaitMinutes ?? 0) - elapsedMinutes,
  )

  if (remaining === 0 && elapsedMinutes > 0) {
    return {
      snapshot,
      baselineMinutes: baseline,
      model: {
        tokenCode: next.tokenCode,
        status: next.status,
        displayMinutes: 0,
        progressRatio: 0,
        phase: "estimate_overdue",
        baselineMinutes: baseline,
      },
    }
  }

  const ratio =
    baseline && baseline > 0 ? Math.min(1, Math.max(0, remaining / baseline)) : null

  return {
    snapshot,
    baselineMinutes: baseline,
    model: {
      tokenCode: next.tokenCode,
      status: next.status,
      displayMinutes: remaining,
      progressRatio: ratio,
      phase: "waiting",
      baselineMinutes: baseline,
    },
  }
}

export const WAIT_POLL_MS = 45_000
