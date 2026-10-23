import { describe, expect, it } from "vitest"
import { anchorsForScaleChange, breakRemainingMinutes, simulatedNow } from "./clock.ts"
import {
  countPeopleAhead,
  estimateWaitMinutes,
  formatAboutWaitMinutes,
  isValidConsultationDuration,
  meanConsultationMinutes,
  MAX_CONSULTATION_MINUTES,
  MIN_CONSULTATION_MINUTES,
} from "./queue.ts"

function sample(calledIso: string, completedIso: string) {
  return {
    calledAt: new Date(calledIso),
    completedAt: new Date(completedIso),
  }
}

describe("estimateWaitMinutes", () => {
  it("matches the seed hand check: 3 ahead, 10 minutes, 6 late", () => {
    const minutes = estimateWaitMinutes({
      peopleAhead: 3,
      meanDurationMinutes: 10,
      lateMinutes: 6,
      breakRemainingMinutes: 0,
    })
    expect(minutes).toBe(35)
    expect(formatAboutWaitMinutes(minutes)).toBe("About 35 minutes")
    expect(formatAboutWaitMinutes(minutes, "लगभग {minutes} मिनट")).toBe(
      "लगभग 35 मिनट",
    )
  })

  it("matches the sample hand check: 2 ahead, mean 7.4, 8 break", () => {
    const minutes = estimateWaitMinutes({
      peopleAhead: 2,
      meanDurationMinutes: 7.4,
      lateMinutes: 0,
      breakRemainingMinutes: 8,
    })
    expect(minutes).toBe(25)
    expect(formatAboutWaitMinutes(minutes)).toBe("About 25 minutes")
  })

  it("recomputes remaining waits after a completion reduces people ahead", () => {
    const mean = 10
    const before = estimateWaitMinutes({
      peopleAhead: 3,
      meanDurationMinutes: mean,
      lateMinutes: 0,
      breakRemainingMinutes: 0,
    })
    const after = estimateWaitMinutes({
      peopleAhead: 2,
      meanDurationMinutes: mean,
      lateMinutes: 0,
      breakRemainingMinutes: 0,
    })
    expect(before).toBe(30)
    expect(after).toBe(20)
  })
})

describe("countPeopleAhead", () => {
  const peers = [
    { tokenNumber: 1, status: "completed" },
    { tokenNumber: 2, status: "called" },
    { tokenNumber: 3, status: "waiting" },
    { tokenNumber: 4, status: "waiting" },
  ]

  it("counts earlier waiting and called tokens for a waiting patient", () => {
    expect(
      countPeopleAhead({
        ownTokenNumber: 4,
        ownStatus: "waiting",
        peers,
      }),
    ).toBe(2)
  })

  it("returns zero for the called patient", () => {
    expect(
      countPeopleAhead({
        ownTokenNumber: 2,
        ownStatus: "called",
        peers,
      }),
    ).toBe(0)
  })

  it("stops counting a patient after completion", () => {
    const afterComplete = [
      { tokenNumber: 1, status: "completed" },
      { tokenNumber: 2, status: "completed" },
      { tokenNumber: 3, status: "waiting" },
      { tokenNumber: 4, status: "waiting" },
      { tokenNumber: 5, status: "cancelled" },
      { tokenNumber: 6, status: "no_show" },
      { tokenNumber: 7, status: "skipped" },
    ]
    expect(
      countPeopleAhead({
        ownTokenNumber: 4,
        ownStatus: "waiting",
        peers: afterComplete,
      }),
    ).toBe(1)
  })
})

