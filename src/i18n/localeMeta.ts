import {
  getHtmlLang,
  getTextDirection,
  isRtlLanguage,
  type UiLanguage,
} from "./index.ts"

/** @deprecated Prefer helpers from ./index.ts — kept for existing imports. */
export const localeDirection = {
  en: "ltr",
  hi: "ltr",
  pa: "ltr",
  ur: "rtl",
  bn: "ltr",
  mr: "ltr",
  ta: "ltr",
  te: "ltr",
  gu: "ltr",
} as const satisfies Record<UiLanguage, "ltr" | "rtl">

export const localeHtmlLang = {
  en: "en",
  hi: "hi",
  pa: "pa",
  ur: "ur",
  bn: "bn",
  mr: "mr",
  ta: "ta",
  te: "te",
  gu: "gu",
} as const satisfies Record<UiLanguage, string>

export { getHtmlLang, getTextDirection, isRtlLanguage }
