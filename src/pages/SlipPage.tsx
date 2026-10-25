import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Link, useLocation } from "react-router"
import { PageHeading } from "../components/PageHeading.tsx"
import { RenderErrorBoundary } from "../components/RenderErrorBoundary.tsx"
import { SlipQrCard } from "../components/SlipQrCard.tsx"
import { localizeQueueStatus } from "../domain/agent/spoken.ts"
import {
  localizedDepartmentName,
  localizedRoomFloor,
} from "../domain/departmentLabels.ts"
import { formatAboutWaitMinutes } from "../domain/queue.ts"
import { validateMyTurnInput } from "../domain/registration.ts"
import { WAIT_POLL_MS } from "../domain/waitIndicator.ts"
import {
  getSupabaseClient,
  readSupabaseState,
} from "../lib/supabase/client.ts"
import {
  getMyTurn,
  type MyTurnResponse,
  type RegisterPatientResponse,
} from "../lib/supabase/patientApi.ts"
import {
  isSavedSlip,
  loadSlipResult,
  saveSlip,
  type LoadSlipResult,
  type SavedSlip,
} from "../lib/slipStorage.ts"
import { useAssistantContext } from "../preferences/AssistantContext.tsx"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"

type LocationState = {
  slip?: RegisterPatientResponse
}

type DisplaySlip = SavedSlip | RegisterPatientResponse

function isDisplaySlip(value: unknown): value is DisplaySlip {
  if (!value || typeof value !== "object") {
    return false
  }
  if (isSavedSlip(value)) {
    return true
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.token_code === "string" &&
    typeof record.access_code === "string" &&
    typeof record.department_name_en === "string" &&
    typeof record.department_name_hi === "string" &&
    typeof record.room_en === "string" &&
    typeof record.room_hi === "string" &&
    typeof record.floor_en === "string" &&
    typeof record.floor_hi === "string" &&
    typeof record.estimated_wait_minutes === "number" &&
    typeof record.service_date === "string"
  )
}

function resolveSlip(
  state: LocationState | null,
  stored: LoadSlipResult,
): { slip: DisplaySlip | null; storageStatus: LoadSlipResult["status"] | "ok" } {
  if (state?.slip && isDisplaySlip(state.slip)) {
    return { slip: state.slip, storageStatus: "ok" }
  }
  if (stored.status === "ok") {
    return { slip: stored.slip, storageStatus: "ok" }
  }
  return { slip: null, storageStatus: stored.status }
}

