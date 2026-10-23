import { readyLanguages } from "../i18n/index.ts"
import { PageHeading } from "../components/PageHeading.tsx"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"
import type { ContrastMode, TextSize } from "../preferences/types.ts"

export function SettingsPage() {
  const messages = useMessages()
  const {
    preferences,
    setLanguage,
    setTextSize,
    setContrast,
    resetOnboarding,
  } = usePreferences()

  const sizes: Array<{ id: TextSize; label: string }> = [
    { id: "md", label: messages.textMd },
    { id: "lg", label: messages.textLg },
    { id: "xl", label: messages.textXl },
  ]
  const contrasts: Array<{ id: ContrastMode; label: string }> = [
    { id: "default", label: messages.contrastDefault },
    { id: "high", label: messages.contrastHigh },
  ]

  return (
    <>
      <PageHeading title={messages.settingsTitle}>
        <p>{messages.savedOnDevice}</p>
      </PageHeading>
      <form className="settings-form">
        <fieldset className="settings-group">
          <legend>{messages.language}</legend>
          {readyLanguages().map((language) => (
            <label className="radio-row" key={language.id}>
              <input
                type="radio"
                name="language"
                value={language.id}
                checked={preferences.language === language.id}
                onChange={() => setLanguage(language.id)}
              />
              <span>{language.nativeName}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="settings-group">
          <legend>{messages.textSize}</legend>
          {sizes.map((size) => (
            <label className="radio-row" key={size.id}>
              <input
                type="radio"
                name="text-size"
                value={size.id}
                checked={preferences.textSize === size.id}
                onChange={() => setTextSize(size.id)}
              />
              <span>{size.label}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="settings-group">
          <legend>{messages.contrast}</legend>
          {contrasts.map((mode) => (
            <label className="radio-row" key={mode.id}>
              <input
                type="radio"
                name="contrast"
                value={mode.id}
                checked={preferences.contrast === mode.id}
                onChange={() => setContrast(mode.id)}
              />
              <span>{mode.label}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="settings-group">
          <legend>{messages.onboardingResetLegend}</legend>
          <p>{messages.onboardingResetHint}</p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => resetOnboarding()}
          >
            {messages.onboardingReset}
          </button>
        </fieldset>
      </form>
    </>
  )
}
