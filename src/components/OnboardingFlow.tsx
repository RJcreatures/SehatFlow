import { useState } from "react"
import { useNavigate } from "react-router"
import { readyLanguages } from "../i18n/index.ts"
import { onboardingVisitPath } from "../navigation/onboarding.ts"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"
import { AppBrand } from "./AppBrand.tsx"
import { IconEmergency, IconRegister } from "./icons.tsx"

type Step = "language" | "visit"

export function OnboardingFlow() {
  const messages = useMessages()
  const { preferences, setLanguage, completeOnboarding } = usePreferences()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(
    preferences.languageChosen ? "visit" : "language",
  )

  function finishNormalVisit() {
    completeOnboarding()
    navigate(onboardingVisitPath("normal"), { replace: true })
  }

  function finishEmergency() {
    completeOnboarding()
    navigate(onboardingVisitPath("emergency"), { replace: true })
  }

  return (
    <section className="onboarding panel" aria-labelledby="onboarding-title">
      <div className="onboarding-brand">
        <AppBrand variant="hero" showTagline />
      </div>
      <h1 id="onboarding-title">{messages.onboardingTitle}</h1>
      <p>{messages.onboardingBody}</p>

      {step === "language" ? (
        <div className="stack-gap" role="group" aria-labelledby="onboarding-language">
          <h2 id="onboarding-language">{messages.onboardingLanguageTitle}</h2>
          <p>{messages.chooseLanguageHint}</p>
          <div className="choice-row onboarding-choices">
            {readyLanguages().map((language) => (
              <button
                key={language.id}
                type="button"
                className={
                  preferences.language === language.id
                    ? "choice is-selected"
                    : "choice"
                }
                onClick={() => setLanguage(language.id)}
              >
                {language.nativeName}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="button"
            onClick={() => {
              setLanguage(preferences.language)
              setStep("visit")
            }}
          >
            {messages.onboardingContinue}
          </button>
          <p className="button-hint">{messages.onboardingLanguageNote}</p>
        </div>
      ) : (
        <div className="stack-gap" role="group" aria-labelledby="onboarding-visit">
          <h2 id="onboarding-visit">{messages.onboardingVisitTitle}</h2>
          <p>{messages.onboardingVisitHint}</p>
          <button
            type="button"
            className="button button-emergency"
            onClick={finishEmergency}
          >
            <IconEmergency />
            <span>
              <span className="button-label">{messages.onboardingEmergency}</span>
              <span className="button-hint">{messages.onboardingEmergencyHint}</span>
            </span>
          </button>
          <button type="button" className="button" onClick={finishNormalVisit}>
            <IconRegister />
            <span>
              <span className="button-label">{messages.onboardingNormal}</span>
              <span className="button-hint">{messages.onboardingNormalHint}</span>
            </span>
          </button>
        </div>
      )}
    </section>
  )
}
