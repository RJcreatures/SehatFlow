import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"
import { allowRequest, clientKey, jsonResponse } from "../_shared/patient.ts"
import {
  isAllowedAudioMime,
  isUiLanguage,
  MAX_AUDIO_BYTES,
  publicErrorMessage,
  sarvamClassifyIntent,
  sarvamSynthesize,
  sarvamTranscribe,
  TTS_CODES,
  type UiLanguage,
} from "../_shared/voice.ts"
import {
  mintVoiceTicket,
  ticketSigningSecret,
} from "../_shared/voiceTicket.ts"

/**
 * Patient voice assistant proxy.
 * - Browser never talks to Sarvam directly.
 * - SARVAM_API_KEY stays server-side only.
 * - Does not accept or forward QR tokens / access codes to Sarvam.
 * - Does not store audio or transcripts.
 * - Intent facts for queue/navigation are resolved by the client from verified app APIs.
 */
export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req) => {
    if (req.method === "OPTIONS") {
      return jsonResponse(req, { ok: true })
    }
    if (req.method !== "POST") {
      return jsonResponse(req, { error: "method not allowed" }, 405)
    }

    if (!allowRequest(`voice:${clientKey(req)}`, 12, 60_000)) {
      return jsonResponse(req, { error: "voice_rate_limited" }, 429)
    }

    const apiKey = Deno.env.get("SARVAM_API_KEY")?.trim()
    if (!apiKey) {
      return jsonResponse(
        req,
        { error: publicErrorMessage("missing_key") },
        503,
      )
    }

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return jsonResponse(req, { error: "voice_bad_audio" }, 400)
    }

    const languageRaw = form.get("language")
    if (!isUiLanguage(languageRaw)) {
      return jsonResponse(req, { error: "voice_bad_audio" }, 400)
    }
    const language: UiLanguage = languageRaw

    const mode = String(form.get("mode") ?? "assist")
    if (mode === "session_ticket") {
      const signing = ticketSigningSecret()
      if (!signing) {
        return jsonResponse(req, { error: "voice_service_unavailable" }, 503)
      }
      if (!allowRequest(`voice-ticket:${clientKey(req)}`, 20, 60_000)) {
        return jsonResponse(req, { error: "voice_rate_limited" }, 429)
      }
      const minted = await mintVoiceTicket({
        language,
        secret: signing,
        ttlMs: 120_000,
      })
      return jsonResponse(req, {
        ticket: minted.ticket,
        expires_at: minted.expiresAt,
        language,
        tts_supported: Boolean(TTS_CODES[language]),
      })
    }
    if (mode === "tts") {
      return handleTts(req, apiKey, language, form)
    }
    if (mode === "text") {
      return handleTextIntent(req, apiKey, language, form)
    }

    const file = form.get("audio")
    if (!(file instanceof File)) {
      return jsonResponse(req, { error: "voice_bad_audio" }, 400)
    }
    if (file.size <= 0 || file.size > MAX_AUDIO_BYTES) {
      return jsonResponse(
        req,
        { error: publicErrorMessage(file.size > MAX_AUDIO_BYTES ? "too_large" : "bad_audio") },
        400,
      )
    }
    const mime = file.type || "application/octet-stream"
    if (!isAllowedAudioMime(mime)) {
      return jsonResponse(req, { error: "voice_bad_audio" }, 400)
    }

    // Reject obvious oversize duration proxies (client also caps recording length).
    const claimedMs = Number(form.get("duration_ms") ?? "0")
    if (Number.isFinite(claimedMs) && claimedMs > 15_000) {
      return jsonResponse(req, { error: "voice_too_long" }, 400)
    }

    const stt = await sarvamTranscribe({
      apiKey,
      audio: file,
      filename: safeFilename(file.name, mime),
      language,
    })
    if (!stt.ok) {
      return jsonResponse(req, { error: publicErrorMessage(stt.kind) }, statusFor(stt.kind))
    }

    const classified = await sarvamClassifyIntent({
      apiKey,
      transcript: stt.data.transcript,
      language,
    })
    if (!classified.ok) {
      return jsonResponse(
        req,
        {
          transcript: stt.data.transcript,
          intent: {
            intent: "unknown",
            department_code: null,
            destination_code: null,
            start_landmark: null,
            confidence: 0,
          },
          error: publicErrorMessage(classified.kind),
          tts_supported: Boolean(TTS_CODES[language]),
        },
        statusFor(classified.kind),
      )
    }

    // Optional speak_text: client may ask to synthesize a deterministic answer.
    // Text is capped; never accept tokens/access codes as speak text.
    const speakTextRaw = form.get("speak_text")
    let audio_base64: string | null = null
    let audio_mime: string | null = null
    let tts_fallback: string | null = null

    if (typeof speakTextRaw === "string" && speakTextRaw.trim()) {
      if (!TTS_CODES[language]) {
        tts_fallback = "tts_unsupported_language"
      } else {
        const spoken = await sarvamSynthesize({
          apiKey,
          text: speakTextRaw,
          language,
        })
        if (spoken.ok) {
          audio_base64 = spoken.data.audioBase64
          audio_mime = spoken.data.mime
        } else {
          tts_fallback = publicErrorMessage(spoken.kind)
        }
      }
    } else if (!TTS_CODES[language]) {
      tts_fallback = "tts_unsupported_language"
    }

    return jsonResponse(req, {
      transcript: stt.data.transcript,
      intent: classified.data,
      tts_supported: Boolean(TTS_CODES[language]),
      audio_base64,
      audio_mime,
      tts_fallback,
    })
  }),
}