export function SlipPage() {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const { setTokenContext } = useAssistantContext()
  const location = useLocation()
  const state = (location.state as LocationState | null) ?? null
  const client = getSupabaseClient()
  const supabaseState = readSupabaseState(import.meta.env)

  const [{ slip, storageStatus }, setResolved] = useState(() =>
    resolveSlip(state, loadSlipResult()),
  )

  useEffect(() => {
    setResolved(resolveSlip(state, loadSlipResult()))
  }, [state])

  const [live, setLive] = useState<MyTurnResponse | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [recoverToken, setRecoverToken] = useState("")
  const [recoverAccess, setRecoverAccess] = useState("")
  const [recoverBusy, setRecoverBusy] = useState(false)
  const [recoverError, setRecoverError] = useState<string | null>(null)

  const tokenCode = slip?.token_code
  const accessCode = slip?.access_code
  const qrToken = slip && "qr_token" in slip ? slip.qr_token : undefined

  const refreshLive = useCallback(async () => {
    if (!tokenCode || !accessCode || !client || supabaseState.status !== "ready") {
      return
    }
    const body = qrToken
      ? { qr_token: qrToken }
      : { token_code: tokenCode, access_code: accessCode }
    const { data, error } = await getMyTurn(client, body)
    if (error || !data || (typeof data === "object" && "error" in data)) {
      setStale(true)
      setLiveError(messages.myTurnInvalidCredentials)
      return
    }
    setLive(data)
    setStale(false)
    setLiveError(null)
    const places = localizedRoomFloor(
      preferences.language,
      data,
      messages.notAvailable,
    )
    setTokenContext({
      token_code: data.token_code,
      department_name: localizedDepartmentName(
        messages,
        preferences.language,
        {
          code: data.department_code,
          name_en: data.department_name_en,
          name_hi: data.department_name_hi,
        },
      ),
      room: places.room,
      floor: places.floor,
      status: data.status,
      estimated_wait_minutes: data.estimated_wait_minutes,
      patients_ahead: data.patients_ahead,
    })
  }, [
    accessCode,
    client,
    messages,
    preferences.language,
    qrToken,
    setTokenContext,
    supabaseState.status,
    tokenCode,
  ])

  useEffect(() => {
    if (!tokenCode) {
      return
    }
    void refreshLive()
    const timer = window.setInterval(() => {
      void refreshLive()
    }, WAIT_POLL_MS)
    return () => window.clearInterval(timer)
  }, [refreshLive, tokenCode])

  async function onRecover(event: FormEvent) {
    event.preventDefault()
    setRecoverError(null)
    const validated = validateMyTurnInput({
      tokenCode: recoverToken,
      accessCode: recoverAccess,
    })
    if (!validated.ok) {
      setRecoverError(
        validated.field === "token"
          ? messages.myTurnInvalidToken
          : messages.myTurnInvalidAccess,
      )
      return
    }
    if (!client || supabaseState.status !== "ready") {
      setRecoverError(messages.backendUnconfigured)
      return
    }
    setRecoverBusy(true)
    const { data, error } = await getMyTurn(client, {
      token_code: validated.tokenCode,
      access_code: validated.accessCode,
    })
    setRecoverBusy(false)
    if (error || !data || (typeof data === "object" && "error" in data)) {
      setRecoverError(messages.myTurnInvalidCredentials)
      return
    }
    saveSlip({
      token_code: data.token_code,
      access_code: validated.accessCode,
      department_code: data.department_code,
      department_name_en: data.department_name_en,
      department_name_hi: data.department_name_hi,
      room_en: data.room_en,
      room_hi: data.room_hi,
      floor_en: data.floor_en,
      floor_hi: data.floor_hi,
      estimated_wait_minutes: data.estimated_wait_minutes ?? 0,
      service_date: data.service_date,
    })
    window.location.assign("/slip")
  }

  if (!slip) {
    return (
      <>
        <PageHeading title={messages.slipTitle}>
          <p>
            {storageStatus === "invalid"
              ? messages.slipInvalid
              : messages.slipMissing}
          </p>
          <p>{messages.slipEmptyHint}</p>
        </PageHeading>
        <section className="panel slip-empty" aria-label={messages.slipTitle}>
          <form className="stack-gap" onSubmit={(event) => void onRecover(event)}>
            <label className="field">
              <span>{messages.tokenLabel}</span>
              <input
                value={recoverToken}
                onChange={(event) => setRecoverToken(event.target.value)}
                autoComplete="off"
                required
              />
            </label>
            <label className="field">
              <span>{messages.accessCodeLabel}</span>
              <input
                value={recoverAccess}
                onChange={(event) => setRecoverAccess(event.target.value)}
                autoComplete="off"
                required
              />
            </label>
            {recoverError ? (
              <p className="form-error" role="alert">
                {recoverError}
              </p>
            ) : null}
            <button type="submit" className="button" disabled={recoverBusy}>
              {recoverBusy ? messages.myTurnChecking : messages.slipRecoverSubmit}
            </button>
          </form>
          <p>
            <Link className="button button-secondary" to="/register">
              {messages.slipGoRegister}
            </Link>
          </p>
        </section>
      </>
    )
  }

  const departmentName = localizedDepartmentName(
    messages,
    preferences.language,
    {
      code: live?.department_code ?? slip.department_code,
      name_en: live?.department_name_en ?? slip.department_name_en,
      name_hi: live?.department_name_hi ?? slip.department_name_hi,
    },
  )
  const places = localizedRoomFloor(
    preferences.language,
    live ?? slip,
    messages.notAvailable,
  )
  const waitMinutes =
    live?.estimated_wait_minutes ?? slip.estimated_wait_minutes
  const status = live?.status ?? null

  return (
    <>
      <PageHeading title={messages.slipTitle}>
        <p>{messages.slipKeepSafe}</p>
      </PageHeading>
      <section className="panel slip-panel" aria-label={messages.slipTitle}>
        <p className="slip-hero-label">{messages.tokenLabel}</p>
        <p className="slip-hero-token" dir="ltr">
          {slip.token_code}
        </p>

        {status ? (
          <p
            className={`slip-status-banner status-${status}`}
            role="status"
          >
            {localizeQueueStatus(status, messages)}
            {typeof live?.patients_ahead === "number"
              ? ` · ${messages.aheadLabel}: ${live.patients_ahead}`
              : null}
          </p>
        ) : null}
        {stale ? (
          <p className="form-error" role="status">
            {messages.waitStaleBanner}
          </p>
        ) : null}
        {liveError && !live ? (
          <p className="form-error" role="alert">
            {liveError}
          </p>
        ) : null}

        {qrToken ? (
          <RenderErrorBoundary
            fallback={(_error, retry) => (
              <div className="slip-qr-fallback" role="alert">
                <p>{messages.slipRenderError}</p>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={retry}
                >
                  {messages.qrRetry}
                </button>
              </div>
            )}
          >
            <SlipQrCard qrToken={qrToken} tokenCode={slip.token_code} />
          </RenderErrorBoundary>
        ) : (
          <p className="privacy-note">{messages.qrMissingOnOldSlip}</p>
        )}
        <dl className="facts">
          <div>
            <dt>{messages.accessCodeLabel}</dt>
            <dd className="slip-token" dir="ltr">
              {slip.access_code}
            </dd>
          </div>
          <div>
            <dt>{messages.departmentLabel}</dt>
            <dd>{departmentName}</dd>
          </div>
          <div>
            <dt>{messages.roomLabel}</dt>
            <dd>
              {places.room} · {places.floor}
            </dd>
          </div>
          <div>
            <dt>{messages.serviceDateLabel}</dt>
            <dd>{live?.service_date ?? slip.service_date}</dd>
          </div>
          <div>
            <dt>{messages.waitLabel}</dt>
            <dd>
              {formatAboutWaitMinutes(waitMinutes, messages.waitAboutTemplate)}
            </dd>
          </div>
        </dl>
        <div className="choice-row staff-actions">
          <Link className="button button-secondary" to="/find">
            {messages.findPlace}
          </Link>
          <button
            type="button"
            className="button"
            onClick={() => window.print()}
          >
            {messages.printSlip}
          </button>
        </div>
      </section>
    </>
  )
}
