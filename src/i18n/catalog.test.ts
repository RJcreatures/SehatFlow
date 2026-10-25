import { describe, expect, it } from "vitest"
import {
  allCatalogs,
  getCatalog,
  getTextDirection,
  isRtlLanguage,
  isUiLanguage,
  readyLanguages,
} from "./index.ts"
import { en } from "./en.ts"
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
  "visitDays",
  "visitDaysHomeHint",
  "visitDaysTitle",
  "visitDaysIntro",
  "settings",
  "onboardingTitle",
  "onboardingEmergency",
  "onboardingNormal",
  "waitAboutTemplate",
  "statusWaiting",
  "statusCalled",
  "slipTitle",
  "slipEmptyHint",
  "slipGoRegister",
  "myTurnTitle",
  "findTitle",
  "privacyShort",
  "qrScanTitle",
  "waitIndicatorLabel",
  "waitCalledBanner",
  "waitOverdueBanner",
  "findStartQuestion",
  "findDestinationQuestion",
  "findNaturalWalkTo",
  "navWaterStation",
  "findMatcherNote",
  "emergencyAction",
  "emergencyImmediate",
  "emergencyNotAdvice",
  "helpRequestTitle",
  "helpRequestPending",
  "staffUrgentNeedsAttention",
  "forecastSyntheticBanner",
  "forecastLimitsTitle",
  "qrScannerOpen",
  "notifyEnable",
  "notifyCalledTitle",
  "simCallDemoBanner",
  "simCallTitle",
  "voiceTitle",
  "voiceStart",
  "voiceStop",
  "voiceMicDenied",
  "voiceNeedMyTurn",
  "voiceGoEmergency",
  "voiceTextOnlyFallback",
  "assistantFabLabel",
  "assistantDialogTitle",
  "assistantSend",
  "askAi",
  "askAiNav",
  "agentNeedTokenContext",
  "agentRegistered",
  "agentUnsupportedAction",
  "voiceAnswerAppHelp",
  "voiceAnswerRegistrationHelp",
  "voiceStartConversation",
  "voiceStateListening",
  "voiceStateSpeaking",
  "voiceStateReconnecting",
] as const satisfies ReadonlyArray<keyof MessageCatalog>

const templateKeys = [
  "waitAboutTemplate",
  "waitUpdated",
  "qrImageAlt",
  "findDuration",
  "findStepStart",
  "findStepWalk",
  "findStepLift",
  "findStepRamp",
  "findStepStairs",
  "findStepArrive",
  "findStepFloorChange",
  "findNaturalStart",
  "findNaturalWalkTo",
  "findNaturalTurnLeft",
  "findNaturalTurnRight",
  "findNaturalLift",
  "findNaturalRamp",
  "findNaturalStairs",
  "findNaturalArrive",
  "findNaturalSamePlace",
  "staffUrgentNeedsAttention",
  "voiceAnswerToken",
  "voiceAnswerTokenNoWait",
  "voiceAnswerTokenCalled",
  "voiceAnswerTokenDone",
  "voiceAnswerWait",
  "voiceAnswerDepartment",
  "agentRegistered",
  "agentNavigated",
  "forecastAvgPerDay",
  "forecastSimpleMethod",
  "visitDaysDepartmentNote",
  "notifyApproachingBody",
  "notifyCalledBody",
  "notifyStatusBody",
  "simCallBody",
  "registerUncertain",
  "staffQrIdentified",
  "confirmCallNextToken",
  "confirmCompleteToken",
  "confirmNoShowToken",
  "confirmSendToEndToken",
  "confirmReassignToken",
  "actionReassignedDetail",
  "notifyCalledBody",
  "notifyApproachingBody",
  "notifyStatusBody",
  "simCallBody",
] as const satisfies ReadonlyArray<keyof MessageCatalog>

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[0]!)
}

describe("voice assistant localization", () => {
  it("keeps Urdu RTL while voice copy stays native script", () => {
    expect(isRtlLanguage("ur")).toBe(true)
    expect(getTextDirection("ur")).toBe("rtl")
    expect(getCatalog("ur").voiceTitle.length).toBeGreaterThan(0)
    expect(getCatalog("ur").voiceTextOnlyFallback.length).toBeGreaterThan(0)
    expect(getCatalog("ur").assistantFabLabel.length).toBeGreaterThan(0)
    expect(getCatalog("hi").assistantDialogTitle.length).toBeGreaterThan(0)
  })
})

describe("message catalogs", () => {
  it("exposes nine UI-ready locales with native-script names", () => {
    const ids = readyLanguages().map((language) => language.id)
    expect(ids).toEqual(["en", "hi", "pa", "ur", "bn", "mr", "ta", "te", "gu"])
    expect(readyLanguages().find((item) => item.id === "ur")?.nativeName).toBe(
      "اردو",
    )
    expect(readyLanguages().find((item) => item.id === "pa")?.nativeName).toBe(
      "ਪੰਜਾਬੀ",
    )
  })

  it("keeps every UI-ready catalog on the same key set as English", () => {
    const enKeys = Object.keys(en).sort()
    for (const { id, catalog } of allCatalogs()) {
      expect(Object.keys(catalog).sort(), id).toEqual(enKeys)
    }
  })

  it("has a non-empty string for every catalog key in every locale", () => {
    for (const { id, catalog } of allCatalogs()) {
      for (const key of Object.keys(en) as Array<keyof MessageCatalog>) {
        expect(String(catalog[key]).trim().length, `${id}.${key}`).toBeGreaterThan(
          0,
        )
      }
    }
  })

  it("does not leave patient-facing strings identical to English", () => {
    const english = getCatalog("en")
    for (const { id, catalog } of allCatalogs()) {
      if (id === "en") {
        continue
      }
      for (const key of patientFacingKeys) {
        expect(catalog[key], `${id}.${key}`).not.toBe(english[key])
      }
    }
  })

  it("preserves interpolation variables in dynamic templates", () => {
    for (const { id, catalog } of allCatalogs()) {
      for (const key of templateKeys) {
        expect(placeholders(String(catalog[key])).sort(), `${id}.${key}`).toEqual(
          placeholders(String(en[key])).sort(),
        )
      }
    }
  })

  it("switches catalogs after locale change without a reload", () => {
    expect(getCatalog("en").mySlip).toBe("My Slip")
    expect(getCatalog("hi").mySlip).not.toBe(getCatalog("en").mySlip)
    expect(getCatalog("ur").mySlip).not.toBe(getCatalog("en").mySlip)
    expect(getCatalog("ta").findTitle.length).toBeGreaterThan(0)
    expect(isUiLanguage("gu")).toBe(true)
    expect(isUiLanguage("kn")).toBe(false)
  })

  it("enables RTL only for Urdu", () => {
    for (const language of readyLanguages()) {
      if (language.id === "ur") {
        expect(isRtlLanguage(language.id)).toBe(true)
        expect(getTextDirection(language.id)).toBe("rtl")
      } else {
        expect(isRtlLanguage(language.id)).toBe(false)
        expect(getTextDirection(language.id)).toBe("ltr")
      }
    }
  })

  it("keeps wait templates language-specific", () => {
    expect(en.waitAboutTemplate).toContain("{minutes}")
    expect(getCatalog("hi").waitAboutTemplate).toMatch(/मिनट/)
    expect(getCatalog("ur").waitAboutTemplate).toContain("{minutes}")
    expect(getCatalog("pa").waitAboutTemplate).toContain("{minutes}")
  })
})
