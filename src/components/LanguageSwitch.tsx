import { readyLanguages } from "../i18n/index.ts"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"

export function LanguageSwitch() {
  const { preferences, setLanguage } = usePreferences()
  const messages = useMessages()

  return (
    <div className="choice-row" role="group" aria-label={messages.language}>
      {readyLanguages().map((language) => {
        const selected = preferences.language === language.id
        return (
          <button
            key={language.id}
            type="button"
            className={selected ? "choice is-selected" : "choice"}
            aria-pressed={selected}
            onClick={() => setLanguage(language.id)}
          >
            {language.nativeName}
          </button>
        )
      })}
    </div>
  )
}
