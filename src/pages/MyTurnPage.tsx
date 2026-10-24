import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { PageHeading } from "../components/PageHeading.tsx"
import { QrScanner } from "../components/QrScanner.tsx"
import { formatAboutWaitMinutes } from "../domain/queue.ts"
import type { TokenContext } from "../domain/voice/answers.ts"
import { configuredDepartmentFacts } from "../domain/voice/departmentFacts.ts"
import { localizeQueueStatus } from "../domain/agent/spoken.ts"
import {
  localizedDepartmentName,
  localizedRoomFloor,
} from "../domain/departmentLabels.ts"
import { captureQrTokenFromSearch } from "../domain/qrLookup.ts"
import { WAIT_POLL_MS } from "../domain/waitIndicator.ts"
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
import { useAssistantContext } from "../preferences/AssistantContext.tsx"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"

export function MyTurnPage() {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const { setTokenContext, setDepartments, setRouteContext } =
    useAssistantContext()
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
  const [scannerOpen, setScannerOpen] = useState(false)

  const runQrLookup = useCallback(async (qrToken: string) => {
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
  }, [
    client,
    messages.backendRefusedKey,
    messages.backendUnconfigured,
    messages.qrInvalid,
    supabaseState.status,
  ])

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
  }, [location.hash, location.pathname, location.search, navigate, runQrLookup])

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
    ? localizedDepartmentName(messages, preferences.language, {
        code: result.department_code,
        name_en: result.department_name_en,
        name_hi: result.department_name_hi,
      })
    : null
  const places = result
    ? localizedRoomFloor(preferences.language, result, messages.notAvailable)
    : null
  const room = places?.room ?? null
  const floor = places?.floor ?? null

  const tokenContext = useMemo((): TokenContext | null => {
    if (!result || !departmentName || !room || !floor) {
      return null
    }
    return {
      token_code: result.token_code,
      department_name: departmentName,
      room,
      floor,
      status: result.status,
      estimated_wait_minutes: result.estimated_wait_minutes,
      patients_ahead: result.patients_ahead,
    }
  }, [result, departmentName, room, floor])

  const departments = useMemo(
    () => configuredDepartmentFacts(messages),
    [messages],
  )

  useEffect(() => {
    setTokenContext(tokenContext)
    setDepartments(departments)
    setRouteContext(null)
    return () => {
      setTokenContext(null)
    }
  }, [
    tokenContext,
    departments,
    setTokenContext,
    setDepartments,
    setRouteContext,
  ])

  useEffect(() => {
    if (!result || supabaseState.status !== "ready" || !client) {
      return
    }
    let cancelled = false
    const refreshLive = async () => {
      const slip = loadSlip()
      const request =
        slip?.qr_token && slip.token_code === result.token_code
          ? { qr_token: slip.qr_token }
          : accessCode.trim().length >= 8
            ? {
                token_code: result.token_code,
                access_code: accessCode.trim().toUpperCase(),
              }
            : slip?.access_code && slip.token_code === result.token_code
              ? {
                  token_code: slip.token_code,
                  access_code: slip.access_code,
                }
              : null
      if (!request) {
        return
      }
      const { data, error: lookupError } = await getMyTurn(client, request)
      if (
        cancelled ||
        lookupError ||
        !data ||
        (typeof data === "object" && "error" in data)
      ) {
        return
      }
      setResult(data)
    }
    const timer = window.setInterval(() => {
      void refreshLive()
    }, WAIT_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [accessCode, client, result, supabaseState.status])

  return (
    <>
      <PageHeading title={messages.myTurnTitle}>
        <p>{messages.myTurnLiveBody}</p>
      </PageHeading>

      {qrLookup || (loading && !result) ? (
        <p className="panel" role="status">
          {messages.qrLookingUp}
        </p>
      ) : null}

      {!scannerOpen ? (
        <p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setError(null)
              setScannerOpen(true)
            }}
          >
            {messages.qrScannerOpen}
          </button>
        </p>
      ) : (
        <QrScanner
          active={scannerOpen}
          onDetected={(qrToken) => {
            setScannerOpen(false)
            void runQrLookup(qrToken)
          }}
          onCancel={() => setScannerOpen(false)}
          onUnsupported={() => {
            setScannerOpen(false)
            setError(messages.qrCameraUnsupported)
          }}
        />
      )}

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
            <span>{localizeQueueStatus(result.status, messages)}</span>
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
