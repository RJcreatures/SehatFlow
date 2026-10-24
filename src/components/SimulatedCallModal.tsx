import { useMessages } from "../preferences/usePreferences.ts"

type SimulatedCallModalProps = {
  open: boolean
  tokenCode: string
  onDismiss: () => void
}

/**
 * Demo-only “call” UI. Never places a real phone call or stores a phone number.
 */
export function SimulatedCallModal({
  open,
  tokenCode,
  onDismiss,
}: SimulatedCallModalProps) {
  const messages = useMessages()
  if (!open) {
    return null
  }

  return (
    <div
      className="sim-call-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sim-call-title"
    >
      <div className="sim-call-panel panel">
        <p className="forecast-banner" role="status">
          {messages.simCallDemoBanner}
        </p>
        <h2 id="sim-call-title">{messages.simCallTitle}</h2>
        <p>{messages.simCallBody.replace("{token}", tokenCode)}</p>
        <p className="privacy-note">{messages.simCallNoRealCall}</p>
        <button type="button" className="button" onClick={onDismiss}>
          {messages.simCallDismiss}
        </button>
      </div>
    </div>
  )
}
