import { useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import type { LiveQueueHint } from "../domain/agent/execute.ts"
import { runAgentTurn } from "../domain/agent/runAgent.ts"
import type { RegistrationDraft } from "../domain/agent/types.ts"
import {
  type DepartmentFact,
  type TokenContext,
} from "../domain/voice/answers.ts"
import { getVoiceCapability } from "../domain/voice/capabilities.ts"
import {
  parseVoiceIntent,
  transcriptSuggestsEmergency,
} from "../domain/voice/intents.ts"
import { createPlaybackQueue } from "../domain/voice/playbackQueue.ts"
import type { RouteMode } from "../domain/navigation/types.ts"
import type { UiLanguage } from "../i18n/index.ts"
import {
  getSupabaseClient,
  readSupabaseState,
} from "../lib/supabase/client.ts"
import { mintVoiceSessionTicket } from "../lib/supabase/voiceApi.ts"
import { createMicCapture } from "../lib/voice/micCapture.ts"
import {
  buildRealtimeWsUrl,
  decodeBase64Audio,
  openRealtimeSocket,
  type RealtimeSocket,
  type VoiceSessionState,
} from "../lib/voice/realtimeClient.ts"
import {
  voiceDebugLog,
  type VoiceDebugEntry,
} from "../lib/voice/voiceDebug.ts"
import { useMessages } from "../preferences/usePreferences.ts"

const ECHO_TAIL_MS = 900
const SHOW_VOICE_DEBUG = false

type Props = {
  language: UiLanguage
  token: TokenContext | null
  departments: DepartmentFact[]
  routeMode?: RouteMode
  startId?: string
  /**
   * ChatGPT-style speaking orb: tap to start, tap while speaking to interrupt,
   * tap while listening to end.
   */
  orbMode?: boolean
  /** @deprecated Prefer orbMode — kept for any leftover compact embeds. */
  chatMode?: boolean
  awaitingField?: "need_name" | "need_age" | "need_department" | null
  registrationDraft?: RegistrationDraft | null
  liveQueue?: LiveQueueHint | null
  onAgentState?: (state: {
    awaitingField: "need_name" | "need_age" | "need_department" | null
    draft: RegistrationDraft | null
    tokenUpdate?: TokenContext | null
  }) => void
  onTurn?: (turn: {
    user: string
    assistant: string
    openEmergency?: boolean
    needsMyTurn?: boolean
    openRegister?: boolean
    openSlip?: boolean
    navigateTo?: string | null
  }) => void
}

function stateLabel(
  state: VoiceSessionState,
  messages: ReturnType<typeof useMessages>,
): string {
  switch (state) {
    case "connecting":
      return messages.voiceStateConnecting
    case "reconnecting":
      return messages.voiceStateReconnecting
    case "listening":
      return messages.voiceStateListening
    case "recognizing":
      return messages.voiceStateRecognizing
    case "thinking":
      return messages.voiceStateThinking
    case "speaking":
      return messages.voiceStateSpeaking
    case "interrupted":
      return messages.voiceStateInterrupted
    case "muted":
      return messages.voiceStateMuted
    case "error":
      return messages.voiceStateError
    default:
      return messages.voiceStateIdle
  }
}

export function VoiceConversation({
  language,
  token: _token,
  departments,
  routeMode = "assisted",
  startId = "entrance",
  orbMode = false,
  chatMode = false,
  awaitingField = null,
  registrationDraft = null,
  liveQueue = null,
  onAgentState,
  onTurn,
}: Props) {
  const messages = useMessages()
  const capability = getVoiceCapability(language)
  const voiceFirst = orbMode || chatMode
  const supabaseState = readSupabaseState(import.meta.env)
  const client = getSupabaseClient()
  const awaitingFieldRef = useRef(awaitingField)
  const registrationDraftRef = useRef(registrationDraft)
  const liveQueueRef = useRef(liveQueue)
  awaitingFieldRef.current = awaitingField
  registrationDraftRef.current = registrationDraft
  liveQueueRef.current = liveQueue

  const [sessionActive, setSessionActive] = useState(false)
  const [micLive, setMicLive] = useState(false)
  const [muted, setMuted] = useState(false)
  const [state, setState] = useState<VoiceSessionState>("idle")
  const [heard, setHeard] = useState<string | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openEmergency, setOpenEmergency] = useState(false)
  const [needsMyTurn, setNeedsMyTurn] = useState(false)
  const [textOnlyNote, setTextOnlyNote] = useState<string | null>(null)
  const [debugLog, setDebugLog] = useState<VoiceDebugEntry[]>([])

  const socketRef = useRef<RealtimeSocket | null>(null)
  const micRef = useRef<ReturnType<typeof createMicCapture> | null>(null)
  const playbackRef = useRef<ReturnType<typeof createPlaybackQueue> | null>(null)
  const activeTurnRef = useRef<string | null>(null)
  const mutedRef = useRef(false)
  const holdUplinkRef = useRef(false)
  const speakDoneRef = useRef(false)
  const echoTailTimerRef = useRef<number | null>(null)
  const errorStateRef = useRef(false)
  const intentionalCloseRef = useRef(false)
  const audioChunkCountRef = useRef(0)

  function pushDebug(
    step: string,
    detail?: Record<string, unknown> | string,
  ) {
    const entry = voiceDebugLog(step, detail)
    setDebugLog((prev) => [...prev.slice(-60), entry])
  }

  useEffect(() => {
    return () => {
      endSessionInternal()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (sessionActive) {
      endSessionInternal()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  function clearEchoTailTimer() {
    if (echoTailTimerRef.current != null) {
      window.clearTimeout(echoTailTimerRef.current)
      echoTailTimerRef.current = null
    }
  }

  function applyMicGate(hold: boolean) {
    holdUplinkRef.current = hold
    if (!mutedRef.current) {
      micRef.current?.setEnabled(!hold)
    }
    pushDebug(hold ? "mic_hold" : "mic_release")
  }

  function holdUplink(reason: string) {
    clearEchoTailTimer()
    speakDoneRef.current = false
    applyMicGate(true)
    pushDebug("hold_uplink", reason)
  }

  function finishSpeakingTurn(turnId: string | null) {
    clearEchoTailTimer()
    pushDebug("echo_tail_start", `ms=${ECHO_TAIL_MS}`)
    echoTailTimerRef.current = window.setTimeout(() => {
      applyMicGate(false)
      socketRef.current?.send({
        type: "playback_done",
        turnId: turnId ?? undefined,
      })
      pushDebug("playback_done_sent", turnId ?? "")
      setState("listening")
      echoTailTimerRef.current = null
    }, ECHO_TAIL_MS)
  }

  function tryReleaseAfterPlayback() {
    const turnId = activeTurnRef.current
    const playback = playbackRef.current
    pushDebug("try_release", {
      speakDone: speakDoneRef.current,
      playing: playback?.playing ?? false,
      pending: playback?.pending ?? 0,
      chunks: audioChunkCountRef.current,
    })
    if (!speakDoneRef.current) {
      return
    }
    if (playback?.playing || (playback?.pending ?? 0) > 0) {
      return
    }
    finishSpeakingTurn(turnId)
  }

  function endSessionInternal() {
    intentionalCloseRef.current = true
    clearEchoTailTimer()
    holdUplinkRef.current = false
    speakDoneRef.current = false
    micRef.current?.stop()
    micRef.current = null
    playbackRef.current?.dispose()
    playbackRef.current = null
    socketRef.current?.close()
    socketRef.current = null
    activeTurnRef.current = null
    mutedRef.current = false
    setSessionActive(false)
    setMicLive(false)
    setMuted(false)
    setState("idle")
    setHeard(null)
  }

  function failSession(message: string, reason?: string) {
    pushDebug("fail_session", reason ?? message)
    errorStateRef.current = true
    intentionalCloseRef.current = true
    clearEchoTailTimer()
    holdUplinkRef.current = false
    speakDoneRef.current = false
    micRef.current?.stop()
    micRef.current = null
    playbackRef.current?.dispose()
    playbackRef.current = null
    socketRef.current?.close()
    socketRef.current = null
    activeTurnRef.current = null
    mutedRef.current = false
    setSessionActive(false)
    setMicLive(false)
    setMuted(false)
    setHeard(null)
    setError(message)
    setState("error")
  }

  async function startSession() {
    setError(null)
    setDebugLog([])
    errorStateRef.current = false
    setAnswer(null)
    setHeard(null)
    setOpenEmergency(false)
    setNeedsMyTurn(false)
    setTextOnlyNote(null)
    audioChunkCountRef.current = 0

    pushDebug("start", { language, supabase: supabaseState.status })

    if (!capability.speechInput) {
      failSession(messages.voiceUnavailable, "no_speech_input")
      return
    }
    if (supabaseState.status !== "ready" || !client) {
      failSession(messages.voiceServiceError, "supabase_not_ready")
      return
    }

    intentionalCloseRef.current = false
    holdUplinkRef.current = false
    speakDoneRef.current = false
    setState("connecting")
    setSessionActive(true)

    const ticket = await mintVoiceSessionTicket(client, language)
    if (!ticket.ok) {
      failSession(messages.voiceServiceError, ticket.detail ?? ticket.code)
      return
    }
    pushDebug("ticket_ok")

    // Unlock audio on the same user gesture that started the session.
    try {
      const unlock = new AudioContext()
      await unlock.resume()
      await unlock.close()
    } catch {
      /* ignore — playback queue will resume later */
    }

    const url = buildRealtimeWsUrl({
      supabaseUrl: String(import.meta.env.VITE_SUPABASE_URL ?? ""),
      publishableKey: String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ""),
      ticket: ticket.data.ticket,
    })
    pushDebug("ws_url", url.replace(/ticket=[^&]+/, "ticket=…").replace(/apikey=[^&]+/, "apikey=…"))

    playbackRef.current = createPlaybackQueue(
      () => {
        pushDebug("playback_idle")
        tryReleaseAfterPlayback()
      },
      (event) => {
        pushDebug(`play:${event.type}`, event)
      },
    )

    const socket = openRealtimeSocket(url, {
      onOpen: () => {
        pushDebug("ws_open")
        setSessionActive(true)
        setState("connecting")
      },
      onError: () => {
        pushDebug("ws_error")
        if (!intentionalCloseRef.current && !errorStateRef.current) {
          failSession(messages.voiceServiceError, "ws_error")
        }
      },
      onClose: (info) => {
        pushDebug("ws_close", info)
        micRef.current?.stop()
        micRef.current = null
        setMicLive(false)
        setSessionActive(false)
        if (intentionalCloseRef.current || errorStateRef.current) {
          return
        }
        failSession(messages.voiceServiceError, `ws_close ${info.code}`)
      },
      onMessage: (message) => {
        if (message.type === "debug") {
          pushDebug(`server:${message.step}`, message.detail || undefined)
          return
        }
        if (message.type === "ready") {
          pushDebug("ready")
          setState("listening")
          return
        }
        if (message.type === "state") {
          pushDebug("state", message.state)
          if (message.state === "speaking") {
            holdUplink("server_speaking")
          }
          if (message.state === "listening" && holdUplinkRef.current) {
            pushDebug("ignore_listening_while_hold")
            return
          }
          setState(message.state)
          return
        }
        if (message.type === "partial") {
          if (!holdUplinkRef.current) {
            setHeard(message.text)
          } else {
            pushDebug("ignore_partial_while_hold")
          }
          return
        }
        if (message.type === "final") {
          if (!holdUplinkRef.current) {
            setHeard(message.text)
            pushDebug("final", `chars=${message.text.length}`)
          } else {
            pushDebug("ignore_final_while_hold", `chars=${message.text.length}`)
          }
          return
        }
        if (message.type === "barge_in") {
          pushDebug("ignore_barge_in")
          return
        }
        if (message.type === "intent") {
          if (holdUplinkRef.current) {
            pushDebug("ignore_intent_while_hold", {
              turnId: message.turnId,
            })
            return
          }
          holdUplink("intent")
          setState("thinking")
          pushDebug("intent", {
            turnId: message.turnId,
            intent:
              message.intent && typeof message.intent === "object"
                ? (message.intent as { intent?: string }).intent
                : "?",
          })
          void respondToIntent(message.turnId, message.transcript, message.intent)
          return
        }
        if (message.type === "audio") {
          if (activeTurnRef.current !== message.turnId) {
            pushDebug("audio_stale_turn")
            return
          }
          holdUplink("audio_chunk")
          audioChunkCountRef.current += 1
          const buffer = decodeBase64Audio(message.chunk)
          pushDebug("audio_chunk", {
            n: audioChunkCountRef.current,
            bytes: buffer.byteLength,
            mime: message.mime,
            codec: message.codec ?? "",
            sampleRate: message.sampleRate ?? 0,
          })
          void playbackRef.current?.enqueue(buffer, message.mime, {
            codec: message.codec,
            sampleRate: message.sampleRate,
          })
          return
        }
        if (message.type === "text_only") {
          pushDebug("text_only", message.reason)
          setTextOnlyNote(messages.voiceTextOnlyFallback)
          speakDoneRef.current = true
          playbackRef.current?.markComplete()
          tryReleaseAfterPlayback()
          return
        }
        if (message.type === "speak_done") {
          pushDebug("speak_done", {
            turnId: message.turnId,
            chunks: audioChunkCountRef.current,
          })
          if (activeTurnRef.current !== message.turnId) {
            return
          }
          speakDoneRef.current = true
          playbackRef.current?.markComplete()
          tryReleaseAfterPlayback()
          return
        }
        if (message.type === "error") {
          failSession(
            messages.voiceServiceError,
            `${message.code} ${message.message ?? ""}`,
          )
        }
      },
    })
    socketRef.current = socket

    try {
      const mic = createMicCapture((pcm) => {
        if (mutedRef.current || holdUplinkRef.current) {
          return
        }
        socketRef.current?.send({ type: "audio", pcm })
      })
      await mic.start()
      micRef.current = mic
      setMicLive(true)
      mutedRef.current = false
      setMuted(false)
      pushDebug("mic_ok")
    } catch (err) {
      failSession(
        messages.voiceMicDenied,
        err instanceof Error ? err.message : "mic_denied",
      )
    }
  }

  async function respondToIntent(
    turnId: string,
    heardText: string,
    rawIntent: unknown,
  ) {
    let intent =
      parseVoiceIntent(rawIntent) ?? {
        intent: "unknown" as const,
        department_code: null,
        destination_code: null,
        start_landmark: null,
        confidence: 0,
      }
    if (transcriptSuggestsEmergency(heardText)) {
      intent = {
        intent: "emergency",
        department_code: null,
        destination_code: null,
        start_landmark: null,
        confidence: 1,
      }
    }

    const agentResult = await runAgentTurn({
      intent,
      utterance: heardText,
      client,
      messages,
      departments,
      routeMode,
      startId,
      awaitingField: awaitingFieldRef.current,
      draft: registrationDraftRef.current,
      liveQueue: liveQueueRef.current,
    })
    onAgentState?.({
      awaitingField: agentResult.awaitingField,
      draft: agentResult.draft,
      tokenUpdate: agentResult.tokenUpdate,
    })
    awaitingFieldRef.current = agentResult.awaitingField
    registrationDraftRef.current = agentResult.draft

    setAnswer(agentResult.spoken)
    setOpenEmergency(Boolean(agentResult.openEmergency))
    setNeedsMyTurn(Boolean(agentResult.needsMyTurn))
    activeTurnRef.current = turnId
    audioChunkCountRef.current = 0
    pushDebug("answer", {
      chars: agentResult.spoken.length,
      intent: intent.intent,
    })
    onTurn?.({
      user: heardText,
      assistant: agentResult.spoken,
      openEmergency: agentResult.openEmergency,
      needsMyTurn: agentResult.needsMyTurn,
      openRegister: agentResult.openRegister,
      openSlip: agentResult.openSlip,
      navigateTo: agentResult.navigateTo,
    })
    // Stay in the voice session — action links in the parent handle navigation.

    if (agentResult.openEmergency) {
      setTextOnlyNote(null)
      speakDoneRef.current = true
      tryReleaseAfterPlayback()
      return
    }

    if (!capability.speechOutput) {
      setTextOnlyNote(messages.voiceTextOnlyFallback)
      speakDoneRef.current = true
      tryReleaseAfterPlayback()
      return
    }

    holdUplink("speak_request")
    setState("speaking")
    speakDoneRef.current = false
    socketRef.current?.send({
      type: "speak",
      turnId,
      text: agentResult.spoken,
    })
  }

  function toggleMute() {
    if (!sessionActive || !socketRef.current) {
      return
    }
    if (muted) {
      socketRef.current.send({ type: "unmute" })
      mutedRef.current = false
      setMuted(false)
      micRef.current?.setEnabled(!holdUplinkRef.current)
      if (!holdUplinkRef.current) {
        setState("listening")
      }
    } else {
      socketRef.current.send({ type: "mute" })
      mutedRef.current = true
      setMuted(true)
      micRef.current?.setEnabled(false)
      setState("muted")
    }
  }

  function interruptSpeaking() {
    clearEchoTailTimer()
    speakDoneRef.current = true
    activeTurnRef.current = null
    audioChunkCountRef.current = 0
    playbackRef.current?.stop()
    socketRef.current?.send({ type: "interrupt" })
    applyMicGate(false)
    setState("listening")
    pushDebug("client_interrupt")
  }

  function onOrbPress() {
    if (!sessionActive) {
      void startSession()
      return
    }
    if (
      state === "speaking" ||
      state === "thinking" ||
      holdUplinkRef.current
    ) {
      interruptSpeaking()
      return
    }
    endSessionInternal()
  }

  const showMicLive =
    sessionActive &&
    micLive &&
    !muted &&
    !holdUplinkRef.current &&
    state === "listening"

  const orbPhase =
    !sessionActive && !error
      ? "idle"
      : error
        ? "error"
        : state === "connecting" || state === "reconnecting"
          ? "connecting"
          : state === "speaking" || holdUplinkRef.current
            ? "speaking"
            : state === "thinking" || state === "recognizing"
              ? "thinking"
              : showMicLive
                ? "listening"
                : "active"

  const orbLabel =
    orbPhase === "idle"
      ? messages.voiceStartConversation
      : orbPhase === "speaking" || orbPhase === "thinking"
        ? messages.voiceInterrupt
        : orbPhase === "error"
          ? messages.voiceRetry
          : messages.voiceEndConversation

  if (voiceFirst) {
    return (
      <div
        className="voice-orb-shell"
        aria-label={messages.voiceConversationTitle}
      >
        <button
          type="button"
          className="voice-orb"
          data-phase={orbPhase}
          disabled={!capability.speechInput && !sessionActive}
          aria-label={orbLabel}
          title={orbLabel}
          onClick={() => {
            if (error && !sessionActive) {
              void startSession()
              return
            }
            onOrbPress()
          }}
        >
          <span className="voice-orb-ring" aria-hidden="true" />
          <span className="voice-orb-core" aria-hidden="true" />
        </button>

        <p className="voice-orb-status" role="status" aria-live="polite">
          {error
            ? error
            : sessionActive
              ? stateLabel(state, messages)
              : messages.voiceConversationHint}
        </p>

        {error ? (
          <button
            type="button"
            className="button button-secondary voice-orb-retry"
            onClick={() => {
              endSessionInternal()
              setError(null)
              void startSession()
            }}
          >
            {messages.voiceRetry}
          </button>
        ) : null}

        {heard || answer ? (
          <div className="voice-orb-transcript" aria-live="polite">
            {heard ? (
              <p>
                <span className="voice-label">{messages.voiceTranscriptLabel}</span>{" "}
                {heard}
              </p>
            ) : null}
            {answer ? (
              <p>
                <span className="voice-label">{messages.voiceAnswerLabel}</span>{" "}
                <span className="emphasis">{answer}</span>
              </p>
            ) : null}
            {textOnlyNote ? <p className="voice-turn-note">{textOnlyNote}</p> : null}
          </div>
        ) : null}

        {SHOW_VOICE_DEBUG && debugLog.length > 0 ? (
          <details className="voice-debug">
            <summary>debug</summary>
            <ol className="voice-debug-list">
              {debugLog.map((entry, index) => (
                <li key={`${entry.at}-${entry.step}-${index}`}>
                  <code>
                    {entry.at} {entry.step}
                    {entry.detail ? ` — ${entry.detail}` : ""}
                  </code>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    )
  }

  return (
    <section className="voice-conversation" aria-label={messages.voiceConversationTitle}>
      <div className="voice-conversation-controls" role="group">
        {!sessionActive ? (
          <button
            type="button"
            className="button voice-mic-button"
            onClick={() => void startSession()}
            disabled={!capability.speechInput}
          >
            {messages.voiceStartConversation}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="button button-secondary"
              onClick={toggleMute}
              aria-pressed={muted}
            >
              {muted ? messages.voiceUnmuteMic : messages.voiceMuteMic}
            </button>
            <button type="button" className="button button-secondary" onClick={endSessionInternal}>
              {messages.voiceEndConversation}
            </button>
          </>
        )}
      </div>

      <p
        className="voice-status"
        role="status"
        aria-live="polite"
        data-mic-live={showMicLive ? "true" : "false"}
      >
        {showMicLive ? <span className="voice-live-dot" aria-hidden="true" /> : null}
        {stateLabel(state, messages)}
      </p>

      {error ? (
        <div className="voice-error-block" role="alert">
          <p className="form-error">{error}</p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              endSessionInternal()
              void startSession()
            }}
          >
            {messages.voiceRetry}
          </button>
        </div>
      ) : null}

      {heard || answer ? (
        <div className="voice-turn" aria-live="polite">
          {heard ? (
            <p className="voice-turn-heard">
              <span className="voice-label">{messages.voiceTranscriptLabel}</span> {heard}
            </p>
          ) : null}
          {answer ? (
            <p className="voice-turn-answer">
              <span className="voice-label">{messages.voiceAnswerLabel}</span>{" "}
              <span className="emphasis">{answer}</span>
            </p>
          ) : null}
          {textOnlyNote ? <p className="voice-turn-note">{textOnlyNote}</p> : null}
        </div>
      ) : null}

      <div className="voice-followups">
        {openEmergency ? (
          <Link className="button button-emergency" to="/emergency">
            {messages.voiceGoEmergency}
          </Link>
        ) : null}
        {needsMyTurn ? (
          <Link className="button button-secondary" to="/slip">
            {messages.voiceOpenMyTurn}
          </Link>
        ) : null}
      </div>
    </section>
  )
}
