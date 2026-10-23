export type DemoClockScale = 1 | 10

export type DemoClockState = {
  scale: DemoClockScale
  realAnchor: Date
  simAnchor: Date
}

/** Simulated time shared by queue order, breaks, and wait estimates. */
export function simulatedNow(clock: DemoClockState, wallNow: Date): Date {
  const elapsedMs = wallNow.getTime() - clock.realAnchor.getTime()
  return new Date(clock.simAnchor.getTime() + elapsedMs * clock.scale)
}

export function breakRemainingMinutes(
  breakEndsAt: Date | null,
  now: Date,
): number {
  if (!breakEndsAt) {
    return 0
  }
  const remainingMs = breakEndsAt.getTime() - now.getTime()
  if (remainingMs <= 0) {
    return 0
  }
  return Math.ceil(remainingMs / 60_000)
}

export function anchorsForScaleChange(
  clock: DemoClockState,
  nextScale: DemoClockScale,
  wallNow: Date,
): DemoClockState {
  return {
    scale: nextScale,
    realAnchor: wallNow,
    simAnchor: simulatedNow(clock, wallNow),
  }
}
