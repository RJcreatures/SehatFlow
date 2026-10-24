import { appConfig } from "../config/hospital.ts"
import { isUiLanguage } from "../i18n/index.ts"
import type { ContrastMode, Preferences, TextSize } from "./types.ts"

export const defaultPreferences: Preferences = {
  language: "en",
  textSize: "md",
  contrast: "default",
  languageChosen: false,
  onboardingCompleted: false,
  queueNotificationsEnabled: false,
  simulatedCallEnabled: false,
}

function isTextSize(value: unknown): value is TextSize {
  return value === "md" || value === "lg" || value === "xl"
}

function isContrast(value: unknown): value is ContrastMode {
  return value === "default" || value === "high"
}

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(appConfig.storageKey)
    if (!raw) return defaultPreferences
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return defaultPreferences
    const record = parsed as Partial<Preferences> & {
      onboardingCompleted?: unknown
    }
    const languageChosen = record.languageChosen === true
    // Returning visitors who already chose a language before onboarding existed
    // should not be forced through the welcome flow again.
    const onboardingCompleted =
      record.onboardingCompleted === true ||
      (record.onboardingCompleted === undefined && languageChosen)

    return {
      language: isUiLanguage(record.language)
        ? record.language
        : defaultPreferences.language,
      textSize: isTextSize(record.textSize)
        ? record.textSize
        : defaultPreferences.textSize,
      contrast: isContrast(record.contrast)
        ? record.contrast
        : defaultPreferences.contrast,
      languageChosen,
      onboardingCompleted,
      queueNotificationsEnabled: record.queueNotificationsEnabled === true,
      simulatedCallEnabled: record.simulatedCallEnabled === true,
    }
  } catch {
    return defaultPreferences
  }
}

export function savePreferences(preferences: Preferences) {
  try {
    localStorage.setItem(appConfig.storageKey, JSON.stringify(preferences))
  } catch {
    // Preferences still apply for this visit if storage is blocked.
  }
}
