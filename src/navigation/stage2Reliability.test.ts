import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { WAIT_POLL_MS } from "../domain/waitIndicator.ts"
import { onboardingVisitPath } from "./onboarding.ts"
import { shouldShowGlobalAssistant } from "./globalAssistant.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const repo = join(root, "..")

describe("Stage 2 reliability fixes", () => {
  it("polls patient status faster than a 45s miss window and marks stale refreshes", () => {
    expect(WAIT_POLL_MS).toBeLessThanOrEqual(15_000)
    const wait = readFileSync(join(root, "components/WaitIndicator.tsx"), "utf8")
    expect(wait).toContain("waitStaleBanner")
    expect(wait).toContain("setStale(true)")
    const slip = readFileSync(join(root, "pages/SlipPage.tsx"), "utf8")
    expect(slip).toContain("WAIT_POLL_MS")
    const board = readFileSync(join(root, "pages/BoardPage.tsx"), "utf8")
    expect(board).toContain("boardStaleBanner")
  })

  it("keeps Find map path aligned with written directions without mismatched hop numbers", () => {
    const map = readFileSync(join(root, "components/HospitalMap.tsx"), "utf8")
    expect(map).toContain("hospital-map-route-line")
    expect(map).toContain("route.path")
    const find = readFileSync(join(root, "pages/FindPage.tsx"), "utf8")
    expect(find).toContain("findWhereGoing")
    expect(find).toContain("findShowRoute")
    expect(find).toContain("routePathSignature")
  })

  it("guards staff actions until refresh finishes and names the token in confirms", () => {
    const staff = readFileSync(join(root, "staff/StaffDashboard.tsx"), "utf8")
    expect(staff).toContain("if (!client || actionBusy)")
    expect(staff).toContain("finally")
    expect(staff).toContain("confirmCallNextToken")
    expect(staff).toContain("confirmCompleteToken")
    expect(staff).toContain("actionReassignedDetail")
    expect(staff).toContain("localizedDepartmentName")
  })

  it("ships an additive migration that preserves send-to-end token codes and reassign credentials", () => {
    const migration = readFileSync(
      join(
        repo,
        "supabase/migrations/20261024143000_stage2_preserve_patient_tokens.sql",
      ),
      "utf8",
    )
    expect(migration).toMatch(/token_code/i)
    expect(migration).toContain("queue_access_codes")
    expect(migration).toContain("queue_qr_tokens")
    expect(migration).toMatch(/Keep token_code/)
  })

  it("preserves emergency independence and forecasting route", () => {
    expect(onboardingVisitPath("emergency")).toBe("/emergency")
    expect(shouldShowGlobalAssistant("/emergency")).toBe(false)
    const app = readFileSync(join(root, "App.tsx"), "utf8")
    expect(app).toContain('path="/staff/forecast"')
    expect(app).toContain('path="/ask"')
  })
})
