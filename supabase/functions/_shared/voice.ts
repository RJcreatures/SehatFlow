/**
 * Sarvam AI helpers for the voice-assist Edge Function.
 * API key must come only from Deno.env.get("SARVAM_API_KEY").
 * Never log transcripts, audio, or the API key.
 */

export const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"
export const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"
export const SARVAM_CHAT_URL = "https://api.sarvam.ai/v1/chat/completions"

export const MAX_AUDIO_BYTES = 1_500_000
/** Soft duration cap (~15s of typical mobile webm/opus). */
export const MAX_AUDIO_DURATION_MS = 15_000
export const SARVAM_TIMEOUT_MS = 20_000
export const MAX_TTS_CHARS = 500

export const ALLOWED_AUDIO_MIME = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/flac",
])

export const UI_LANGUAGES = [
  "en",
  "hi",
  "pa",
  "ur",
  "bn",
  "mr",
  "ta",
  "te",
  "gu",
] as const

export type UiLanguage = (typeof UI_LANGUAGES)[number]

export const VOICE_INTENTS = [
  "current_token",
  "wait_estimate",
  "department_info",
  "accessible_route",
  "emergency",
  "app_help",
  "registration_help",
  "unknown",
] as const

export type VoiceIntentName = (typeof VOICE_INTENTS)[number]

export type VoiceIntent = {
  intent: VoiceIntentName
  department_code: string | null
  destination_code: string | null
  start_landmark: string | null
  confidence: number
}

const DEPARTMENT_CODES = new Set([
  "general_medicine",
  "pediatrics",
  "womens_health",
  "orthopedics",
  "ent",
  "ophthalmology",
  "dermatology",
  "cardiology",
  "dental",
  "physiotherapy",
])

const DESTINATION_CODES = new Set([
  ...DEPARTMENT_CODES,
  "laboratory",
  "pharmacy",
  "billing",
  "radiology",
  "washroom_g",
  "water_station",
  "registration",
  "entrance",
  "opd_entrance",
  "waiting_area",
  "help_desk",
  "opd_reception",
  "security_desk",
  "lift_g",
  "ramp_g",
  "stairs_g",
  "blood_collection",
  "dept_general_medicine",
  "dept_pediatrics",
  "dept_womens_health",
  "dept_orthopedics",
  "dept_ent",
  "dept_ophthalmology",
  "dept_dermatology",
  "dept_cardiology",
  "dept_dental",
  "dept_physiotherapy",
])

const LANDMARKS = new Set([
  "entrance",
  "opd_entrance",
  "registration",
  "opd_reception",
  "waiting_area",
  "help_desk",
  "security_desk",
  "lift_g",
  "ramp_g",
  "stairs_g",
  "water_station",
  "washroom_g",
  "pharmacy",
  "laboratory",
  "billing",
  "reception",
])

const DESTINATION_ALIASES: Record<string, string> = {
  lab: "laboratory",
  washroom: "washroom_g",
  toilet: "washroom_g",
  restroom: "washroom_g",
  water: "water_station",
  cardio: "cardiology",
  heart: "cardiology",
}

/** STT BCP-47 codes for SehatFlow UI languages (Saaras). */
export const STT_CODES: Record<UiLanguage, string> = {
  en: "en-IN",
  hi: "hi-IN",
  pa: "pa-IN",
  ur: "ur-IN",
  bn: "bn-IN",
  mr: "mr-IN",
  ta: "ta-IN",
  te: "te-IN",
  gu: "gu-IN",
}

/**
 * Bulbul TTS language_code values. Urdu is intentionally absent —
 * provide text-only answers for `ur`.
 */
export const TTS_CODES: Partial<Record<UiLanguage, string>> = {
  en: "en-IN",
  hi: "hi-IN",
  pa: "pa-IN",
  bn: "bn-IN",
  mr: "mr-IN",
  ta: "ta-IN",
  te: "te-IN",
  gu: "gu-IN",
}

export function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === "string" && (UI_LANGUAGES as readonly string[]).includes(value)
}

export function normalizeMime(mime: string): string {
  return mime.trim().toLowerCase().split(";")[0]!.trim()
}

export function isAllowedAudioMime(mime: string): boolean {
  const base = normalizeMime(mime)
  if (ALLOWED_AUDIO_MIME.has(mime.trim().toLowerCase())) {
    return true
  }
  return [
    "audio/webm",
    "audio/ogg",
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp4",
    "audio/aac",
    "audio/flac",
  ].includes(base)
}

