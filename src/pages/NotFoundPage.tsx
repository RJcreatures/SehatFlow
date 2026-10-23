import { Link } from "react-router"
import { PageHeading } from "../components/PageHeading.tsx"
import { useMessages } from "../preferences/usePreferences.ts"

export function NotFoundPage() {
  const messages = useMessages()
  return (
    <>
      <PageHeading title={messages.notFoundTitle}>
        <p>{messages.notFoundBody}</p>
      </PageHeading>
      <Link className="button" to="/">
        {messages.home}
      </Link>
    </>
  )
}
