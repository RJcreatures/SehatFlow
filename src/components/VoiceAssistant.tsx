import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { Link } from "react-router"
import {
  answerForIntent,
  type DepartmentFact,
  type TokenContext,
} from "../domain/voice/answers.ts"
import {
  getVoiceCapability,
  voiceAssistantAvailable,
} from "../domain/voice/capabilities.ts"
import { validateVoiceRecording } from "../domain/voice/audioLimits.ts"
import {
  parseVoiceIntent,
  transcriptSuggestsEmergency,
  type VoiceIntent,
} from "../domain/voice/intents.ts"
import type { RouteMode } from "../domain/navigation/types.ts"
import type { UiLanguage } from "../i18n/index.ts"
import {
  getSupabaseClient,
  readSupabaseState,
} from "../lib/supabase/client.ts"
import {
  invokeVoiceAssist,
  invokeVoiceText,
  invokeVoiceTts,
  voiceErrorMessage,
} from "../lib/supabase/voiceApi.ts"
import { useMessages } from "../preferences/usePreferences.ts"

const MAX_RECORD_MS = 15_000

type Phase =
  | "idle"
  | "recording"
  | "processing"
  | "ready"
  | "playing"
  | "error"

export type VoiceAssistantProps = {
  language: UiLanguage
  token: TokenContext | null
  departments: DepartmentFact[]
  routeMode?: RouteMode
  startId?: string
  contextLabel?: string
  /** When true, omit the outer title (dialog supplies it). */
  compact?: boolean
  /** Show typed question field (default true for global panel). */
  allowText?: boolean
}