export function parseVoiceIntent(raw: unknown): VoiceIntent | null {
  if (!raw || typeof raw !== "object") {
    return null
  }
  const record = raw as Record<string, unknown>
  if (
    typeof record.intent !== "string" ||
    !(VOICE_INTENTS as readonly string[]).includes(record.intent)
  ) {
    return null
  }
  const confidence =
    typeof record.confidence === "number" && Number.isFinite(record.confidence)
      ? Math.min(1, Math.max(0, record.confidence))
      : 0

  let department_code: string | null = null
  if (typeof record.department_code === "string") {
    const code = record.department_code.trim().toLowerCase()
    department_code = DEPARTMENT_CODES.has(code) ? code : null
  }

  let destination_code: string | null = null
  if (typeof record.destination_code === "string") {
    const raw = record.destination_code.trim().toLowerCase().replace(/\s+/g, "_")
    const aliased = DESTINATION_ALIASES[raw] ?? raw
    destination_code =
      DESTINATION_CODES.has(aliased) || LANDMARKS.has(aliased) ? aliased : null
  }

  let start_landmark: string | null = null
  if (typeof record.start_landmark === "string") {
    const landmark = record.start_landmark.trim().toLowerCase()
    const aliased = DESTINATION_ALIASES[landmark] ?? landmark
    start_landmark =
      LANDMARKS.has(aliased) || DESTINATION_CODES.has(aliased) ? aliased : null
  }

  const intent = record.intent as VoiceIntentName
  // Keep accessible_route / department_info even when codes are missing so the
  // client planner can resolve places from multilingual utterance text.
  if (intent === "department_info" && !department_code) {
    return {
      intent: "department_info",
      department_code: null,
      destination_code: null,
      start_landmark: null,
      confidence,
    }
  }
  if (intent === "accessible_route") {
    return {
      intent: "accessible_route",
      department_code,
      destination_code,
      start_landmark,
      confidence,
    }
  }

  return {
    intent,
    department_code,
    destination_code,
    start_landmark,
    confidence,
  }
}

export function unknownIntent(): VoiceIntent {
  return {
    intent: "unknown",
    department_code: null,
    destination_code: null,
    start_landmark: null,
    confidence: 0,
  }
}

const INTENT_SYSTEM = `You classify patient questions for a fictional hospital outpatient demo app.
Questions may be in English, Hindi, Punjabi, Urdu, Bengali, Marathi, Tamil, Telugu, or Gujarati — including native scripts. Classify the meaning, not the language.

Return ONLY a JSON object with keys:
intent, department_code, destination_code, start_landmark, confidence.

intent must be one of:
current_token, wait_estimate, department_info, accessible_route, emergency, app_help, registration_help, unknown

Use app_help when the patient asks how SehatFlow or this demo hospital app works.
Use registration_help when they ask how to register, get a token, create a slip, or enroll.
Use accessible_route for directions, facilities (washroom, water, lab, pharmacy), or department locations — even if destination_code is unclear.
Use wait_estimate for how long until turn or people ahead.
Use current_token for token number or queue status.

department_code must be one of these or null:
general_medicine, pediatrics, womens_health, orthopedics, ent, ophthalmology, dermatology, cardiology, dental, physiotherapy

destination_code must be a department_code above, or one of these graph ids, or null:
laboratory, pharmacy, billing, radiology, washroom_g, water_station, registration, entrance, waiting_area, help_desk, lift_g, ramp_g

start_landmark must be one of these graph ids or null:
entrance, opd_entrance, registration, opd_reception, waiting_area, help_desk, lift_g, ramp_g, water_station, washroom_g, pharmacy, laboratory

confidence is a number from 0 to 1.
Do not invent rooms, medical advice, diagnoses, or hospital policies.
If unsure of the place but the patient clearly wants directions, still use accessible_route with null destination_code.
If unsure of the whole request, use intent "unknown" with null codes.
Never include personal data, tokens, or access codes in the JSON.`

/** Keep in sync with src/domain/voice/providerPayload.ts (Deno cannot import Vite src). */
export function intentChatBody(transcript: string, language: UiLanguage) {
  return {
    // Lowest-cost Sarvam chat model; short max_tokens for JSON intent only.
    model: "mimo-v2.6-flash",
    temperature: 0,
    max_tokens: 96,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: INTENT_SYSTEM },
      {
        role: "user",
        content: `lang=${language}\n${transcript.slice(0, 280)}`,
      },
    ],
  }
}

export type SarvamFailureKind =
  | "auth"
  | "rate"
  | "timeout"
  | "upstream"
  | "bad_response"

