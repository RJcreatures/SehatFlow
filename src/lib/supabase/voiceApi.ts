import type { UiLanguage } from "../../i18n/index.ts"
import type { VoiceIntent } from "../../domain/voice/intents.ts"
import type { AppSupabase } from "./queueApi.ts"

export type VoiceAssistSuccess = {
  transcript: string
  intent: VoiceIntent
  tts_supported: boolean
  audio_base64: string | null
  audio_mime: string | null
  tts_fallback: string | null
  error?: string
}

export type VoiceTtsSuccess = {
  audio_base64: string
  audio_mime: string
  tts_supported: true
}

export type VoiceApiErrorCode =
  | "voice_rate_limited"
  | "voice_service_unavailable"
  | "voice_service_error"
  | "voice_timeout"
  | "voice_bad_audio"
  | "voice_too_long"
  | "voice_no_speech"
  | "tts_unsupported_language"
  | "voice_backend"

function errorFromBody(data: unknown): VoiceApiErrorCode | null {
  if (!data || typeof data !== "object") {
    return null
  }
  const error = (data as { error?: unknown }).error
  if (typeof error !== "string") {
    return null
  }
  const known: VoiceApiErrorCode[] = [
    "voice_rate_limited",
    "voice_service_unavailable",
    "voice_service_error",
    "voice_timeout",
    "voice_bad_audio",
    "voice_too_long",
    "voice_no_speech",
    "tts_unsupported_language",
  ]
  return known.includes(error as VoiceApiErrorCode)
    ? (error as VoiceApiErrorCode)
    : "voice_backend"
}

export async function invokeVoiceAssist(
  client: AppSupabase,
  input: {
    audio: Blob
    language: UiLanguage
    durationMs: number
    speakText?: string
  },
): Promise<
  | { ok: true; data: VoiceAssistSuccess }
  | { ok: false; code: VoiceApiErrorCode }
> {
  const form = new FormData()
  form.append("audio", input.audio, "recording.webm")
  form.append("language", input.language)
  form.append("mode", "assist")
  form.append("duration_ms", String(Math.round(input.durationMs)))
  if (input.speakText) {
    form.append("speak_text", input.speakText.slice(0, 500))
  }

  const { data, error } = await client.functions.invoke<VoiceAssistSuccess>(
    "voice-assist",
    { body: form },
  )

  if (error) {
    const fromBody = errorFromBody(data)
    if (fromBody) {
      return { ok: false, code: fromBody }
    }
    const message = error.message?.toLowerCase() ?? ""
    if (message.includes("429")) {
      return { ok: false, code: "voice_rate_limited" }
    }
    if (message.includes("504") || message.includes("timeout")) {
      return { ok: false, code: "voice_timeout" }
    }
    return { ok: false, code: "voice_service_error" }
  }

  if (!data || typeof data !== "object") {
    return { ok: false, code: "voice_service_error" }
  }

  const code = errorFromBody(data)
  if (code && !("transcript" in data && typeof data.transcript === "string")) {
    return { ok: false, code }
  }

  if (typeof data.transcript !== "string" || !data.intent) {
    return { ok: false, code: "voice_no_speech" }
  }

  return { ok: true, data }
}

export type VoiceSessionTicket = {
  ticket: string
  expires_at: number
  language: UiLanguage
  tts_supported: boolean
}

export async function mintVoiceSessionTicket(
  client: AppSupabase,
  language: UiLanguage,
): Promise<
  | { ok: true; data: VoiceSessionTicket }
  | { ok: false; code: VoiceApiErrorCode; detail?: string }
> {
  const form = new FormData()
  form.append("mode", "session_ticket")
  form.append("language", language)
  const { data, error } = await client.functions.invoke<VoiceSessionTicket>(
    "voice-assist",
    { body: form },
  )
  if (error || !data || typeof data.ticket !== "string") {
    const fromBody = errorFromBody(data)
    const detailParts = [
      fromBody ? `code=${fromBody}` : null,
      error?.message ? `invoke=${error.message}` : null,
      data && typeof data === "object" && "error" in data
        ? `body=${String((data as { error?: unknown }).error)}`
        : null,
      !data ? "data=null" : null,
    ].filter(Boolean)
    return {
      ok: false,
      code: fromBody ?? "voice_service_unavailable",
      detail: detailParts.join(" ") || "ticket_mint_failed",
    }
  }
  return { ok: true, data }
}

export async function invokeVoiceText(
  client: AppSupabase,
  input: { text: string; language: UiLanguage },
): Promise<
  | { ok: true; data: VoiceAssistSuccess }
  | { ok: false; code: VoiceApiErrorCode }
> {
  const form = new FormData()
  form.append("mode", "text")
  form.append("language", input.language)
  form.append("text", input.text.trim().slice(0, 500))

  const { data, error } = await client.functions.invoke<VoiceAssistSuccess>(
    "voice-assist",
    { body: form },
  )

  if (error) {
    const fromBody = errorFromBody(data)
    if (fromBody) {
      return { ok: false, code: fromBody }
    }
    return { ok: false, code: "voice_service_error" }
  }
  if (!data || typeof data.transcript !== "string" || !data.intent) {
    const fromBody = errorFromBody(data)
    return { ok: false, code: fromBody ?? "voice_no_speech" }
  }
  return { ok: true, data }
}

export async function invokeVoiceTts(
  client: AppSupabase,
  input: { text: string; language: UiLanguage },
): Promise<
  | { ok: true; data: VoiceTtsSuccess }
  | { ok: false; code: VoiceApiErrorCode }
> {
  const form = new FormData()
  form.append("mode", "tts")
  form.append("language", input.language)
  form.append("text", input.text.slice(0, 500))

  const { data, error } = await client.functions.invoke<VoiceTtsSuccess>(
    "voice-assist",
    { body: form },
  )

  if (error) {
    const fromBody = errorFromBody(data)
    return { ok: false, code: fromBody ?? "voice_service_error" }
  }
  if (
    !data ||
    typeof data.audio_base64 !== "string" ||
    typeof data.audio_mime !== "string"
  ) {
    const fromBody = errorFromBody(data)
    return { ok: false, code: fromBody ?? "voice_service_error" }
  }
  return {
    ok: true,
    data: {
      audio_base64: data.audio_base64,
      audio_mime: data.audio_mime,
      tts_supported: true,
    },
  }
}

export function voiceErrorMessage(
  code: VoiceApiErrorCode,
  messages: {
    voiceRateLimited: string
    voiceServiceError: string
    voiceTimeout: string
    voiceBadAudio: string
    voiceTooLong: string
    voiceNoSpeech: string
    voiceUnavailable: string
    voiceTextOnlyFallback: string
  },
): string {
  switch (code) {
    case "voice_rate_limited":
      return messages.voiceRateLimited
    case "voice_timeout":
      return messages.voiceTimeout
    case "voice_bad_audio":
      return messages.voiceBadAudio
    case "voice_too_long":
      return messages.voiceTooLong
    case "voice_no_speech":
      return messages.voiceNoSpeech
    case "voice_service_unavailable":
    case "tts_unsupported_language":
      return messages.voiceUnavailable
    default:
      return messages.voiceServiceError
  }
}
