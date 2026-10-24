import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react"
import { Link, useNavigate } from "react-router"
import { runAgentTurn } from "../domain/agent/runAgent.ts"
import type { RegistrationDraft } from "../domain/agent/types.ts"
import type { RouteMode } from "../domain/navigation/types.ts"
import type {
  DepartmentFact,
  TokenContext,
} from "../domain/voice/answers.ts"
import {
  transcriptSuggestsEmergency,
  type VoiceIntent,
} from "../domain/voice/intents.ts"
import type { UiLanguage } from "../i18n/index.ts"
import {
  getSupabaseClient,
  readSupabaseState,
} from "../lib/supabase/client.ts"
import { invokeVoiceText } from "../lib/supabase/voiceApi.ts"
import { useAssistantContext } from "../preferences/AssistantContext.tsx"
import { useMessages } from "../preferences/usePreferences.ts"
import { VoiceConversation } from "./VoiceConversation.tsx"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  openEmergency?: boolean
  needsMyTurn?: boolean
  openRegister?: boolean
  openSlip?: boolean
}

type Props = {
  language: UiLanguage
  token: TokenContext | null
  departments: DepartmentFact[]
  routeMode?: RouteMode
  startId?: string
  titleId: string
  onClose: () => void
  closeButtonRef: RefObject<HTMLButtonElement | null>
  fullPage?: boolean
}

