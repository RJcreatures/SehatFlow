import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { patientNavItems, shouldShowPatientBottomNav } from "./patientNav.ts"
import { shouldShowGlobalAssistant } from "./globalAssistant.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("Ask AI navigation", () => {
  it("keeps a legacy My Turn redirect while bottom nav uses Ask AI", () => {
    const app = readFileSync(join(root, "App.tsx"), "utf8")
    expect(app).toContain('path="/my-turn"')
    expect(app).toContain('path="/ask"')
    expect(app).toContain('path="/slip"')
    expect(app).toContain('path="/emergency"')
    expect(patientNavItems.map((item) => item.id)).toContain("askAi")
    expect(patientNavItems.map((item) => item.to)).not.toContain("/my-turn")
  })

  it("excludes staff, board, and emergency from patient Ask AI chrome", () => {
    expect(shouldShowPatientBottomNav("/staff")).toBe(false)
    expect(shouldShowPatientBottomNav("/board")).toBe(false)
    expect(shouldShowGlobalAssistant("/emergency")).toBe(false)
    expect(shouldShowGlobalAssistant("/ask")).toBe(false)
  })

  it("home page links to Ask AI", () => {
    const home = readFileSync(join(root, "pages/HomePage.tsx"), "utf8")
    expect(home).toContain('to="/ask"')
    expect(home).toContain("askAi")
  })
})
