import { Link } from "react-router"
import {
  IconAsk,
  IconEmergency,
  IconPlace,
  IconRegister,
  IconSlip,
  IconVisitDays,
} from "../components/icons.tsx"
import { LiveQueuesPanel } from "../components/LiveQueuesPanel.tsx"
import { PageHeading } from "../components/PageHeading.tsx"
import { useMessages } from "../preferences/usePreferences.ts"

export function HomePage() {
  const messages = useMessages()

  return (
    <>
      <PageHeading title={messages.homeGreeting}>
        <p className="status-line">
          <Link className="choice" to="/staff">
            {messages.staffHomeLink}
          </Link>
        </p>
      </PageHeading>
      <LiveQueuesPanel />
      <nav className="action-list" aria-label={messages.primaryNav}>
        <Link className="button" to="/register">
          <IconRegister />
          <span>
            <span className="button-label">{messages.register}</span>
          </span>
        </Link>
        <Link className="button button-secondary" to="/slip">
          <IconSlip />
          <span>
            <span className="button-label">{messages.mySlip}</span>
          </span>
        </Link>
        <Link className="button button-secondary" to="/ask">
          <IconAsk />
          <span>
            <span className="button-label">{messages.askAi}</span>
          </span>
        </Link>
        <Link className="button button-secondary" to="/find">
          <IconPlace />
          <span>
            <span className="button-label">{messages.findPlace}</span>
          </span>
        </Link>
        <Link className="button button-secondary" to="/visit-days">
          <IconVisitDays />
          <span>
            <span className="button-label">{messages.visitDays}</span>
          </span>
        </Link>
        <Link className="button button-emergency" to="/emergency">
          <IconEmergency />
          <span>
            <span className="button-label">{messages.emergency}</span>
          </span>
        </Link>
      </nav>
    </>
  )
}
