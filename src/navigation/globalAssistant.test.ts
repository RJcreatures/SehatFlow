import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  GLOBAL_ASSISTANT_ROUTES,
  shouldShowGlobalAssistant,
} from "./globalAssistant.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("global assistant visibility", () => {
  it("shows on core patient routes", () => {
    for (const path of GLOBAL_ASSISTANT_ROUTES) {
      expect(shouldShowGlobalAssistant(path)).toBe(true)
    }
  })

  it("hides on staff, board, emergency, and full-page Ask AI", () => {
    expect(shouldShowGlobalAssistant("/staff")).toBe(false)
    expect(shouldShowGlobalAssistant("/staff/forecast")).toBe(false)
    expect(shouldShowGlobalAssistant("/board")).toBe(false)
    expect(shouldShowGlobalAssistant("/emergency")).toBe(false)
    expect(shouldShowGlobalAssistant("/ask")).toBe(false)
  })

  it("is mounted from PatientLayout and hidden in print CSS", () => {
    const layout = readFileSync(
      join(root, "components/PatientLayout.tsx"),
      "utf8",
    )
    expect(layout).toContain("GlobalAssistant")
    expect(layout).not.toContain("StaffLayout")

    const staff = readFileSync(join(root, "components/StaffLayout.tsx"), "utf8")
    expect(staff).not.toContain("GlobalAssistant")

    const css = readFileSync(join(root, "index.css"), "utf8")
    expect(css).toMatch(/@media print[\s\S]*\.global-assistant/)
    expect(css).toContain(".global-assistant-fab")
  })
})
