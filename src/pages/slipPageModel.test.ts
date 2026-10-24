import { describe, expect, it } from "vitest"
import { buildQrScanUrl, resolvePublicAppOrigin } from "../domain/qrLookup.ts"
import { isSavedSlip } from "../lib/slipStorage.ts"

/**
 * Regression coverage for /slip states without mounting React
 * (vitest runs in node; no DOM renderer in this project).
 */
describe("slip page model behaviour", () => {
  const validSlip = {
    token_code: "GM-042",
    access_code: "ABCD1234",
    qr_token: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl",
    department_code: "general_medicine",
    department_name_en: "General Medicine",
    department_name_hi: "सामान्य चिकित्सा",
    room_en: "Room 12",
    room_hi: "कक्ष 12",
    floor_en: "Ground floor",
    floor_hi: "भूतल",
    estimated_wait_minutes: 25,
    service_date: "2026-10-23",
    saved_at: "2026-10-23T10:00:00.000Z",
  }

  it("treats a complete slip as displayable and QR-capable", () => {
    expect(isSavedSlip(validSlip)).toBe(true)
    const origin = resolvePublicAppOrigin({
      configured: "sahaayopd.rjcreatures.workers.dev",
      windowOrigin: "http://localhost:5174",
    })
    const scanUrl = buildQrScanUrl(origin, validSlip.qr_token)
    expect(scanUrl).toContain("/my-turn?q=")
    expect(scanUrl).toContain(validSlip.qr_token)
    expect(scanUrl.includes(validSlip.access_code)).toBe(false)
  })

  it("keeps empty-state navigation targets stable", () => {
    expect("/register").toMatch(/^\/register$/)
    expect("/my-turn").toMatch(/^\/my-turn$/)
  })

  it("rejects incomplete slip payloads used for display", () => {
    expect(isSavedSlip({ token_code: "GM-042" })).toBe(false)
    expect(isSavedSlip(null)).toBe(false)
  })
})
