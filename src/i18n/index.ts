import { en } from "./en.ts"
import { hi } from "./hi.ts"
import type { MessageCatalog } from "./types.ts"

export type { MessageCatalog } from "./types.ts"

/**
 * Voice-agent languages can be added by setting uiReady and registering a catalog.
 * Screen components read getCatalog(); they do not contain language lists.
 */
export const languagePlans = [
  { id: "en", nativeName: "English", uiReady: true },
  { id: "hi", nativeName: "हिन्दी", uiReady: true },
  { id: "bn", nativeName: "বাংলা", uiReady: false },
  { id: "ta", nativeName: "தமிழ்", uiReady: false },
  { id: "te", nativeName: "తెలుగు", uiReady: false },
  { id: "mr", nativeName: "मराठी", uiReady: false },
  { id: "gu", nativeName: "ગુજરાતી", uiReady: false },
  { id: "kn", nativeName: "ಕನ್ನಡ", uiReady: false },
  { id: "ml", nativeName: "മലയാളം", uiReady: false },
  { id: "pa", nativeName: "ਪੰਜਾਬੀ", uiReady: false },
  { id: "or", nativeName: "ଓଡ଼ିଆ", uiReady: false },
  { id: "as", nativeName: "অসমীয়া", uiReady: false },
] as const

type LanguagePlan = (typeof languagePlans)[number]
export type UiLanguage = Extract<LanguagePlan, { uiReady: true }>["id"]

const catalogs = { en, hi } satisfies Record<UiLanguage, MessageCatalog>

export function readyLanguages() {
  return languagePlans.filter(
    (language): language is Extract<LanguagePlan, { uiReady: true }> => language.uiReady,
  )
}

export function isUiLanguage(value: unknown): value is UiLanguage {
  return readyLanguages().some((language) => language.id === value)
}

export function getCatalog(language: UiLanguage): MessageCatalog {
  return catalogs[language]
}