export type SarvamCallResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: SarvamFailureKind }

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = SARVAM_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export function mapSarvamHttpError(status: number): SarvamFailureKind {
  if (status === 401 || status === 403) {
    return "auth"
  }
  if (status === 429) {
    return "rate"
  }
  return "upstream"
}

export async function sarvamTranscribe(input: {
  apiKey: string
  audio: Blob
  filename: string
  language: UiLanguage
}): Promise<SarvamCallResult<{ transcript: string }>> {
  const form = new FormData()
  form.append("file", input.audio, input.filename)
  form.append("model", "saaras:v4")
  form.append("language_code", STT_CODES[input.language])

  let response: Response
  try {
    response = await fetchWithTimeout(SARVAM_STT_URL, {
      method: "POST",
      headers: { "api-subscription-key": input.apiKey },
      body: form,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, kind: "timeout" }
    }
    return { ok: false, kind: "upstream" }
  }

  if (!response.ok) {
    return { ok: false, kind: mapSarvamHttpError(response.status) }
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    return { ok: false, kind: "bad_response" }
  }
  const transcript =
    json &&
    typeof json === "object" &&
    typeof (json as { transcript?: unknown }).transcript === "string"
      ? (json as { transcript: string }).transcript.trim()
      : ""
  if (!transcript) {
    return { ok: false, kind: "bad_response" }
  }
  return { ok: true, data: { transcript } }
}

export async function sarvamClassifyIntent(input: {
  apiKey: string
  transcript: string
  language: UiLanguage
}): Promise<SarvamCallResult<VoiceIntent>> {
  let response: Response
  try {
    response = await fetchWithTimeout(SARVAM_CHAT_URL, {
      method: "POST",
      headers: {
        "api-subscription-key": input.apiKey,
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(intentChatBody(input.transcript, input.language)),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, kind: "timeout" }
    }
    return { ok: false, kind: "upstream" }
  }

  if (!response.ok) {
    return { ok: false, kind: mapSarvamHttpError(response.status) }
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    return { ok: false, kind: "bad_response" }
  }

  const content =
    json &&
    typeof json === "object" &&
    Array.isArray((json as { choices?: unknown }).choices)
      ? (
          (json as { choices: Array<{ message?: { content?: unknown } }> })
            .choices[0]?.message?.content
        )
      : null

  if (typeof content !== "string") {
    return { ok: false, kind: "bad_response" }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { ok: false, kind: "bad_response" }
  }

  const intent = parseVoiceIntent(parsed)
  if (!intent) {
    return { ok: true, data: unknownIntent() }
  }
  return { ok: true, data: intent }
}

export async function sarvamSynthesize(input: {
  apiKey: string
  text: string
  language: UiLanguage
}): Promise<SarvamCallResult<{ audioBase64: string; mime: string }>> {
  const languageCode = TTS_CODES[input.language]
  if (!languageCode) {
    return { ok: false, kind: "bad_response" }
  }
  const text = input.text.trim().slice(0, MAX_TTS_CHARS)
  if (!text) {
    return { ok: false, kind: "bad_response" }
  }

  let response: Response
  try {
    response = await fetchWithTimeout(SARVAM_TTS_URL, {
      method: "POST",
      headers: {
        "api-subscription-key": input.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        language_code: languageCode,
        model: "bulbul:v3",
        speaker: "shubh",
        pace: 1,
        speech_sample_rate: 22050,
        output_audio_codec: "mp3",
      }),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, kind: "timeout" }
    }
    return { ok: false, kind: "upstream" }
  }

  if (!response.ok) {
    return { ok: false, kind: mapSarvamHttpError(response.status) }
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    return { ok: false, kind: "bad_response" }
  }

  const audios =
    json && typeof json === "object"
      ? (json as { audios?: unknown }).audios
      : null
  if (!Array.isArray(audios) || typeof audios[0] !== "string" || !audios[0]) {
    return { ok: false, kind: "bad_response" }
  }

  return {
    ok: true,
    data: { audioBase64: audios[0], mime: "audio/mpeg" },
  }
}

export function publicErrorMessage(
  kind: SarvamFailureKind | "missing_key" | "bad_audio" | "too_large",
): string {
  switch (kind) {
    case "missing_key":
      return "voice_service_unavailable"
    case "auth":
      return "voice_service_unavailable"
    case "rate":
      return "voice_rate_limited"
    case "timeout":
      return "voice_timeout"
    case "bad_audio":
      return "voice_bad_audio"
    case "too_large":
      return "voice_too_long"
    case "bad_response":
      return "voice_no_speech"
    default:
      return "voice_service_error"
  }
}