describe("meanConsultationMinutes", () => {
  it("uses the department fallback when there are no samples", () => {
    expect(meanConsultationMinutes([], 12)).toBe(12)
  })

  it("uses a normal consultation duration", () => {
    const samples = [
      sample("2026-10-22T08:00:00.000Z", "2026-10-22T08:10:00.000Z"),
    ]
    expect(meanConsultationMinutes(samples, 99)).toBe(10)
  })

  it("ignores an extreme historical duration and keeps a valid peer sample", () => {
    const samples = [
      sample("2026-10-22T07:00:00.000Z", "2026-10-22T10:00:00.000Z"), // 180 min outlier
      sample("2026-10-22T08:00:00.000Z", "2026-10-22T08:12:00.000Z"), // 12 min
    ]
    expect(meanConsultationMinutes(samples, 99)).toBe(12)
  })

  it("falls back when every historical sample is invalid", () => {
    const samples = [
      sample("2026-10-22T07:00:00.000Z", "2026-10-22T10:00:00.000Z"),
      sample("2026-10-22T08:00:00.000Z", "2026-10-22T08:00:30.000Z"), // < 1 minute
    ]
    expect(meanConsultationMinutes(samples, 10)).toBe(10)
  })

  it("uses the median of recent valid durations", () => {
    const samples = [
      sample("2026-10-22T08:00:00.000Z", "2026-10-22T08:08:00.000Z"),
      sample("2026-10-22T08:10:00.000Z", "2026-10-22T08:20:00.000Z"),
      sample("2026-10-22T08:30:00.000Z", "2026-10-22T08:42:00.000Z"),
    ]
    expect(meanConsultationMinutes(samples, 99)).toBe(10)
  })

  it("rejects the same extreme simulated gap at 1× and 10× demo speeds", () => {
    // Wall: 18 minutes. At 10× that becomes 180 simulated minutes between call and complete.
    const wallCall = new Date("2026-10-22T10:00:00.000Z")
    const wallComplete = new Date("2026-10-22T10:18:00.000Z")
    const clock1 = {
      scale: 1 as const,
      realAnchor: wallCall,
      simAnchor: new Date("2026-10-22T08:00:00.000Z"),
    }
    const clock10 = {
      scale: 10 as const,
      realAnchor: wallCall,
      simAnchor: new Date("2026-10-22T08:00:00.000Z"),
    }

    const duration1x =
      (simulatedNow(clock1, wallComplete).getTime() -
        simulatedNow(clock1, wallCall).getTime()) /
      60_000
    const duration10x =
      (simulatedNow(clock10, wallComplete).getTime() -
        simulatedNow(clock10, wallCall).getTime()) /
      60_000

    expect(duration1x).toBe(18)
    expect(duration10x).toBe(180)
    expect(isValidConsultationDuration(duration1x)).toBe(true)
    expect(isValidConsultationDuration(duration10x)).toBe(false)
    expect(duration10x).toBeGreaterThan(MAX_CONSULTATION_MINUTES)
    expect(MIN_CONSULTATION_MINUTES).toBe(1)

    expect(
      meanConsultationMinutes(
        [
          {
            calledAt: simulatedNow(clock10, wallCall),
            completedAt: simulatedNow(clock10, wallComplete),
          },
        ],
        10,
      ),
    ).toBe(10)
  })
})

describe("demo clock", () => {
  it("advances simulated time by the scale factor", () => {
    const clock = {
      scale: 10 as const,
      realAnchor: new Date("2026-10-22T10:00:00.000Z"),
      simAnchor: new Date("2026-10-22T08:00:00.000Z"),
    }
    const wallNow = new Date("2026-10-22T10:01:00.000Z")
    expect(simulatedNow(clock, wallNow).toISOString()).toBe(
      "2026-10-22T08:10:00.000Z",
    )
  })

  it("reports zero break remaining when the break is in the past", () => {
    expect(
      breakRemainingMinutes(
        new Date("2026-10-22T08:00:00.000Z"),
        new Date("2026-10-22T08:05:00.000Z"),
      ),
    ).toBe(0)
  })

  it("keeps the simulated clock continuous when the scale changes", () => {
    const clock = {
      scale: 1 as const,
      realAnchor: new Date("2026-10-22T10:00:00.000Z"),
      simAnchor: new Date("2026-10-22T08:00:00.000Z"),
    }
    const wallNow = new Date("2026-10-22T10:05:00.000Z")
    const next = anchorsForScaleChange(clock, 10, wallNow)
    expect(next.simAnchor.toISOString()).toBe("2026-10-22T08:05:00.000Z")
    expect(next.realAnchor.toISOString()).toBe(wallNow.toISOString())
    expect(next.scale).toBe(10)
  })
})
