import { Link } from "react-router"
import {
  IconEmergency,
  IconPlace,
  IconRegister,
  IconSlip,
} from "../components/icons.tsx"
import { PageHeading } from "../components/PageHeading.tsx"
import { loadSlip } from "../lib/slipStorage.ts"
import { useMessages } from "../preferences/usePreferences.ts"

export function HomePage() {
  const messages = useMessages()
  const hasSlip = loadSlip() !== null

  return (
    <>
      <PageHeading title={messages.homeGreeting}>
        <p>{messages.homeIntro}</p>
      </PageHeading>
      <nav className="action-list" aria-label={messages.primaryNav}>
        <Link className="button" to="/register">
          <IconRegister />
          <span>
            <span className="button-label">{messages.register}</span>
            <span className="button-hint">{messages.registerHint}</span>
          </span>
        </Link>
        <Link
          className="button button-secondary"
          to={hasSlip ? "/slip" : "/my-turn"}
        >
          <IconSlip />
          <span>
            <span className="button-label">
              {hasSlip ? messages.mySlip : messages.myTurn}
            </span>
            <span className="button-hint">
              {hasSlip ? messages.mySlipHint : messages.myTurnHint}
            </span>
          </span>
        </Link>
        <Link className="button button-secondary" to="/find">
          <IconPlace />
          <span>
            <span className="button-label">{messages.findPlace}</span>
            <span className="button-hint">{messages.findPlaceHint}</span>
          </span>
        </Link>
        <Link className="button button-emergency" to="/emergency">
          <IconEmergency />
          <span>
            <span className="button-label">{messages.emergency}</span>
            <span className="button-hint">{messages.emergencyTileHint}</span>
          </span>
        </Link>
      </nav>
      <p className="privacy-note">{messages.privacyShort}</p>
    </>
  )
}
