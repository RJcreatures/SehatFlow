import { Link } from "react-router"
import { BusyDaysGuide } from "../components/BusyDaysGuide.tsx"
import { PageHeading } from "../components/PageHeading.tsx"
import { useMessages } from "../preferences/usePreferences.ts"

/**
 * Public visitor page: which weekdays are usually busiest or quietest.
 * Uses only synthetic aggregate weekday averages — no staff auth, no patient data.
 */
export function VisitDaysPage() {
  const messages = useMessages()

  return (
    <>
      <PageHeading title={messages.visitDays}>
        <p>{messages.visitDaysIntro}</p>
      </PageHeading>
      <BusyDaysGuide audience="visitor" />
      <p>
        <Link className="button button-secondary" to="/register">
          {messages.register}
        </Link>
      </p>
    </>
  )
}
