import "@supabase/functions-js/edge-runtime.d.ts"
import {
  isUiLanguage,
  sarvamClassifyIntent,
  STT_CODES,
  TTS_CODES,
  type UiLanguage,
} from "../_shared/voice.ts"
import {
  ticketSigningSecret,
  verifyVoiceTicket,
} from "../_shared/voiceTicket.ts"

const SARVAM_STT_WS = "wss://api.sarvam.ai/speech-to-text-realtime/ws"
const SARVAM_TTS_WS =
  "wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v3&send_completion_event=true"

const MAX_SESSION_MS = 8 * 60_000
const IDLE_MS = 90_000
const MAX_PCM_MESSAGE = 64_000
const MAX_CONCURRENT = 40

const activeSessions = new Map<string, number>()

type ClientMsg =
  | { type: "audio"; pcm: string }
  | { type: "interrupt"; turnId?: string }
  | { type: "speak"; turnId: string; text: string }
  /** Client finished playing TTS (+ echo tail). Safe to listen again. */
  | { type: "playback_done"; turnId?: string }
  | { type: "mute" }
  | { type: "unmute" }
  | { type: "ping" }
  | { type: "end" }

function emit(socket: WebSocket, payload: unknown) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  }
}

type WsHandlers = {
  onOpen: () => void
  onMessage: (raw: string) => void
  onError: () => void
  onClose: () => void
}

/**
 * Server-side Sarvam WebSocket. API key stays on the Edge Function.
 *
 * Supabase Edge's WebSocket constructor is unreliable with a Deno-only
 * `{ headers }` options bag (it can abort the isolate → client close 1006).
 * Use Sarvam's documented subprotocol auth instead:
 *   `api-subscription-key.<API_KEY>`
 */
function createSarvamWs(
  url: string,
  apiKey: string,
  handlers: WsHandlers,
): WebSocket {
  const ws = new WebSocket(url, [`api-subscription-key.${apiKey}`])
  ws.onopen = () => handlers.onOpen()
  ws.onmessage = (event) => handlers.onMessage(String(event.data))
  ws.onerror = () => handlers.onError()
  ws.onclose = () => handlers.onClose()
  return ws
}

function debug(socket: WebSocket, step: string, detail?: string) {
  emit(socket, {
    type: "debug",
    step,
    detail: detail?.slice(0, 240) ?? "",
  })
}

/**
 * Real-time voice relay.
 * Browser ↔ SehatFlow WS ↔ Sarvam STT/TTS. API key stays server-side.
 * Auth: short-lived ticket from voice-assist HTTPS (`?ticket=`).
 * EdgeRuntime.waitUntil stays pending until the socket closes.
 */
export default {
  fetch: (req: Request) => {
    const origin = req.headers.get("Origin")
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    const upgrade = req.headers.get("upgrade")?.toLowerCase() ?? ""
    if (upgrade !== "websocket") {
      return Response.json(
        { error: "websocket_upgrade_required" },
        { status: 400, headers: corsHeaders(origin) },
      )
    }

    return handleUpgrade(req)
  },
}

