import { PageHeading } from "../components/PageHeading.tsx"
import { useMessages } from "../preferences/usePreferences.ts"

export function ForecastPage() {
  const messages = useMessages()
  return (
    <PageHeading title={messages.forecastTitle}>
      <p className="status-badge">{messages.notImplemented}</p>
      <p>{messages.forecastBody}</p>
    </PageHeading>
  )
}