async function handleTextIntent(
  req: Request,
  apiKey: string,
  language: UiLanguage,
  form: FormData,
): Promise<Response> {
  if (!allowRequest(`voice-text:${clientKey(req)}`, 20, 60_000)) {
    return jsonResponse(req, { error: "voice_rate_limited" }, 429)
  }
  const textRaw = form.get("text")
  if (typeof textRaw !== "string") {
    return jsonResponse(req, { error: "voice_bad_audio" }, 400)
  }
  const transcript = textRaw.trim().slice(0, 500)
  if (transcript.length < 1) {
    return jsonResponse(req, { error: "voice_no_speech" }, 400)
  }
  // Never accept credential-looking payloads as "questions".
  if (/access[_\s-]?code|qr[_\s-]?token/i.test(transcript)) {
    return jsonResponse(req, { error: "voice_bad_audio" }, 400)
  }

  const classified = await sarvamClassifyIntent({
    apiKey,
    transcript,
    language,
  })
  if (!classified.ok) {
    return jsonResponse(
      req,
      {
        transcript,
        intent: {
          intent: "unknown",
          department_code: null,
          destination_code: null,
          start_landmark: null,
          confidence: 0,
        },
        error: publicErrorMessage(classified.kind),
        tts_supported: Boolean(TTS_CODES[language]),
      },
      statusFor(classified.kind),
    )
  }

  return jsonResponse(req, {
    transcript,
    intent: classified.data,
    tts_supported: Boolean(TTS_CODES[language]),
    audio_base64: null,
    audio_mime: null,
    tts_fallback: TTS_CODES[language] ? null : "tts_unsupported_language",
  })
}

async function handleTts(
  req: Request,
  apiKey: string,
  language: UiLanguage,
  form: FormData,
): Promise<Response> {
  if (!allowRequest(`voice-tts:${clientKey(req)}`, 20, 60_000)) {
    return jsonResponse(req, { error: "voice_rate_limited" }, 429)
  }
  if (!TTS_CODES[language]) {
    return jsonResponse(
      req,
      { error: "tts_unsupported_language", tts_supported: false },
      400,
    )
  }
  const text = form.get("text")
  if (typeof text !== "string" || !text.trim()) {
    return jsonResponse(req, { error: "voice_bad_audio" }, 400)
  }
  // Refuse strings that look like credentials leaking into TTS.
  if (/access[_\s-]?code|qr[_\s-]?token/i.test(text)) {
    return jsonResponse(req, { error: "voice_bad_audio" }, 400)
  }
  // Never synthesize opaque token-looking codes alone as "answers".
  if (/^[A-Z0-9]{1,8}-[0-9]{1,4}$/.test(text.trim())) {
    return jsonResponse(req, { error: "voice_bad_audio" }, 400)
  }

  const spoken = await sarvamSynthesize({ apiKey, text, language })
  if (!spoken.ok) {
    return jsonResponse(req, { error: publicErrorMessage(spoken.kind) }, statusFor(spoken.kind))
  }
  return jsonResponse(req, {
    audio_base64: spoken.data.audioBase64,
    audio_mime: spoken.data.mime,
    tts_supported: true,
  })
}

function statusFor(
  kind: "auth" | "rate" | "timeout" | "upstream" | "bad_response",
): number {
  if (kind === "auth") {
    return 503
  }
  if (kind === "rate") {
    return 429
  }
  if (kind === "timeout") {
    return 504
  }
  return 502
}

function safeFilename(name: string, mime: string): string {
  const base = name.replace(/[^\w.-]+/g, "_").slice(0, 40)
  if (base.includes(".")) {
    return base
  }
  if (mime.includes("webm")) {
    return `${base || "audio"}.webm`
  }
  if (mime.includes("ogg")) {
    return `${base || "audio"}.ogg`
  }
  if (mime.includes("wav")) {
    return `${base || "audio"}.wav`
  }
  if (mime.includes("mpeg") || mime.includes("mp3")) {
    return `${base || "audio"}.mp3`
  }
  return `${base || "audio"}.webm`
}
