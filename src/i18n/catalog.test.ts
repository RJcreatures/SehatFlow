import { describe, expect, it } from "vitest"
import { en } from "./en.ts"
import { getCatalog } from "./index.ts"
import { hi } from "./hi.ts"
import type { MessageCatalog } from "./types.ts"

const patientFacingKeys = [
  "home",
  "homeGreeting",
  "homeIntro",
  "bottomNav",
  "mySlip",
  "myTurnNav",
  "register",
  "findPlace",
  "settings",
  "onboardingTitle",
  "onboardingEmergency",
  "onboardingNormal",
  "waitAboutTemplate",
  "statusWaiting",
  "statusCalled",
  "slipTitle",
  "myTurnTitle",
  "findTitle",
  "privacyShort",
  "qrScanTitle",
  "waitIndicatorLabel",
  "waitCalledBanner",
  "waitOverdueBanner",
] as const satisfies ReadonlyArray<keyof MessageCatalog>

describe("message catalogs", () => {
  it("keeps English and Hindi keys in sync", () => {
    const enKeys = Object.keys(en).sort()
    const hiKeys = Object.keys(hi).sort()
    expect(hiKeys).toEqual(enKeys)
  })

  it("has a non-empty string for every catalog key in both languages", () => {
    for (const key of Object.keys(en) as Array<keyof MessageCatalog>) {
      expect(en[key].trim().length).toBeGreaterThan(0)
      expect(hi[key].trim().length).toBeGreaterThan(0)
    }
  })

  it("translates primary patient-facing labels into Hindi", () => {
    const english = getCatalog("en")
    const hindi = getCatalog("hi")
    for (const key of patientFacingKeys) {
      expect(hindi[key]).not.toBe(english[key])
    }
  })

  it("keeps wait templates language-specific", () => {
    expect(en.waitAboutTemplate).toContain("{minutes}")
    expect(hi.waitAboutTemplate).toContain("{minutes}")
    expect(hi.waitAboutTemplate).toMatch(/मिनट/)
  })
})
