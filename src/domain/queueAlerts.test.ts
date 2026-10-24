import { describe, expect, it } from "vitest"
import {
  decideQueueAlerts,
  isRealPhoneCallAttempt,
  shouldShowSimulatedCall,
} from "./queueAlerts.ts"

describe("queue notification decisions", () => {
  it("emits nothing when notifications are disabled", () => {
    expect(
      decideQueueAlerts({
        previous: { tokenCode: "A1", status: "waiting", patientsAhead: 5 },
        next: { tokenCode: "A1", status: "called", patientsAhead: 0 },
        notificationsEnabled: false,
      }),
    ).toEqual([])
  })

  it("notifies once when a token is called", () => {
    const decisions = decideQueueAlerts({
      previous: { tokenCode: "A1", status: "waiting", patientsAhead: 1 },
      next: { tokenCode: "A1", status: "called", patientsAhead: 0 },
      notificationsEnabled: true,
    })
    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.kind).toBe("called")
    expect(decisions[0]?.dedupeKey).toBe("called:A1")
    expect(decisions[0]?.bodyKey).toBe("notifyCalledBody")
  })

  it("notifies when the turn is approaching", () => {
    const decisions = decideQueueAlerts({
      previous: { tokenCode: "A1", status: "waiting", patientsAhead: 5 },
      next: { tokenCode: "A1", status: "waiting", patientsAhead: 2 },
      notificationsEnabled: true,
    })
    expect(decisions[0]?.kind).toBe("approaching")
    expect(decisions[0]?.dedupeKey).toContain("approaching:A1")
  })

  it("does not re-fire called on repeated polls with the same status", () => {
    expect(
      decideQueueAlerts({
        previous: { tokenCode: "A1", status: "called", patientsAhead: 0 },
        next: { tokenCode: "A1", status: "called", patientsAhead: 0 },
        notificationsEnabled: true,
      }),
    ).toEqual([])
  })

  it("keeps notification keys free of access codes and diagnoses", () => {
    const decisions = decideQueueAlerts({
      previous: { tokenCode: "OPD-9", status: "waiting", patientsAhead: 0 },
      next: { tokenCode: "OPD-9", status: "completed", patientsAhead: 0 },
      notificationsEnabled: true,
    })
    const blob = JSON.stringify(decisions)
    expect(blob).not.toMatch(/access|diagnos|phone|patient_id/i)
  })
})

describe("simulated call demo", () => {
  it("requires opt-in and a verified transition to called", () => {
    expect(
      shouldShowSimulatedCall({
        previousStatus: "waiting",
        nextStatus: "called",
        tokenCode: "A1",
        simulatedCallEnabled: false,
        alreadyShownForKey: false,
      }).show,
    ).toBe(false)

    expect(
      shouldShowSimulatedCall({
        previousStatus: "waiting",
        nextStatus: "called",
        tokenCode: "A1",
        simulatedCallEnabled: true,
        alreadyShownForKey: false,
      }).show,
    ).toBe(true)
  })

  it("does not show again after refresh/duplicate for the same token", () => {
    expect(
      shouldShowSimulatedCall({
        previousStatus: "waiting",
        nextStatus: "called",
        tokenCode: "A1",
        simulatedCallEnabled: true,
        alreadyShownForKey: true,
      }).show,
    ).toBe(false)
  })

  it("never treats the simulation as a real phone dial", () => {
    expect(isRealPhoneCallAttempt(null)).toBe(false)
    expect(isRealPhoneCallAttempt("https://example.com")).toBe(false)
    expect(isRealPhoneCallAttempt("tel:+911234567890")).toBe(true)
  })
})