export function VoiceAssistant({
  language,
  token,
  departments,
  routeMode = "assisted",
  startId = "entrance",
  contextLabel,
  compact = false,
  allowText = true,
}: VoiceAssistantProps) {
  const messages = useMessages()
  const titleId = useId()
  const statusId = useId()
  const capability = getVoiceCapability(language)
  const supabaseState = readSupabaseState(import.meta.env)
  const client = getSupabaseClient()

  const [phase, setPhase] = useState<Phase>("idle")
  const [statusText, setStatusText] = useState("")
  const [transcript, setTranscript] = useState<string | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openEmergency, setOpenEmergency] = useState(false)
  const [needsMyTurn, setNeedsMyTurn] = useState(false)
  const [openRegister, setOpenRegister] = useState(false)
  const [textOnlyNote, setTextOnlyNote] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [typedQuestion, setTypedQuestion] = useState("")

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const maxTimerRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    return () => {
      cleanupMedia()
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    cancelAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  function cleanupMedia() {
    if (maxTimerRef.current != null) {
      window.clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop()
      } catch {
        /* ignore */
      }
    }
    mediaRecorderRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  function clearAudio() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }
  }

  function cancelAll() {
    cancelledRef.current = true
    cleanupMedia()
    clearAudio()
    setPhase("idle")
    setStatusText("")
    setTranscript(null)
    setAnswer(null)
    setError(null)
    setOpenEmergency(false)
    setNeedsMyTurn(false)
    setOpenRegister(false)
    setTextOnlyNote(null)
  }

  async function applyTranscriptAndIntent(
    heard: string,
    rawIntent: unknown,
  ): Promise<void> {
    setTranscript(heard)
    setStatusText(messages.voiceListening)

    let intent: VoiceIntent =
      parseVoiceIntent(rawIntent) ?? {
        intent: "unknown",
        department_code: null,
        destination_code: null,
        start_landmark: null,
        confidence: 0,
      }

    if (transcriptSuggestsEmergency(heard)) {
      intent = {
        intent: "emergency",
        department_code: null,
        destination_code: null,
        start_landmark: null,
        confidence: 1,
      }
    }

    const resolved = answerForIntent({
      intent,
      messages,
      token,
      departments,
      routeMode,
      startId,
    })

    setAnswer(resolved.answer)
    setOpenEmergency(resolved.openEmergency)
    setNeedsMyTurn(resolved.needsMyTurn)
    setOpenRegister(intent.intent === "registration_help")

    if (resolved.openEmergency) {
      setTextOnlyNote(null)
      setPhase("ready")
      setStatusText(messages.voiceAnswerLabel)
      return
    }

    if (!capability.speechOutput || !client) {
      setTextOnlyNote(
        capability.speechOutput ? null : messages.voiceTextOnlyFallback,
      )
      setPhase("ready")
      setStatusText(messages.voiceAnswerLabel)
      return
    }

    const spoken = await invokeVoiceTts(client, {
      text: resolved.answer,
      language,
    })
    if (cancelledRef.current) {
      return
    }
    if (!spoken.ok) {
      setTextOnlyNote(messages.voiceTextOnlyFallback)
      setPhase("ready")
      setStatusText(messages.voiceAnswerLabel)
      return
    }

    const bytes = Uint8Array.from(atob(spoken.data.audio_base64), (c) =>
      c.charCodeAt(0),
    )
    const url = URL.createObjectURL(
      new Blob([bytes], { type: spoken.data.audio_mime }),
    )
    setAudioUrl(url)
    setTextOnlyNote(null)
    setPhase("ready")
    setStatusText(messages.voiceAnswerLabel)
    playUrl(url)
  }

  async function startRecording() {
    cancelledRef.current = false
    setError(null)
    setTranscript(null)
    setAnswer(null)
    setOpenEmergency(false)
    setNeedsMyTurn(false)
    setOpenRegister(false)
    setTextOnlyNote(null)
    clearAudio()

    if (!voiceAssistantAvailable(language)) {
      setPhase("error")
      setError(messages.voiceUnavailable)
      setStatusText(messages.voiceUnavailable)
      return
    }
    if (supabaseState.status !== "ready" || !client) {
      setPhase("error")
      setError(
        supabaseState.status === "refused"
          ? messages.backendRefusedKey
          : messages.backendUnconfigured,
      )
      setStatusText(messages.voiceServiceError)
      return
    }
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setPhase("error")
      setError(messages.voiceServiceError)
      setStatusText(messages.voiceServiceError)
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setPhase("error")
      setError(messages.voiceMicDenied)
      setStatusText(messages.voiceMicDenied)
      return
    }

    streamRef.current = stream
    chunksRef.current = []
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : ""
    const recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream)
    mediaRecorderRef.current = recorder
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data)
      }
    }
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      void finishRecording(recorder.mimeType || "audio/webm")
    }

    startedAtRef.current = Date.now()
    recorder.start()
    setPhase("recording")
    setStatusText(messages.voiceRecording)
    maxTimerRef.current = window.setTimeout(() => {
      stopRecording()
    }, MAX_RECORD_MS)
  }

  function stopRecording() {
    if (maxTimerRef.current != null) {
      window.clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === "inactive") {
      return
    }
    setPhase("processing")
    setStatusText(messages.voiceProcessing)
    recorder.stop()
  }

  async function finishRecording(mimeType: string) {
    if (cancelledRef.current) {
      return
    }
    const durationMs = Date.now() - startedAtRef.current
    const blob = new Blob(chunksRef.current, { type: mimeType })
    chunksRef.current = []
    const validation = validateVoiceRecording({
      byteLength: blob.size,
      durationMs,
      mime: mimeType || "audio/webm",
    })
    if (blob.size < 200 || validation === "voice_bad_audio") {
      setPhase("error")
      setError(messages.voiceBadAudio)
      setStatusText(messages.voiceBadAudio)
      return
    }
    if (validation === "voice_too_long") {
      setPhase("error")
      setError(messages.voiceTooLong)
      setStatusText(messages.voiceTooLong)
      return
    }
    if (!client) {
      setPhase("error")
      setError(messages.backendUnconfigured)
      return
    }

    const result = await invokeVoiceAssist(client, {
      audio: blob,
      language,
      durationMs,
    })

    if (cancelledRef.current) {
      return
    }

    if (!result.ok) {
      setPhase("error")
      const message = voiceErrorMessage(result.code, messages)
      setError(message)
      setStatusText(message)
      return
    }

    await applyTranscriptAndIntent(result.data.transcript, result.data.intent)
  }

  async function submitTyped(event: FormEvent) {
    event.preventDefault()
    const question = typedQuestion.trim()
    if (!question || phase === "processing" || phase === "recording") {
      return
    }

    cancelledRef.current = false
    setError(null)
    setAnswer(null)
    setOpenEmergency(false)
    setNeedsMyTurn(false)
    setOpenRegister(false)
    setTextOnlyNote(null)
    clearAudio()
    setTranscript(question)

    // Emergency never depends on Sarvam.
    if (transcriptSuggestsEmergency(question)) {
      await applyTranscriptAndIntent(question, {
        intent: "emergency",
        department_code: null,
        destination_code: null,
        start_landmark: null,
        confidence: 1,
      })
      setTypedQuestion("")
      return
    }

    if (supabaseState.status !== "ready" || !client) {
      setPhase("error")
      setError(
        supabaseState.status === "refused"
          ? messages.backendRefusedKey
          : messages.backendUnconfigured,
      )
      setStatusText(messages.voiceServiceError)
      return
    }

    setPhase("processing")
    setStatusText(messages.voiceProcessing)
    const result = await invokeVoiceText(client, {
      text: question,
      language,
    })
    if (cancelledRef.current) {
      return
    }
    if (!result.ok) {
      setPhase("error")
      const message = voiceErrorMessage(result.code, messages)
      setError(message)
      setStatusText(message)
      return
    }
    setTypedQuestion("")
    await applyTranscriptAndIntent(result.data.transcript, result.data.intent)
  }

  function playUrl(url: string) {
    clearAudioElementOnly()
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = () => {
      setPhase("ready")
      setStatusText(messages.voiceAnswerLabel)
    }
    void audio.play().then(
      () => {
        setPhase("playing")
        setStatusText(messages.voiceReplay)
      },
      () => {
        setTextOnlyNote(messages.voiceTextOnlyFallback)
        setPhase("ready")
      },
    )
  }

  function clearAudioElementOnly() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }

  function replay() {
    if (!audioUrl) {
      return
    }
    playUrl(audioUrl)
  }

  function stopPlayback() {
    clearAudioElementOnly()
    setPhase("ready")
    setStatusText(messages.voiceAnswerLabel)
  }

  const recording = phase === "recording"
  const busy = phase === "processing"

  return (
    <section
      className={compact ? "voice-assistant voice-assistant-compact" : "panel voice-assistant"}
      aria-labelledby={compact ? undefined : titleId}
      data-context={contextLabel ?? "voice"}
    >
      {compact ? null : (
        <>
          <h2 id={titleId}>{messages.voiceTitle}</h2>
          <p>{messages.voiceHint}</p>
        </>
      )}

      {!capability.speechInput ? (
        <p className="form-error" role="status">
          {messages.voiceUnavailable}
        </p>
      ) : null}

      <div className="voice-controls" role="group" aria-label={messages.voiceTitle}>
        {!recording ? (
          <button
            type="button"
            className="button voice-mic-button"
            onClick={() => void startRecording()}
            disabled={busy || !capability.speechInput}
            aria-describedby={statusId}
          >
            {messages.voiceStart}
          </button>
        ) : (
          <button
            type="button"
            className="button button-emergency voice-mic-button"
            onClick={stopRecording}
            aria-describedby={statusId}
          >
            {messages.voiceStop}
          </button>
        )}
        {(recording ||
          busy ||
          phase === "error" ||
          phase === "ready" ||
          phase === "playing") && (
          <button type="button" className="button button-secondary" onClick={cancelAll}>
            {phase === "error" ? messages.voiceRetry : messages.voiceCancel}
          </button>
        )}
        {audioUrl && phase !== "playing" ? (
          <button type="button" className="button button-secondary" onClick={replay}>
            {messages.voiceReplay}
          </button>
        ) : null}
        {phase === "playing" ? (
          <button type="button" className="button button-secondary" onClick={stopPlayback}>
            {messages.voiceStopPlayback}
          </button>
        ) : null}
      </div>

      {allowText ? (
        <form className="voice-text-form" onSubmit={(event) => void submitTyped(event)}>
          <label className="field">
            <span>{messages.assistantTextLabel}</span>
            <input
              type="text"
              name="assistant_question"
              value={typedQuestion}
              onChange={(event) => setTypedQuestion(event.target.value)}
              placeholder={messages.assistantTextPlaceholder}
              autoComplete="off"
              disabled={busy || recording}
              maxLength={500}
            />
          </label>
          <button
            type="submit"
            className="button button-secondary"
            disabled={busy || recording || typedQuestion.trim().length === 0}
          >
            {messages.assistantSend}
          </button>
        </form>
      ) : null}

      <p id={statusId} className="voice-status" role="status" aria-live="polite">
        {statusText || (recording ? messages.voiceRecording : null)}
      </p>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {transcript ? (
        <div className="voice-transcript">
          <p className="voice-label">{messages.voiceTranscriptLabel}</p>
          <p>{transcript}</p>
        </div>
      ) : null}

      {answer ? (
        <div className="voice-answer" aria-live="polite">
          <p className="voice-label">{messages.voiceAnswerLabel}</p>
          <p className="emphasis">{answer}</p>
          {textOnlyNote ? <p>{textOnlyNote}</p> : null}
        </div>
      ) : null}

      <div className="voice-followups">
        {openEmergency ? (
          <Link className="button button-emergency" to="/emergency">
            {messages.voiceGoEmergency}
          </Link>
        ) : null}
        {needsMyTurn ? (
          <Link className="button button-secondary" to="/my-turn">
            {messages.voiceOpenMyTurn}
          </Link>
        ) : null}
        {openRegister ? (
          <Link className="button button-secondary" to="/register">
            {messages.assistantOpenRegister}
          </Link>
        ) : null}
        {phase === "error" ? (
          <p>
            <Link to="/emergency">{messages.voiceGoEmergency}</Link>
            {" · "}
            <span>{messages.voiceContinueApp}</span>
          </p>
        ) : null}
      </div>
    </section>
  )
}
