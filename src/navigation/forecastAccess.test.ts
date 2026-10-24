import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { shouldShowPatientBottomNav } from "./patientNav.ts"
import { shouldShowGlobalAssistant } from "./globalAssistant.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("forecast staff-only access", () => {
  it("keeps /staff/forecast on the staff layout and out of patient chrome", () => {
    const app = readFileSync(join(root, "App.tsx"), "utf8")
    expect(app).toContain('path="/staff/forecast"')
    expect(app).toMatch(/StaffLayout[\s\S]*\/staff\/forecast/)

    expect(shouldShowPatientBottomNav("/staff/forecast")).toBe(false)
    expect(shouldShowGlobalAssistant("/staff/forecast")).toBe(false)
  })

  it("gates ForecastPage with staff auth like the queue dashboard", () => {
    const page = readFileSync(join(root, "pages/ForecastPage.tsx"), "utf8")
    expect(page).toContain("useStaffAuth")
    expect(page).toContain("ForecastDashboard")
    expect(page).toContain("signed_out")
  })

  it("exposes a public visit-days guide without staff auth", () => {
    const app = readFileSync(join(root, "App.tsx"), "utf8")
    expect(app).toContain('path="/visit-days"')
    expect(app).toMatch(/PatientLayout[\s\S]*\/visit-days/)

    const page = readFileSync(join(root, "pages/VisitDaysPage.tsx"), "utf8")
    expect(page).toContain("BusyDaysGuide")
    expect(page).not.toContain("useStaffAuth")
    expect(page).not.toContain("ForecastDashboard")

    const home = readFileSync(join(root, "pages/HomePage.tsx"), "utf8")
    expect(home).toContain('to="/visit-days"')

    expect(shouldShowPatientBottomNav("/visit-days")).toBe(true)
    expect(shouldShowGlobalAssistant("/visit-days")).toBe(true)
  })
})
