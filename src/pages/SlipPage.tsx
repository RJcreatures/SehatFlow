import { useMemo } from "react"
import { Link, useLocation } from "react-router"
import { PageHeading } from "../components/PageHeading.tsx"
import { SlipQrCard } from "../components/SlipQrCard.tsx"
import { formatAboutWaitMinutes } from "../domain/queue.ts"
import type { RegisterPatientResponse } from "../lib/supabase/patientApi.ts"
import { loadSlip, type SavedSlip } from "../lib/slipStorage.ts"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"

type LocationState = {
  slip?: RegisterPatientResponse
}

export function SlipPage() {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const location = useLocation()
  const state = (location.state as LocationState | null) ?? null

  const slip = useMemo<SavedSlip | RegisterPatientResponse | null>(() => {
    if (state?.slip) {
      return state.slip
    }
    return loadSlip()
  }, [state])

  if (!slip) {
    return (
      <>
        <PageHeading title={messages.slipTitle}>
          <p>{messages.slipMissing}</p>
        </PageHeading>
        <Link className="button" to="/register">
          {messages.register}
        </Link>
      </>
    )
  }

  const departmentName =
    preferences.language === "hi"
      ? slip.department_name_hi
      : slip.department_name_en
  const room = preferences.language === "hi" ? slip.room_hi : slip.room_en
  const floor = preferences.language === "hi" ? slip.floor_hi : slip.floor_en
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
          <SlipQrCard qrToken={qrToken} tokenCode={slip.token_code} />
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
        <p>{messages.slipAccessHint}</p>
        <div className="choice-row staff-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => window.print()}
          >
            {messages.printSlip}
          </button>
          <Link className="button" to="/my-turn">
            {messages.myTurn}
          </Link>
        </div>
      </section>
    </>
  )
}
