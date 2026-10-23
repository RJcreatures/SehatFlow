import type { UiLanguage } from "../i18n/index.ts"

export type TextSize = "md" | "lg" | "xl"
export type ContrastMode = "default" | "high"

export type Preferences = {
  language: UiLanguage
  textSize: TextSize
  contrast: ContrastMode
  /** True after the visitor picks a language (Settings or onboarding). */
  languageChosen: boolean
  /** True after first-launch onboarding finishes (or is deliberately skipped by legacy users). */
  onboardingCompleted: boolean
}

export type PreferencesApi = {
  preferences: Preferences
  setLanguage: (language: UiLanguage) => void
  setTextSize: (textSize: TextSize) => void
  setContrast: (contrast: ContrastMode) => void
  completeOnboarding: () => void
  resetOnboarding: () => void
}
