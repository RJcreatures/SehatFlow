import { HelpRequestPanel } from "../components/HelpRequestPanel.tsx"
import { PageHeading } from "../components/PageHeading.tsx"
import { useMessages } from "../preferences/usePreferences.ts"

const signKeys = [
  "signChestPain",
  "signBreathing",
  "signBleeding",
  "signFainting",
  "signWeakness",
  "signInjury",
  "signPregnancy",
  "signChild",
] as const

export function EmergencyPage() {
  const messages = useMessages()

  return (
    <>
      <PageHeading title={messages.emergencyTitle}>
        <p className="emphasis">{messages.emergencyImmediate}</p>
        <p className="emphasis">{messages.emergencyLead}</p>
        <p className="emphasis">{messages.noToken}</p>
        <p className="privacy-note">{messages.emergencyNotAdvice}</p>
      </PageHeading>
      <section className="panel panel-emergency" aria-labelledby="warning-signs">
        <h2 id="warning-signs">{messages.signsTitle}</h2>
        <ul className="sign-list">
          {signKeys.map((key) => (
            <li key={key}>{messages[key]}</li>
          ))}
        </ul>
      </section>
      <section className="panel" aria-labelledby="emergency-numbers">
        <h2 id="emergency-numbers">{messages.numbersTitle}</h2>
        <div className="number-list">
          <a className="button button-emergency" href="tel:112">
            <span>
              <span className="button-label" dir="ltr">
                112
              </span>
              <span className="button-hint">{messages.number112Label}</span>
            </span>
          </a>
          <a className="button button-emergency" href="tel:108">
            <span>
              <span className="button-label" dir="ltr">
                108
              </span>
              <span className="button-hint">{messages.number108Label}</span>
            </span>
          </a>
        </div>
        <p className="emphasis">{messages.tellStaff}</p>
      </section>
      <HelpRequestPanel />
    </>
  )
}
