import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useLocation } from "react-router"
import { formatAboutWaitMinutes } from "../domain/queue.ts"
import {
  reconcileWaitDisplay,
  WAIT_POLL_MS,
  type WaitDisplayModel,
  type WaitServerSnapshot,
} from "../domain/waitIndicator.ts"
import {
  getSupabaseClient,
  readSupabaseState,
} from "../lib/supabase/client.ts"
import { getMyTurn, type MyTurnResponse } from "../lib/supabase/patientApi.ts"
import { loadSlip } from "../lib/slipStorage.ts"
import { useMessages } from "../preferences/usePreferences.ts"

function shouldShowOnPath(pathname: string): boolean {
  if (pathname.startsWith("/staff") || pathname === "/board") {
    return false
  }
  if (pathname === "/emergency") {
    return false
  }
  return true
}

export function WaitIndicator() {
  const messages = useMessages()
  const { pathname } = useLocation()
  const supabaseState = readSupabaseState(import.meta.env)
  const client = getSupabaseClient()
  const snapshotRef = useRef<WaitServerSnapshot | null>(null)
  const baselineRef = useRef<number | null>(null)
  const overdueRefreshRef = useRef(false)
  const [model, setModel] = useState<WaitDisplayModel | null>(null)
  const [updatedLabel, setUpdatedLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const applyLocalCountdown = useCallback(() => {
    const current = snapshotRef.current
    if (!current) {
      return
    }
    const result = reconcileWaitDisplay({
      previous: current,
      next: current,
      baselineMinutes: baselineRef.current,
      nowMs: Date.now(),
    })
    baselineRef.current = result.baselineMinutes
    snapshotRef.current = result.snapshot
    setModel(result.model)
    if (result.model.phase === "estimate_overdue" && !overdueRefreshRef.current) {
      overdueRefreshRef.current = true
    }
  }, [])

  const refresh = useCallback(async () => {
    const slip = loadSlip()
    if (!slip || supabaseState.status !== "ready" || !client) {
      snapshotRef.current = null
      setModel(null)
      return
    }

    const { data, error: lookupError } = await getMyTurn(client, {
      token_code: slip.token_code,
      access_code: slip.access_code,
    })

    if (lookupError || !data || (typeof data === "object" && "error" in data)) {
      setError(messages.waitRefreshError)
      return
    }

    const payload = data as MyTurnResponse
    const next: WaitServerSnapshot = {
      tokenCode: payload.token_code,
      status: payload.status,
      estimatedWaitMinutes: payload.estimated_wait_minutes,
      patientsAhead: payload.patients_ahead,
      receivedAtMs: Date.now(),
    }

    const result = reconcileWaitDisplay({
      previous: snapshotRef.current,
      next,
      baselineMinutes:
        baselineRef.current ??
        (typeof slip.estimated_wait_minutes === "number"
          ? slip.estimated_wait_minutes
          : null),
      nowMs: Date.now(),
    })
    snapshotRef.current = result.snapshot
    baselineRef.current = result.baselineMinutes
    overdueRefreshRef.current = result.model.phase === "estimate_overdue"
    setModel(result.model)
    setError(null)
    setUpdatedLabel(new Date().toLocaleTimeString())
  }, [client, messages.waitRefreshError, supabaseState.status])

  const showChrome = shouldShowOnPath(pathname) && loadSlip() !== null

  useEffect(() => {
    if (!showChrome) {
      return
    }
    void refresh()
    const poll = window.setInterval(() => {
      void refresh()
    }, WAIT_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh()
      }
    }
    window.addEventListener("focus", onVisible)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(poll)
      window.removeEventListener("focus", onVisible)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh, showChrome])

  useEffect(() => {
    if (!model || (model.phase !== "waiting" && model.phase !== "estimate_overdue")) {
      return
    }
    const timer = window.setInterval(() => {
      applyLocalCountdown()
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [applyLocalCountdown, model])

  useEffect(() => {
    if (model?.phase === "estimate_overdue" && overdueRefreshRef.current) {
      overdueRefreshRef.current = false
      void refresh()
    }
  }, [model, refresh])

  if (!showChrome || !model) {
    return null
  }

  const waitText =
    model.displayMinutes == null
      ? messages.notAvailable
      : formatAboutWaitMinutes(model.displayMinutes, messages.waitAboutTemplate)

  return (
    <aside
      className="wait-indicator"
      aria-live="polite"
      aria-label={messages.waitIndicatorLabel}
    >
      <div className="wait-indicator-inner">
        <div className="wait-indicator-top">
          <p className="wait-indicator-token">
            <span className="wait-indicator-kicker">{messages.tokenLabel}</span>
            <span className="wait-indicator-code">{model.tokenCode}</span>
          </p>
          <Link className="wait-indicator-link" to="/my-turn">
            {messages.waitOpenStatus}
          </Link>
        </div>

        {model.phase === "waiting" ? (
          <>
            <p className="wait-indicator-estimate">
              <span className="wait-indicator-kicker">{messages.waitLabel}</span>
              <strong>{waitText}</strong>
              <span className="wait-indicator-approx">
                {" "}
                ({messages.waitEstimateNote})
              </span>
            </p>
            <div
              className="wait-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={
                model.progressRatio == null
                  ? undefined
                  : Math.round(model.progressRatio * 100)
              }
              aria-label={messages.waitProgressLabel}
            >
              <div
                className="wait-progress-fill"
                style={{
                  width: `${Math.round((model.progressRatio ?? 0) * 100)}%`,
                }}
              />
              <span className="wait-progress-pattern" aria-hidden="true" />
            </div>
          </>
        ) : null}

        {model.phase === "called" ? (
          <p className="wait-indicator-alert status-called">
            ! {messages.waitCalledBanner}
          </p>
        ) : null}
        {model.phase === "completed" ? (
          <p className="wait-indicator-alert status-completed">
            ✓ {messages.waitCompletedBanner}
          </p>
        ) : null}
        {model.phase === "inactive" ? (
          <p className="wait-indicator-alert">{messages.waitInactiveBanner}</p>
        ) : null}
        {model.phase === "estimate_overdue" ? (
          <p className="wait-indicator-alert" role="status">
            {messages.waitOverdueBanner}
          </p>
        ) : null}
        {model.phase === "unavailable" ? (
          <p className="wait-indicator-alert">{messages.waitUnavailableBanner}</p>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}
        {updatedLabel ? (
          <p className="wait-indicator-updated">
            {messages.waitUpdated.replace("{time}", updatedLabel)}
          </p>
        ) : null}
      </div>
    </aside>
  )
}
