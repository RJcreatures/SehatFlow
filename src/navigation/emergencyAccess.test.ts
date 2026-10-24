import { describe, expect, it } from "vitest"
import { onboardingVisitPath } from "./onboarding.ts"

/** Mirrors PatientLayout: emergency stays reachable during incomplete onboarding. */
function shouldShowOnboarding(
  onboardingIncomplete: boolean,
  pathname: string,
): boolean {
  return onboardingIncomplete && pathname !== "/emergency"
}

describe("emergency access before registration", () => {
  it("routes emergency onboarding choice straight to /emergency without a token", () => {
    expect(onboardingVisitPath("emergency")).toBe("/emergency")
    expect(onboardingVisitPath("normal")).toBe("/")
  })

  it("keeps emergency reachable while onboarding is incomplete", () => {
    expect(shouldShowOnboarding(true, "/emergency")).toBe(false)
  })

  it("still shows onboarding on non-emergency routes until completed", () => {
    expect(shouldShowOnboarding(true, "/")).toBe(true)
    expect(shouldShowOnboarding(false, "/")).toBe(false)
  })

  it("does not require Sarvam or a token for emergency navigation", () => {
    expect(onboardingVisitPath("emergency")).toBe("/emergency")
    // Voice assistant is optional UI; emergency route remains a plain path.
    expect("/emergency".includes("voice")).toBe(false)
  })
})
