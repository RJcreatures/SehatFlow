import type { UiLanguage } from "../../i18n/index.ts"
import type { VoiceIntent } from "../../domain/voice/intents.ts"

export type VoiceSessionState =
  | "idle"
  | "connecting"
  | "listening"
  | "recognizing"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "muted"
  | "reconnecting"
  | "error"

export type RealtimeServerMessage =
  | { type: "ready"; language: UiLanguage; tts_supported: boolean }
  | { type: "state"; state: VoiceSessionState }
  | { type: "partial"; text: string }
  | { type: "final"; text: string; turnId: string }
  | {
      type: "intent"
      turnId: string
      transcript: string
      intent: VoiceIntent
      tts_supported: boolean
    }
  | {
      type: "audio"
      turnId: string
      mime: string
      chunk: string
      codec?: string
      sampleRate?: number
    }
  | { type: "speak_done"; turnId: string }
  | { type: "text_only"; turnId: string; reason: string }
  | { type: "barge_in" }
  | { type: "error"; code: string; message?: string }
  | { type: "debug"; step: string; detail?: string }
  | { type: "pong" }

export type RealtimeHandlers = {
  onMessage: (message: RealtimeServerMessage) => void
  onClose: (info: { code: number; reason: string; wasClean: boolean }) => void
  onOpen?: () => void
  onError?: () => void
}

/** Strip pasted /rest/v1 paths so WS targets /functions/v1/… on the project root. */
export function normalizeSupabaseWsBase(supabaseUrl: string): string {
  const trimmed = supabaseUrl.trim().replace(/\/$/, "")
  if (!trimmed) {
    return ""
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.pathname === "/rest/v1" || parsed.pathname === "/rest/v1/") {
      parsed.pathname = "/"
    }
    parsed.search = ""
    parsed.hash = ""
    const root = parsed.toString().replace(/\/$/, "")
    return root.replace(/^http/i, "ws")
  } catch {
    return trimmed.replace(/^http/i, "ws")
  }
}

export function buildRealtimeWsUrl(input: {
  supabaseUrl: string
  publishableKey: string
  ticket: string
}): string {
  const wsBase = normalizeSupabaseWsBase(input.supabaseUrl)
  const url = new URL(`${wsBase}/functions/v1/voice-realtime`)
  url.searchParams.set("ticket", input.ticket)
  url.searchParams.set("apikey", input.publishableKey)
  return url.toString()
}

export type RealtimeSocket = {
  send: (payload: unknown) => void
  close: () => void
  readonly readyState: number
}

export function openRealtimeSocket(
  url: string,
  handlers: RealtimeHandlers,
): RealtimeSocket {
  const ws = new WebSocket(url)
  let pingTimer: number | null = null

  ws.onopen = () => {
    handlers.onOpen?.()
    pingTimer = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }))
      }
    }, 20_000)
  }
  ws.onmessage = (event) => {
    try {
      const parsed = JSON.parse(String(event.data)) as RealtimeServerMessage
      handlers.onMessage(parsed)
    } catch {
      /* ignore */
    }
  }
  ws.onclose = (event) => {
    if (pingTimer != null) {
      window.clearInterval(pingTimer)
    }
    handlers.onClose({
      code: event.code,
      reason: event.reason ?? "",
      wasClean: event.wasClean,
    })
  }
  ws.onerror = () => {
    handlers.onError?.()
  }

  return {
    get readyState() {
      return ws.readyState
    },
    send(payload) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload))
      }
    },
    close() {
      if (pingTimer != null) {
        window.clearInterval(pingTimer)
      }
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "end" }))
        }
        ws.close()
      } catch {
        /* ignore */
      }
    },
  }
}

export function decodeBase64Audio(chunk: string): ArrayBuffer {
  const binary = atob(chunk)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
