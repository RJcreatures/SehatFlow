import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { appConfig } from "../config/hospital.ts"
import { useMessages } from "../preferences/usePreferences.ts"

const dismissStorageKey = `${appConfig.storageKey}.emergency-bar-dismissed`

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(dismissStorageKey) === "1"
  } catch {
    return false
  }
}

function writeDismissed(): void {
  try {
    sessionStorage.setItem(dismissStorageKey, "1")
  } catch {
    // sessionStorage may be unavailable
  }
}

export function EmergencyBar() {
  const messages = useMessages()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const onEmergency = pathname === "/emergency"
  const [dismissed, setDismissed] = useState(readDismissed)

  if (dismissed) {
    return null
  }

  function dismiss() {
    writeDismissed()
    setDismissed(true)
    if (onEmergency) {
      navigate("/")
    }
  }

  return (
    <nav className="emergency-nav" aria-label={messages.emergencyNav}>
      <div className="emergency-nav-row">
        <Link
          to="/emergency"
          className="emergency-link"
          aria-current={onEmergency ? "page" : undefined}
        >
          <span>{messages.emergencyAction}</span>
          <span className="emergency-hint">{messages.emergencyHint}</span>
        </Link>
        <button
          type="button"
          className="emergency-dismiss"
          onClick={dismiss}
          aria-label={messages.assistantClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </nav>
  )
}
