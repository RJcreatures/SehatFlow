import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { PageHeading } from "../components/PageHeading.tsx"
import { formatAboutWaitMinutes } from "../domain/queue.ts"
import { captureQrTokenFromSearch } from "../domain/qrLookup.ts"
import { validateMyTurnInput } from "../domain/registration.ts"
import {
  getSupabaseClient,
  readSupabaseState,
} from "../lib/supabase/client.ts"
import {
  getMyTurn,
  type MyTurnResponse,
} from "../lib/supabase/patientApi.ts"
import { loadSlip } from "../lib/slipStorage.ts"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"

export function MyTurnPage() {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const location = useLocation()
  const navigate = useNavigate()
  const supabaseState = readSupabaseState(import.meta.env)
  const client = getSupabaseClient()
  const qrHandled = useRef(false)
  const [tokenCode, setTokenCode] = useState(() => loadSlip()?.token_code ?? "")
  const [accessCode, setAccessCode] = useState(
    () => loadSlip()?.access_code ?? "",
  )
  const [result, setResult] = useState<MyTurnResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [qrLookup, setQrLookup] = useState(false)

  useEffect(() => {
    if (qrHandled.current) {
      return
    }
    const { qrToken, cleanedSearch } = captureQrTokenFromSearch(location.search)
    if (!qrToken) {
      return
    }
    qrHandled.current = true
    const nextUrl = `${location.pathname}${cleanedSearch}${location.hash}`
    navigate(nextUrl, { replace: true })
    void runQrLookup(qrToken)
    // Intentionally once per mount for a present ?q= token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runQrLookup(qrToken: string) {
    setError(null)
    setResult(null)
    setQrLookup(true)

    if (supabaseState.status === "unconfigured") {
      setError(messages.backendUnconfigured)
      setQrLookup(false)
      return
    }
    if (supabaseState.status === "refused") {
      setError(messages.backendRefusedKey)
      setQrLookup(false)
      return
    }
    if (!client) {
      setError(messages.backendUnconfigured)
      setQrLookup(false)
      return
    }

    setLoading(true)
    const { data, error: lookupError } = await getMyTurn(client, {
      qr_token: qrToken,
    })
    setLoading(false)
    setQrLookup(false)

    if (lookupError || !data) {
      setError(messages.qrInvalid)
      return
    }
    if (typeof data === "object" && data !== null && "error" in data) {
      setError(messages.qrInvalid)
      return
    }

    setResult(data)
    setTokenCode(data.token_code)
  }

  async function runLookup(nextToken: string, nextAccess: string) {
    setError(null)
    setResult(null)

    if (supabaseState.status === "unconfigured") {
      setError(messages.backendUnconfigured)
      return
    }
    if (supabaseState.status === "refused") {
      setError(messages.backendRefusedKey)
      return
    }
    if (!client) {
      setError(messages.backendUnconfigured)
      return
    }

    const parsed = validateMyTurnInput({
      tokenCode: nextToken,
      accessCode: nextAccess,
    })
    if (!parsed.ok) {
      setError(
        parsed.field === "token"
          ? messages.myTurnInvalidToken
          : messages.myTurnInvalidAccess,
      )
      return
    }

    setLoading(true)
    const { data, error: lookupError } = await getMyTurn(client, {
      token_code: parsed.tokenCode,
      access_code: parsed.accessCode,
    })
    setLoading(false)

    if (lookupError || !data) {
      setError(messages.myTurnInvalidCredentials)
      return
    }

    if (typeof data === "object" && data !== null && "error" in data) {
      setError(messages.myTurnInvalidCredentials)
      return
    }

    setResult(data)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await runLookup(tokenCode, accessCode)
  }

  const departmentName = result
    ? preferences.language === "hi"
      ? result.department_name_hi
      : result.department_name_en
    : null
  const room = result
    ? preferences.language === "hi"
      ? result.room_hi
      : result.room_en
    : null
  const floor = result
    ? preferences.language === "hi"
      ? result.floor_hi
      : result.floor_en
    : null

  return (
    <>
      <PageHeading title={messages.myTurnTitle}>
        <p>{messages.myTurnLiveBody}</p>
        <p>{messages.queueStatusOnly}</p>
      </PageHeading>

      {qrLookup || (loading && !result) ? (
        <p className="panel" role="status">
          {messages.qrLookingUp}
        </p>
      ) : null}

      <form className="panel settings-form" onSubmit={onSubmit} noValidate>
        <label className="field">
          <span>{messages.tokenLabel}</span>
          <input
            name="token_code"
            value={tokenCode}
            onChange={(event) => setTokenCode(event.target.value)}
            autoCapitalize="characters"
            required
          />
        </label>
        <label className="field">
          <span>{messages.accessCodeLabel}</span>
          <input
            name="access_code"
            value={accessCode}
            onChange={(event) => setAccessCode(event.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            required
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {error === messages.qrInvalid ? (
          <p>{messages.qrInvalidHint}</p>
        ) : null}
        <button
          type="submit"
          className="button"
          disabled={loading || supabaseState.status !== "ready"}
        >
          {loading ? messages.myTurnChecking : messages.myTurnCheck}
        </button>
      </form>

      {result ? (
        <section className="panel" aria-label={messages.myTurnTitle}>
          <p className="slip-hero-label">{messages.tokenLabel}</p>
          <p className="slip-hero-token">{result.token_code}</p>
          <p
            className={`status-banner status-${result.status}`}
            role="status"
          >
            <span className="status-banner-mark" aria-hidden="true">
              {statusMark(result.status)}
            </span>
            <span>
              {messages.statusLabel}: {statusLabel(result.status, messages)}
            </span>
          </p>
          <dl className="facts">
            <div>
              <dt>{messages.departmentLabel}</dt>
              <dd>{departmentName}</dd>
            </div>
            <div>
              <dt>{messages.roomLabel}</dt>
              <dd>
                {room} · {floor}
              </dd>
            </div>
            <div>
              <dt>{messages.aheadLabel}</dt>
              <dd>{result.patients_ahead}</dd>
            </div>
            <div>
              <dt>{messages.waitLabel}</dt>
              <dd>
                {result.estimated_wait_minutes == null
                  ? messages.notAvailable
                  : formatAboutWaitMinutes(
                      result.estimated_wait_minutes,
                      messages.waitAboutTemplate,
                    )}
              </dd>
            </div>
            <div>
              <dt>{messages.serviceDateLabel}</dt>
              <dd>{result.service_date}</dd>
            </div>
          </dl>
          <Link className="button button-secondary" to="/find">
            {messages.findPlace}
          </Link>
        </section>
      ) : null}
    </>
  )
}

function statusLabel(
  status: string,
  messages: ReturnType<typeof useMessages>,
): string {
  switch (status) {
    case "waiting":
      return messages.statusWaiting
    case "called":
      return messages.statusCalled
    case "completed":
      return messages.statusCompleted
    case "no_show":
      return messages.statusNoShow
    case "skipped":
      return messages.statusSkipped
    case "cancelled":
      return messages.statusCancelled
    default:
      return status
  }
}

function statusMark(status: string): string {
  switch (status) {
    case "waiting":
      return "…"
    case "called":
      return "!"
    case "completed":
      return "✓"
    case "no_show":
    case "skipped":
    case "cancelled":
      return "—"
    default:
      return "·"
  }
}
