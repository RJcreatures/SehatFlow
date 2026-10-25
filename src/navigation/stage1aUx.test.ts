import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { en } from "../i18n/en.ts"
import { localizeQueueStatus } from "../domain/agent/spoken.ts"
import { shouldShowGlobalAssistant } from "./globalAssistant.ts"
import { onboardingVisitPath } from "./onboarding.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("Stage 1A UX cleanup", () => {
  it("makes Register the primary home action and keeps Emergency + Ask + My Slip", () => {
    const home = readFileSync(join(root, "pages/HomePage.tsx"), "utf8")
    const registerIdx = home.indexOf('to="/register"')
    const askIdx = home.indexOf('to="/ask"')
    const emergencyIdx = home.indexOf('to="/emergency"')
    expect(registerIdx).toBeGreaterThan(-1)
    expect(askIdx).toBeGreaterThan(registerIdx)
    expect(emergencyIdx).toBeGreaterThan(-1)
    expect(home).toContain('"/slip"')
    expect(home).not.toContain('"/my-turn"')
    expect(home).toMatch(/className="button"\s+to="\/register"/)
    expect(home).not.toContain("privacyShort")
  })

  it("keeps one gender prefer-not-to-say option on register", () => {
    const page = readFileSync(join(root, "pages/RegisterPage.tsx"), "utf8")
    expect(page).toContain("genderOptional")
    expect(page).not.toContain("genderUndisclosed")
    expect(page).toContain("if (submitting)")
    expect(page).toContain("withRegisterTimeout")
    expect(page).toContain("loadIdempotentRegistration")
    expect(page).toContain("mapRegisterFailure")
  })

  it("uses shared queue status labels for patient and staff", () => {
    expect(localizeQueueStatus("waiting", en)).toBe(en.statusWaiting)
    expect(localizeQueueStatus("called", en)).toBe(en.statusCalled)
    expect(localizeQueueStatus("completed", en)).toBe(en.statusCompleted)
    expect(localizeQueueStatus("no_show", en)).toBe(en.statusNoShow)
    const slip = readFileSync(join(root, "pages/SlipPage.tsx"), "utf8")
    expect(slip).toContain("localizeQueueStatus")
    expect(slip).not.toContain("queueStatusOnly")
    const staff = readFileSync(join(root, "staff/StaffDashboard.tsx"), "utf8")
    expect(staff).toContain("localizeQueueStatus")
    expect(en.voiceAnswerTokenDone).toContain("completed")
  })

  it("preserves Emergency, Ask assistant, My Slip, Find, and forecast routes", () => {
    expect(onboardingVisitPath("emergency")).toBe("/emergency")
    expect(shouldShowGlobalAssistant("/")).toBe(true)
    expect(shouldShowGlobalAssistant("/emergency")).toBe(false)
    const app = readFileSync(join(root, "App.tsx"), "utf8")
    expect(app).toContain('path="/slip"')
    expect(app).toContain('path="/my-turn"')
    expect(app).toContain('path="/find"')
    expect(app).toContain('path="/ask"')
    expect(app).toContain('path="/staff/forecast"')
  })

  it("aligns Ask labels with Ask SehatFlow", () => {
    expect(en.askAi).toBe(en.assistantFabLabel)
    expect(en.askAiNav).toBe(en.assistantFabLabel)
  })
})
