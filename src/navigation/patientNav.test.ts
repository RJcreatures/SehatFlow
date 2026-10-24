import { describe, expect, it } from "vitest"
import { onboardingVisitPath } from "./onboarding.ts"
import {
  mySlipDestination,
  PATIENT_BOTTOM_NAV_SPACE,
  patientNavItems,
  shouldShowPatientBottomNav,
} from "./patientNav.ts"

describe("patient bottom navigation", () => {
  it("exposes core patient routes including home, find, Ask AI, and settings", () => {
    expect(patientNavItems.map((item) => item.to)).toEqual([
      "/",
      "/find",
      "/ask",
      "/settings",
    ])
    expect(patientNavItems.map((item) => item.id)).toEqual([
      "home",
      "find",
      "askAi",
      "settings",
    ])
  })

  it("opens My Slip when a slip exists and registration when it does not", () => {
    expect(mySlipDestination(true)).toBe("/slip")
    expect(mySlipDestination(false)).toBe("/register")
  })

  it("hides the bar on staff and board routes", () => {
    expect(shouldShowPatientBottomNav("/")).toBe(true)
    expect(shouldShowPatientBottomNav("/find")).toBe(true)
    expect(shouldShowPatientBottomNav("/visit-days")).toBe(true)
    expect(shouldShowPatientBottomNav("/staff")).toBe(false)
    expect(shouldShowPatientBottomNav("/staff/forecast")).toBe(false)
    expect(shouldShowPatientBottomNav("/board")).toBe(false)
  })

  it("reserves space so the fixed bar does not cover main content", () => {
    expect(PATIENT_BOTTOM_NAV_SPACE).toMatch(/rem/)
  })
})

describe("onboarding visit choice", () => {
  it("sends emergency choices straight to the emergency page", () => {
    expect(onboardingVisitPath("emergency")).toBe("/emergency")
  })

  it("sends normal visits to the patient home", () => {
    expect(onboardingVisitPath("normal")).toBe("/")
  })
})
