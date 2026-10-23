import { describe, expect, it } from "vitest"
import { reconcileWaitDisplay, type WaitServerSnapshot } from "./waitIndicator.ts"

function snap(
  partial: Partial<WaitServerSnapshot> & Pick<WaitServerSnapshot, "receivedAtMs">,
): WaitServerSnapshot {
  return {
    tokenCode: "GM-004",
    status: "waiting",
    estimatedWaitMinutes: 30,
    patientsAhead: 2,
    ...partial,
  }
}

describe("reconcileWaitDisplay", () => {
  it("counts down from a server estimate using elapsed wall time", () => {
    const first = snap({ receivedAtMs: 1_000_000, estimatedWaitMinutes: 30 })
    const after = reconcileWaitDisplay({
      previous: null,
      next: first,
      baselineMinutes: 30,
      nowMs: 1_000_000,
    })
    expect(after.model.phase).toBe("waiting")
    expect(after.model.displayMinutes).toBe(30)

    const later = reconcileWaitDisplay({
      previous: after.snapshot,
      next: { ...first, receivedAtMs: 1_000_000 + 10 * 60_000 },
      baselineMinutes: after.baselineMinutes,
      nowMs: 1_000_000 + 10 * 60_000,
    })
    // Same estimate on a later poll must keep the original anchor time.
    const ticking = reconcileWaitDisplay({
      previous: later.snapshot,
      next: later.snapshot,
      baselineMinutes: later.baselineMinutes,
      nowMs: 1_000_000 + 10 * 60_000,
    })
    expect(ticking.model.displayMinutes).toBe(20)
    expect(ticking.snapshot.receivedAtMs).toBe(1_000_000)
  })

  it("does not reset the countdown when an identical poll arrives", () => {
    const start = snap({ receivedAtMs: 5_000_000, estimatedWaitMinutes: 25 })
    const first = reconcileWaitDisplay({
      previous: null,
      next: start,
      baselineMinutes: 25,
      nowMs: 5_000_000,
    })
    const identicalPoll = reconcileWaitDisplay({
      previous: first.snapshot,
      next: {
        ...start,
        receivedAtMs: 5_000_000 + 8 * 60_000,
      },
      baselineMinutes: first.baselineMinutes,
      nowMs: 5_000_000 + 8 * 60_000,
    })
    expect(identicalPoll.snapshot.receivedAtMs).toBe(5_000_000)
    expect(identicalPoll.model.displayMinutes).toBe(17)
  })

  it("reconciles when the server estimate changes", () => {
    const start = snap({ receivedAtMs: 2_000_000, estimatedWaitMinutes: 40 })
    const first = reconcileWaitDisplay({
      previous: null,
      next: start,
      baselineMinutes: 40,
      nowMs: 2_000_000,
    })
    const changed = reconcileWaitDisplay({
      previous: first.snapshot,
      next: snap({
        receivedAtMs: 2_000_000 + 5 * 60_000,
        estimatedWaitMinutes: 15,
      }),
      baselineMinutes: first.baselineMinutes,
      nowMs: 2_000_000 + 5 * 60_000,
    })
    expect(changed.model.displayMinutes).toBe(15)
    expect(changed.snapshot.receivedAtMs).toBe(2_000_000 + 5 * 60_000)
  })

  it("stops waiting when the token is called or completed", () => {
    const called = reconcileWaitDisplay({
      previous: null,
      next: snap({
        receivedAtMs: 1,
        status: "called",
        estimatedWaitMinutes: 0,
      }),
      baselineMinutes: 20,
      nowMs: 1,
    })
    expect(called.model.phase).toBe("called")
    expect(called.model.progressRatio).toBe(0)

    const completed = reconcileWaitDisplay({
      previous: null,
      next: snap({
        receivedAtMs: 1,
        status: "completed",
        estimatedWaitMinutes: null,
      }),
      baselineMinutes: 20,
      nowMs: 1,
    })
    expect(completed.model.phase).toBe("completed")
    expect(completed.model.displayMinutes).toBeNull()
  })

  it("marks overdue instead of inventing a call when the local countdown hits zero", () => {
    const start = snap({ receivedAtMs: 9_000_000, estimatedWaitMinutes: 5 })
    const first = reconcileWaitDisplay({
      previous: null,
      next: start,
      baselineMinutes: 5,
      nowMs: 9_000_000,
    })
    const overdue = reconcileWaitDisplay({
      previous: first.snapshot,
      next: first.snapshot,
      baselineMinutes: first.baselineMinutes,
      nowMs: 9_000_000 + 6 * 60_000,
    })
    expect(overdue.model.phase).toBe("estimate_overdue")
    expect(overdue.model.displayMinutes).toBe(0)
  })
})
