import { useState, type FormEvent } from "react"
import { PageHeading } from "../components/PageHeading.tsx"
import { useMessages } from "../preferences/usePreferences.ts"
import { ForecastDashboard } from "../staff/ForecastDashboard.tsx"
import { useStaffAuth } from "../staff/useStaffAuth.ts"

/**
 * Staff-only demand forecast page. Reuses the same auth gate as the queue dashboard.
 */
export function ForecastPage() {
  const messages = useMessages()
  const auth = useStaffAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await auth.signIn(email.trim(), password)
  }

  if (auth.status === "unconfigured") {
    return (
      <PageHeading title={messages.forecastTitle}>
        <p className="form-error" role="status">
          {messages.backendUnconfigured}
        </p>
        <p>{messages.staffAuthNotice}</p>
      </PageHeading>
    )
  }

  if (auth.status === "refused") {
    return (
      <PageHeading title={messages.forecastTitle}>
        <p className="form-error" role="alert">
          {messages.backendRefusedKey}
        </p>
      </PageHeading>
    )
  }

  if (auth.status === "checking") {
    return (
      <PageHeading title={messages.forecastTitle}>
        <p role="status">{messages.staffLoading}</p>
      </PageHeading>
    )
  }

  if (auth.status === "denied") {
    return (
      <PageHeading title={messages.forecastTitle}>
        <p className="form-error" role="alert">
          {messages.staffAccessDenied}
        </p>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => void auth.signOut()}
          disabled={auth.busy}
        >
          {messages.signOut}
        </button>
      </PageHeading>
    )
  }

  if (auth.status === "signed_out") {
    return (
      <PageHeading title={messages.forecastTitle}>
        <p>{messages.staffSignInHint}</p>
        <form className="panel settings-form" onSubmit={onSubmit}>
          <label className="field">
            <span>{messages.emailLabel}</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>{messages.passwordLabel}</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {auth.error ? (
            <p className="form-error" role="alert">
              {auth.error}
            </p>
          ) : null}
          <button type="submit" className="button" disabled={auth.busy}>
            {messages.signIn}
          </button>
        </form>
      </PageHeading>
    )
  }

  return <ForecastDashboard />
}
