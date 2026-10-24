import { useMemo } from "react"
import { Link, useLocation } from "react-router"
import { PageHeading } from "../components/PageHeading.tsx"
import { RenderErrorBoundary } from "../components/RenderErrorBoundary.tsx"
import { SlipQrCard } from "../components/SlipQrCard.tsx"
import {
  localizedDepartmentName,
  localizedRoomFloor,
} from "../domain/departmentLabels.ts"
import { formatAboutWaitMinutes } from "../domain/queue.ts"
import type { RegisterPatientResponse } from "../lib/supabase/patientApi.ts"
import {
  isSavedSlip,
  loadSlipResult,
  type SavedSlip,
} from "../lib/slipStorage.ts"
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

export function SlipPage() {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const location = useLocation()
  const state = (location.state as LocationState | null) ?? null

  const stored = loadSlipResult()

  const slip = useMemo<DisplaySlip | null>(() => {
    if (state?.slip && isDisplaySlip(state.slip)) {
      return state.slip
    }
    if (stored.status === "ok") {
      return stored.slip
    }
    return null
  }, [state, stored])

  const storageStatus = state?.slip && isDisplaySlip(state.slip) ? "ok" : stored.status

  if (!slip) {
    return (
      <>
        <PageHeading title={messages.slipTitle}>
          <p>
            {storageStatus === "invalid"
              ? messages.slipInvalid
              : messages.slipMissing}
          </p>
        </PageHeading>
        <section className="panel slip-empty" aria-label={messages.slipTitle}>
          <div className="choice-row staff-actions">
            <Link className="button" to="/register">
              {messages.slipGoRegister}
            </Link>
            <Link className="button button-secondary" to="/my-turn">
              {messages.slipGoMyTurn}
            </Link>
          </div>
        </section>
      </>
    )
  }

  const departmentName = localizedDepartmentName(
    messages,
    preferences.language,
    {
      code: slip.department_code,
      name_en: slip.department_name_en,
      name_hi: slip.department_name_hi,
    },
  )
  const places = localizedRoomFloor(
    preferences.language,
    slip,
    messages.notAvailable,
  )
  const room = places.room
  const floor = places.floor
  const qrToken = "qr_token" in slip ? slip.qr_token : undefined

  return (
    <>
      <PageHeading title={messages.slipTitle}>
        <p>{messages.slipKeepSafe}</p>
      </PageHeading>
      <section className="panel slip-panel" aria-label={messages.slipTitle}>
        <p className="slip-hero-label">{messages.tokenLabel}</p>
        <p className="slip-hero-token">{slip.token_code}</p>
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
            <dd className="slip-token">{slip.access_code}</dd>
          </div>
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
            <dt>{messages.serviceDateLabel}</dt>
            <dd>{slip.service_date}</dd>
          </div>
          <div>
            <dt>{messages.waitLabel}</dt>
            <dd>
              {formatAboutWaitMinutes(
                slip.estimated_wait_minutes,
                messages.waitAboutTemplate,
              )}
            </dd>
          </div>
        </dl>
        <div className="choice-row staff-actions">
          <Link className="button" to="/my-turn">
            {messages.myTurn}
          </Link>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => window.print()}
          >
            {messages.printSlip}
          </button>
        </div>
      </section>
    </>
  )
}
