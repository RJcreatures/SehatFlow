import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { onboardingVisitPath } from "./onboarding.ts"
import { shouldShowPatientBottomNav } from "./patientNav.ts"
import { shouldShowGlobalAssistant } from "./globalAssistant.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("Phase 9 stretch integration", () => {
  it("adds an in-app QR scanner on My Turn without weakening lookup", () => {
    const page = readFileSync(join(root, "pages/MyTurnPage.tsx"), "utf8")
    expect(page).toContain("QrScanner")
    expect(page).toContain("runQrLookup")
    expect(page).toContain("qr_token")
    expect(page).not.toMatch(/tel:/i)
  })

  it("keeps emergency independent of scanner, notifications, and sim call", () => {
    expect(onboardingVisitPath("emergency")).toBe("/emergency")
    expect(shouldShowGlobalAssistant("/emergency")).toBe(false)
    expect(shouldShowPatientBottomNav("/emergency")).toBe(true)
    const emergency = readFileSync(join(root, "pages/EmergencyPage.tsx"), "utf8")
    expect(emergency).not.toContain("QrScanner")
    expect(emergency).not.toContain("Notification")
    expect(emergency).not.toContain("SimulatedCall")
  })

  it("keeps staff forecast and public visit-days routes intact", () => {
    const app = readFileSync(join(root, "App.tsx"), "utf8")
    expect(app).toContain('path="/staff/forecast"')
    expect(app).toContain('path="/visit-days"')
    expect(app).toContain('path="/ask"')
  })

  it("labels the call demo as simulated and never dials", () => {
    const modal = readFileSync(
      join(root, "components/SimulatedCallModal.tsx"),
      "utf8",
    )
    expect(modal).toContain("simCallDemoBanner")
    expect(modal).toContain("simCallNoRealCall")
    expect(modal).not.toMatch(/tel:|sip:|callto:/i)
    const settings = readFileSync(join(root, "pages/SettingsPage.tsx"), "utf8")
    expect(settings).toContain("setSimulatedCallEnabled")
    expect(settings).toContain("requestNotificationPermission")
  })
})
