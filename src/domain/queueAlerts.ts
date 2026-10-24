/**
 * Pure helpers for Phase 9 consent-based queue alerts and simulated call demo.
 * No outbound telephony — simulated call is UI-only.
 */

export type QueueAlertSnapshot = {
  tokenCode: string
  status: string
  patientsAhead: number
}

export type QueueAlertKind = "approaching" | "called" | "status_changed"

export type QueueAlertDecision = {
  kind: QueueAlertKind
  /** Stable dedupe key — never includes access codes or personal data. */
  dedupeKey: string
  /** Privacy-conscious title/body placeholders (caller localizes). */
  titleKey: "notifyApproachingTitle" | "notifyCalledTitle" | "notifyStatusTitle"
  bodyKey: "notifyApproachingBody" | "notifyCalledBody" | "notifyStatusBody"
}

const APPROACHING_AHEAD = 2

/**
 * Decide which opt-in notifications (if any) to fire for a status transition.
 * Returns at most one primary alert per transition (called > approaching > material status).
 */
export function decideQueueAlerts(input: {
  previous: QueueAlertSnapshot | null
  next: QueueAlertSnapshot
  notificationsEnabled: boolean
}): QueueAlertDecision[] {
  if (!input.notificationsEnabled) {
    return []
  }
  const { previous, next } = input
  if (!next.tokenCode) {
    return []
  }

  const decisions: QueueAlertDecision[] = []

  if (next.status === "called" && previous?.status !== "called") {
    decisions.push({
      kind: "called",
      dedupeKey: `called:${next.tokenCode}`,
      titleKey: "notifyCalledTitle",
      bodyKey: "notifyCalledBody",
    })
    return decisions
  }

  if (
    next.status === "waiting" &&
    next.patientsAhead <= APPROACHING_AHEAD &&
    (previous == null ||
      previous.patientsAhead > APPROACHING_AHEAD ||
      previous.status !== "waiting")
  ) {
    decisions.push({
      kind: "approaching",
      dedupeKey: `approaching:${next.tokenCode}:${next.patientsAhead}`,
      titleKey: "notifyApproachingTitle",
      bodyKey: "notifyApproachingBody",
    })
    return decisions
  }

  if (
    previous &&
    previous.tokenCode === next.tokenCode &&
    previous.status !== next.status &&
    next.status !== "waiting"
  ) {
    decisions.push({
      kind: "status_changed",
      dedupeKey: `status:${next.tokenCode}:${next.status}`,
      titleKey: "notifyStatusTitle",
      bodyKey: "notifyStatusBody",
    })
  }

  return decisions
}

/** Simulated call demo: show only when opted in and token just became called. */
export function shouldShowSimulatedCall(input: {
  previousStatus: string | null
  nextStatus: string
  tokenCode: string
  simulatedCallEnabled: boolean
  alreadyShownForKey: boolean
}): { show: boolean; dedupeKey: string } {
  const dedupeKey = `simcall:${input.tokenCode}:called`
  if (!input.simulatedCallEnabled) {
    return { show: false, dedupeKey }
  }
  if (!input.tokenCode) {
    return { show: false, dedupeKey }
  }
  if (input.nextStatus !== "called") {
    return { show: false, dedupeKey }
  }
  if (input.previousStatus === "called") {
    return { show: false, dedupeKey }
  }
  if (input.alreadyShownForKey) {
    return { show: false, dedupeKey }
  }
  return { show: true, dedupeKey }
}

/** Assert the simulated-call path never dials a phone URI. */
export function isRealPhoneCallAttempt(href: string | null | undefined): boolean {
  if (!href) {
    return false
  }
  return /^(tel|sip|callto):/i.test(href.trim())
}