async function handleUpgrade(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const ticket = url.searchParams.get("ticket")?.trim() ?? ""
  const secret = ticketSigningSecret()
  const apiKey = Deno.env.get("SARVAM_API_KEY")?.trim()
  if (!secret || !apiKey) {
    return new Response("voice_service_unavailable", { status: 503 })
  }

  const verified = await verifyVoiceTicket({ ticket, secret })
  if (!verified.ok) {
    return new Response(`unauthorized:${verified.reason}`, { status: 401 })
  }
  if (!isUiLanguage(verified.payload.lang)) {
    return new Response("bad_language", { status: 400 })
  }
  const language = verified.payload.lang as UiLanguage

  if (activeSessions.size >= MAX_CONCURRENT) {
    return new Response("voice_rate_limited", { status: 429 })
  }

  const { socket, response } = Deno.upgradeWebSocket(req, { idleTimeout: 0 })

  let resolveClosed!: () => void
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve
  })
  // @ts-expect-error EdgeRuntime is provided by Supabase
  EdgeRuntime.waitUntil(closed)

  const sessionId = verified.payload.jti
  activeSessions.set(sessionId, Date.now())

  let muted = false
  /**
   * True from speak start until the browser reports playback_done.
   * Covers synthesis + local playback + speaker→mic echo.
   */
  let assistantSpeaking = false
  let listenResumeAt = 0
  let closedOnce = false
  let sttSocket: WebSocket | null = null
  let ttsSocket: WebSocket | null = null
  let currentTurnId: string | null = null
  let lastActivity = Date.now()
  const startedAt = Date.now()

  const idleTimer = setInterval(() => {
    if (
      Date.now() - lastActivity > IDLE_MS ||
      Date.now() - startedAt > MAX_SESSION_MS
    ) {
      emit(socket, {
        type: "error",
        code: "voice_timeout",
        message: "session_idle_or_expired",
      })
      cleanup(1000)
    }
  }, 5_000)

  function cleanup(code = 1000) {
    if (closedOnce) {
      return
    }
    closedOnce = true
    clearInterval(idleTimer)
    activeSessions.delete(sessionId)
    try {
      sttSocket?.close(code)
    } catch {
      /* ignore */
    }
    try {
      ttsSocket?.close(code)
    } catch {
      /* ignore */
    }
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(code)
      }
    } catch {
      /* ignore */
    }
    resolveClosed()
  }

  function cancelTts() {
    try {
      ttsSocket?.close(1000)
    } catch {
      /* ignore */
    }
    ttsSocket = null
  }

  function releaseListenGate() {
    assistantSpeaking = false
    listenResumeAt = Date.now() + 400
    cancelTts()
  }

  function sttBlocked(): boolean {
    return assistantSpeaking || Date.now() < listenResumeAt
  }

  function openStt() {
    const qs = new URLSearchParams({
      language_code: STT_CODES[language],
      model: "saaras:v4",
      stream_type: "fast",
      endpointing: "vad",
      encoding: "linear16",
      sample_rate: "16000",
      silence_duration_ms: "600",
      min_speech_duration_ms: "250",
      threshold: "0.3",
    })
    debug(socket, "stt_connecting", `lang=${STT_CODES[language]} model=saaras:v4`)
    sttSocket = createSarvamWs(`${SARVAM_STT_WS}?${qs.toString()}`, apiKey, {
      onOpen: () => {
        debug(socket, "stt_open")
        emit(socket, { type: "state", state: "listening" })
      },
      onMessage: (raw) => handleSttMessage(raw),
      onError: () => {
        debug(socket, "stt_error", "sarvam_stt_socket_error")
        emit(socket, {
          type: "error",
          code: "voice_service_error",
          message: "stt_failed",
        })
      },
      onClose: () => {
        debug(socket, "stt_close")
      },
    })
  }

  function handleSttMessage(raw: string) {
    lastActivity = Date.now()
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    const event = typeof msg.event === "string" ? msg.event : ""
    // Ignore STT while assistant audio may still be in the room.
    if (sttBlocked()) {
      if (
        event === "vad.speech_start" ||
        event === "vad.speech_end" ||
        event === "transcript.partial" ||
        event === "transcript.final"
      ) {
        debug(socket, "stt_ignored_while_speaking", event)
      }
      return
    }
    if (event === "vad.speech_start") {
      emit(socket, { type: "state", state: "listening" })
      return
    }
    if (event === "vad.speech_end") {
      emit(socket, { type: "state", state: "recognizing" })
      return
    }
    if (event === "transcript.partial") {
      const text = typeof msg.text === "string" ? msg.text : ""
      emit(socket, { type: "partial", text })
      emit(socket, { type: "state", state: "recognizing" })
      return
    }
    if (event === "transcript.final") {
      const text = typeof msg.text === "string" ? msg.text.trim() : ""
      if (!text) {
        return
      }
      const turnId = crypto.randomUUID()
      currentTurnId = turnId
      emit(socket, { type: "final", text, turnId })
      emit(socket, { type: "state", state: "thinking" })
      void classifyAndEmit(turnId, text)
      return
    }
    if (event === "error") {
      emit(socket, {
        type: "error",
        code: "voice_service_error",
        message: "stt_error",
      })
    }
  }

  async function classifyAndEmit(turnId: string, transcript: string) {
    const classified = await sarvamClassifyIntent({
      apiKey,
      transcript,
      language,
    })
    if (currentTurnId !== turnId) {
      return
    }
    const intent = classified.ok
      ? classified.data
      : {
          intent: "unknown" as const,
          department_code: null,
          destination_code: null,
          start_landmark: null,
          confidence: 0,
        }
    emit(socket, {
      type: "intent",
      turnId,
      transcript,
      intent,
      tts_supported: Boolean(TTS_CODES[language]),
    })
  }

  function speakText(turnId: string, text: string) {
    if (currentTurnId !== turnId) {
      return
    }
    const ttsCode = TTS_CODES[language]
    if (!ttsCode) {
      emit(socket, {
        type: "text_only",
        turnId,
        reason: "tts_unsupported_language",
      })
      emit(socket, { type: "speak_done", turnId })
      emit(socket, { type: "state", state: "listening" })
      return
    }

    cancelTts()
    assistantSpeaking = true
    emit(socket, { type: "state", state: "speaking" })
    // One text payload — avoids early "final" between sentence segments.
    const speakable = text.trim().slice(0, 800)
    debug(socket, "tts_connecting", `chars=${speakable.length} lang=${ttsCode} codec=linear16`)

    ttsSocket = createSarvamWs(SARVAM_TTS_WS, apiKey, {
      onOpen: () => {
        debug(socket, "tts_open")
        emit(ttsSocket!, {
          type: "config",
          data: {
            speaker: "shubh",
            language_code: ttsCode,
            pace: 1,
            speech_sample_rate: 24000,
            // PCM chunks are playable incrementally; MP3 fragments are not.
            output_audio_codec: "linear16",
          },
        })
        emit(ttsSocket!, { type: "text", data: { text: speakable } })
        emit(ttsSocket!, { type: "flush" })
      },
      onMessage: (raw) => {
        if (currentTurnId !== turnId) {
          return
        }
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(raw) as Record<string, unknown>
        } catch {
          return
        }
        if (msg.type === "audio" && msg.data && typeof msg.data === "object") {
          const data = msg.data as { audio?: string; content_type?: string }
          if (typeof data.audio === "string") {
            debug(socket, "tts_audio_chunk", `b64=${data.audio.length}`)
            emit(socket, {
              type: "audio",
              turnId,
              mime: data.content_type ?? "audio/l16",
              codec: "linear16",
              sampleRate: 24000,
              chunk: data.audio,
            })
          }
        }
        if (msg.type === "error") {
          debug(socket, "tts_provider_error", JSON.stringify(msg).slice(0, 200))
        }
        if (
          msg.type === "event" &&
          msg.data &&
          typeof msg.data === "object" &&
          (msg.data as { event_type?: string }).event_type === "final"
        ) {
          debug(socket, "tts_final")
          // Keep assistantSpeaking until client playback_done.
          emit(socket, { type: "speak_done", turnId })
          cancelTts()
        }
      },
      onError: () => {
        debug(socket, "tts_error", "sarvam_tts_socket_error")
        emit(socket, { type: "text_only", turnId, reason: "tts_failed" })
        emit(socket, { type: "speak_done", turnId })
      },
      onClose: () => {
        debug(socket, "tts_close")
      },
    })
  }

  socket.onopen = () => {
    try {
      debug(socket, "session_open", `lang=${language}`)
      emit(socket, {
        type: "ready",
        language,
        tts_supported: Boolean(TTS_CODES[language]),
        max_session_ms: MAX_SESSION_MS,
      })
      emit(socket, { type: "state", state: "connecting" })
      openStt()
    } catch (error) {
      const message = error instanceof Error ? error.message : "stt_boot_failed"
      debug(socket, "stt_boot_exception", message)
      emit(socket, {
        type: "error",
        code: "voice_service_error",
        message: "stt_boot_failed",
      })
    }
  }

  socket.onmessage = (event) => {
    lastActivity = Date.now()
    let msg: ClientMsg
    try {
      msg = JSON.parse(String(event.data)) as ClientMsg
    } catch {
      return
    }
    if (msg.type === "ping") {
      emit(socket, { type: "pong" })
      if (sttSocket?.readyState === WebSocket.OPEN) {
        sttSocket.send(JSON.stringify({ event: "ping" }))
      }
      return
    }
    if (msg.type === "end") {
      cleanup(1000)
      return
    }
    if (msg.type === "mute") {
      muted = true
      emit(socket, { type: "state", state: "muted" })
      return
    }
    if (msg.type === "unmute") {
      muted = false
      emit(socket, { type: "state", state: "listening" })
      return
    }
    if (msg.type === "interrupt") {
      currentTurnId = null
      releaseListenGate()
      debug(socket, "client_interrupt")
      emit(socket, { type: "barge_in" })
      emit(socket, { type: "state", state: "interrupted" })
      emit(socket, { type: "state", state: "listening" })
      return
    }
    if (msg.type === "playback_done") {
      releaseListenGate()
      debug(socket, "playback_done", msg.turnId ?? "")
      emit(socket, { type: "state", state: "listening" })
      return
    }
    if (msg.type === "speak") {
      currentTurnId = msg.turnId
      speakText(msg.turnId, String(msg.text ?? "").slice(0, 800))
      return
    }
    if (msg.type === "audio") {
      if (
        muted ||
        sttBlocked() ||
        !sttSocket ||
        sttSocket.readyState !== WebSocket.OPEN
      ) {
        return
      }
      if (typeof msg.pcm !== "string" || msg.pcm.length > MAX_PCM_MESSAGE) {
        return
      }
      sttSocket.send(JSON.stringify({ event: "audio_input", audio: msg.pcm }))
    }
  }

  socket.onclose = () => cleanup(1000)
  socket.onerror = () => cleanup(1011)

  return response
}