export function AssistantChat({
  language,
  token,
  departments,
  routeMode = "assisted",
  startId = "entrance",
  titleId,
  onClose,
  closeButtonRef,
  fullPage = false,
}: Props) {
  const messages = useMessages()
  const navigate = useNavigate()
  const assistant = useAssistantContext()
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const inputId = useId()
  const client = getSupabaseClient()
  const supabaseState = readSupabaseState(import.meta.env)

  const [thread, setThread] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [awaitingField, setAwaitingField] = useState<
    "need_name" | "need_age" | "need_department" | null
  >(null)
  const [registrationDraft, setRegistrationDraft] =
    useState<RegistrationDraft | null>(null)
  const [showText, setShowText] = useState(false)

  useEffect(() => {
    const node = listRef.current
    if (!node) {
      return
    }
    node.scrollTop = node.scrollHeight
  }, [thread, busy])

  function appendTurn(input: {
    user: string
    assistant: string
    openEmergency?: boolean
    needsMyTurn?: boolean
    openRegister?: boolean
    openSlip?: boolean
  }) {
    setThread((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: input.user,
      },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        text: input.assistant,
        openEmergency: input.openEmergency,
        needsMyTurn: input.needsMyTurn,
        openRegister: input.openRegister,
        openSlip: input.openSlip,
      },
    ])
  }

  function applyAgentResult(
    user: string,
    result: Awaited<ReturnType<typeof runAgentTurn>>,
  ) {
    setAwaitingField(result.awaitingField)
    setRegistrationDraft(result.draft)
    if (result.tokenUpdate) {
      assistant.setTokenContext(result.tokenUpdate)
    }
    appendTurn({
      user,
      assistant: result.spoken,
      openEmergency: result.openEmergency,
      needsMyTurn: result.needsMyTurn,
      openRegister: result.openRegister,
      openSlip: result.openSlip,
    })
    // Keep the voice session alive — do not force-navigate away mid-conversation.
  }

  async function sendText(event: FormEvent) {
    event.preventDefault()
    const question = draft.trim()
    if (!question || busy) {
      return
    }

    setError(null)
    setDraft("")
    setBusy(true)

    const localIntent = transcriptSuggestsEmergency(question)
      ? ({
          intent: "emergency" as const,
          department_code: null,
          destination_code: null,
          start_landmark: null,
          confidence: 1,
        })
      : null

    // Prefer a live Sarvam intent when available; always fall back to the
    // deterministic planner so Ask AI keeps working if voice-assist is down.
    let intent: VoiceIntent =
      localIntent ??
      {
        intent: "unknown",
        department_code: null,
        destination_code: null,
        start_landmark: null,
        confidence: 0,
      }

    if (!localIntent && supabaseState.status === "ready" && client) {
      const voiceResult = await invokeVoiceText(client, {
        text: question,
        language,
      })
      if (voiceResult.ok) {
        intent = voiceResult.data.intent
      }
    }

    const result = await runAgentTurn({
      intent,
      utterance: question,
      client,
      messages,
      departments,
      routeMode,
      startId,
      awaitingField,
      draft: registrationDraft,
      liveQueue: assistant.liveQueue,
    })

    if (
      result.spoken === messages.agentUnsupportedAction &&
      supabaseState.status !== "ready"
    ) {
      setError(
        supabaseState.status === "refused"
          ? messages.backendRefusedKey
          : messages.backendUnconfigured,
      )
      setBusy(false)
      return
    }

    applyAgentResult(question, result)
    setBusy(false)
    inputRef.current?.focus()
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  const latest = [...thread].reverse().find((m) => m.role === "assistant")

  return (
    <div
      className={
        fullPage
          ? "assistant-chat assistant-chat-fullpage assistant-chat-voice"
          : "assistant-chat assistant-chat-voice"
      }
    >
      <header className="assistant-chat-header">
        <h2 id={titleId}>{messages.assistantDialogTitle}</h2>
        <button
          ref={closeButtonRef}
          type="button"
          className="assistant-chat-icon-btn"
          aria-label={messages.assistantClose}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="assistant-voice-stage">
        <VoiceConversation
          key={`voice-${language}`}
          language={language}
          token={token}
          departments={departments}
          routeMode={routeMode}
          startId={startId}
          orbMode
          awaitingField={awaitingField}
          registrationDraft={registrationDraft}
          liveQueue={assistant.liveQueue}
          onAgentState={(state) => {
            setAwaitingField(state.awaitingField)
            setRegistrationDraft(state.draft)
            if (state.tokenUpdate) {
              assistant.setTokenContext(state.tokenUpdate)
            }
          }}
          onTurn={(turn) => {
            appendTurn(turn)
          }}
        />

        {latest ? (
          <div className="assistant-voice-caption" aria-live="polite">
            <p className="assistant-voice-caption-text">{latest.text}</p>
            <div className="assistant-chat-actions">
              {latest.openEmergency ? (
                <Link
                  className="button button-emergency"
                  to="/emergency"
                  onClick={onClose}
                >
                  {messages.voiceGoEmergency}
                </Link>
              ) : null}
              {latest.needsMyTurn ? (
                <Link
                  className="button button-secondary"
                  to="/my-turn"
                  onClick={onClose}
                >
                  {messages.voiceOpenMyTurn}
                </Link>
              ) : null}
              {latest.openRegister ? (
                <Link
                  className="button button-secondary"
                  to="/register"
                  onClick={onClose}
                >
                  {messages.assistantOpenRegister}
                </Link>
              ) : null}
              {latest.openSlip ? (
                <Link
                  className="button button-secondary"
                  to="/slip"
                  onClick={() => {
                    onClose()
                    navigate("/slip")
                  }}
                >
                  {messages.assistantOpenSlip}
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="assistant-voice-hint">{messages.assistantDialogIntro}</p>
        )}
      </div>

      {error ? (
        <p className="form-error assistant-chat-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="assistant-chat-footer">
        <button
          type="button"
          className="assistant-text-toggle"
          aria-expanded={showText}
          onClick={() => setShowText((open) => !open)}
        >
          {showText ? messages.assistantClose : messages.assistantTextLabel}
        </button>

        {showText ? (
          <form
            className="assistant-chat-composer"
            onSubmit={(event) => void sendText(event)}
          >
            <label className="visually-hidden" htmlFor={inputId}>
              {messages.assistantTextLabel}
            </label>
            <textarea
              id={inputId}
              ref={inputRef}
              rows={1}
              value={draft}
              disabled={busy}
              placeholder={messages.assistantTextPlaceholder}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
            />
            <button
              type="submit"
              className="assistant-chat-send"
              disabled={busy || draft.trim().length === 0}
            >
              {messages.assistantSend}
            </button>
          </form>
        ) : null}

        {thread.length > 1 ? (
          <div
            className="assistant-chat-messages assistant-chat-messages-compact"
            ref={listRef}
            role="log"
            aria-live="polite"
          >
            {thread.map((message) => (
              <div
                key={message.id}
                className="assistant-chat-bubble"
                data-role={message.role}
              >
                <p>{message.text}</p>
              </div>
            ))}
            {busy ? (
              <div
                className="assistant-chat-bubble"
                data-role="assistant"
                data-pending="true"
              >
                <p>{messages.voiceProcessing}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
