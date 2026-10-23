import { Link, useLocation } from "react-router"
import { useMessages } from "../preferences/usePreferences.ts"

export function EmergencyBar() {
  const messages = useMessages()
  const { pathname } = useLocation()
  const onEmergency = pathname === "/emergency"

  return (
    <nav className="emergency-nav" aria-label={messages.emergencyNav}>
      <Link
        to="/emergency"
        className="emergency-link"
        aria-current={onEmergency ? "page" : undefined}
      >
        <span>{messages.emergencyAction}</span>
        <span className="emergency-hint">{messages.emergencyHint}</span>
      </Link>
    </nav>
  )
}
