import { useEffect, useMemo, useState, type ReactNode } from "react"
import type { UiLanguage } from "../i18n/index.ts"
import { PreferencesContext } from "./context.ts"
import { loadPreferences, savePreferences } from "./storage.ts"
import type { ContrastMode, Preferences, TextSize } from "./types.ts"

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences())

  useEffect(() => {
    const root = document.documentElement
    root.lang = preferences.language
    root.dataset.text = preferences.textSize
    root.dataset.contrast = preferences.contrast
    savePreferences(preferences)
  }, [preferences])

  const value = useMemo(
    () => ({
      preferences,
      setLanguage: (language: UiLanguage) => {
        setPreferences((current) => ({
          ...current,
          language,
          languageChosen: true,
        }))
      },
      setTextSize: (textSize: TextSize) => {
        setPreferences((current) => ({ ...current, textSize }))
      },
      setContrast: (contrast: ContrastMode) => {
        setPreferences((current) => ({ ...current, contrast }))
      },
      completeOnboarding: () => {
        setPreferences((current) => ({
          ...current,
          languageChosen: true,
          onboardingCompleted: true,
        }))
      },
      resetOnboarding: () => {
        setPreferences((current) => ({
          ...current,
          onboardingCompleted: false,
        }))
      },
    }),
    [preferences],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}
