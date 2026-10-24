import { useId, useState } from "react"
import {
  createHelpRequestKey,
  loadHelpRequest,
  saveHelpRequest,
  type StoredHelpRequest,
} from "../domain/helpRequest.ts"
import {
  getSupabaseClient,
  readSupabaseState,
} from "../lib/supabase/client.ts"
import { supabaseErrorMessage } from "../lib/supabase/errors.ts"
import { requestUrgentHelp } from "../lib/supabase/queueApi.ts"
import { useMessages } from "../preferences/usePreferences.ts"

type Phase = "idle" | "submitting" | "success" | "error"

export function HelpRequestPanel() {
  const messages = useMessages()
  const titleId = useId()
  const supabaseState = readSupabaseState(import.meta.env)
  const client = getSupabaseClient()
  const [stored, setStored] = useState<StoredHelpRequest | null>(() =>
    loadHelpRequest(),
  )
  const [phase, setPhase] = useState<Phase>(() =>
    loadHelpRequest() ? "success" : "idle",
  )
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (phase === "submitting") {
      return
    }
    if (supabaseState.status !== "ready" || !client) {
      setPhase("error")
      setError(messages.helpRequestUnavailable)
      return
    }

    const existing = loadHelpRequest()
    const requestKey = existing?.requestKey ?? createHelpRequestKey()
    setPhase("submitting")
    setError(null)

    const { data, error: rpcError } = await requestUrgentHelp(client, requestKey)

    if (rpcError || !data) {
      setPhase("error")
      setError(supabaseErrorMessage(rpcError, messages.helpRequestError))
      return
    }

    const next: StoredHelpRequest = {
      requestKey,
      flagId: data.id,
      status: data.status === "acknowledged" ? "acknowledged" : "open",
      createdAt: data.created_at,
      acknowledgedAt: data.acknowledged_at,
    }
    saveHelpRequest(next)
    setStored(next)
    setPhase("success")
  }

  const awaitingStaff = stored?.status === "open"
  const acknowledged = stored?.status === "acknowledged"

  return (
    <section className="panel help-request" aria-labelledby={titleId}>
      <h2 id={titleId}>{messages.helpRequestTitle}</h2>
      <p>{messages.helpRequestBody}</p>
      <p className="privacy-note">{messages.helpRequestDistinction}</p>
      <p className="emphasis">{messages.helpRequestNotEmergency}</p>

      {phase === "success" && awaitingStaff ? (
        <p className="form-success" role="status" aria-live="polite">
          {messages.helpRequestPending}
        </p>
      ) : null}
      {phase === "success" && acknowledged ? (
        <p className="form-success" role="status" aria-live="polite">
          {messages.helpRequestAcknowledged}
        </p>
      ) : null}
      {phase === "success" && stored && !acknowledged ? (
        <p className="button-hint">{messages.helpRequestReuseHint}</p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="button button-secondary"
        onClick={() => void submit()}
        disabled={phase === "submitting" || acknowledged}
        aria-busy={phase === "submitting"}
      >
        {phase === "submitting"
          ? messages.helpRequestSubmitting
          : awaitingStaff
            ? messages.helpRequestResendSafe
            : messages.helpRequestSubmit}
      </button>
    </section>
  )
}
