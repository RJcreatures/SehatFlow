import { bn } from "./bn.ts"
import { en } from "./en.ts"
import { gu } from "./gu.ts"
import { hi } from "./hi.ts"
import { mr } from "./mr.ts"
import { pa } from "./pa.ts"
import { ta } from "./ta.ts"
import { te } from "./te.ts"
import { ur } from "./ur.ts"
import type { MessageCatalog } from "./types.ts"

export type { MessageCatalog } from "./types.ts"

/**
 * UI-ready languages are selectable in onboarding and Settings.
 * Screen components read getCatalog(); they do not hardcode language lists.
 */
export const languagePlans = [
  { id: "en", nativeName: "English", uiReady: true, dir: "ltr", htmlLang: "en" },
  { id: "hi", nativeName: "हिन्दी", uiReady: true, dir: "ltr", htmlLang: "hi" },
  { id: "pa", nativeName: "ਪੰਜਾਬੀ", uiReady: true, dir: "ltr", htmlLang: "pa" },
  { id: "ur", nativeName: "اردو", uiReady: true, dir: "rtl", htmlLang: "ur" },
  { id: "bn", nativeName: "বাংলা", uiReady: true, dir: "ltr", htmlLang: "bn" },
  { id: "mr", nativeName: "मराठी", uiReady: true, dir: "ltr", htmlLang: "mr" },
  { id: "ta", nativeName: "தமிழ்", uiReady: true, dir: "ltr", htmlLang: "ta" },
  { id: "te", nativeName: "తెలుగు", uiReady: true, dir: "ltr", htmlLang: "te" },
  { id: "gu", nativeName: "ગુજરાતી", uiReady: true, dir: "ltr", htmlLang: "gu" },
] as const

type LanguagePlan = (typeof languagePlans)[number]
export type UiLanguage = Extract<LanguagePlan, { uiReady: true }>["id"]
export type TextDirection = LanguagePlan["dir"]

const catalogs = {
  en,
  hi,
  pa,
  ur,
  bn,
  mr,
  ta,
  te,
  gu,
} satisfies Record<UiLanguage, MessageCatalog>

export function readyLanguages() {
  return languagePlans.filter(
    (language): language is Extract<LanguagePlan, { uiReady: true }> =>
      language.uiReady,
  )
}

export function isUiLanguage(value: unknown): value is UiLanguage {
  return readyLanguages().some((language) => language.id === value)
}

export function getCatalog(language: UiLanguage): MessageCatalog {
  return catalogs[language]
}

export function getLanguagePlan(language: UiLanguage) {
  return readyLanguages().find((item) => item.id === language)!
}

export function isRtlLanguage(language: UiLanguage): boolean {
  return getLanguagePlan(language).dir === "rtl"
}

export function getHtmlLang(language: UiLanguage): string {
  return getLanguagePlan(language).htmlLang
}

export function getTextDirection(language: UiLanguage): TextDirection {
  return getLanguagePlan(language).dir
}

/** All UI-ready catalogs for parity tests. */
export function allCatalogs(): Array<{ id: UiLanguage; catalog: MessageCatalog }> {
  return readyLanguages().map((language) => ({
    id: language.id,
    catalog: catalogs[language.id],
  }))
}
