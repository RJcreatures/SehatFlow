/** Client-side mirrors of Edge Function audio guards. */
export const MAX_VOICE_AUDIO_BYTES = 1_500_000
export const MAX_VOICE_DURATION_MS = 15_000

const ALLOWED_BASE = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/flac",
])

export function isAllowedVoiceMime(mime: string): boolean {
  const normalized = mime.trim().toLowerCase()
  if (!normalized) {
    return false
  }
  if (ALLOWED_BASE.has(normalized)) {
    return true
  }
  const base = normalized.split(";")[0]!.trim()
  return ALLOWED_BASE.has(base)
}

export function validateVoiceRecording(input: {
  byteLength: number
  durationMs: number
  mime: string
}): "ok" | "voice_bad_audio" | "voice_too_long" {
  if (input.byteLength <= 0 || !isAllowedVoiceMime(input.mime)) {
    return "voice_bad_audio"
  }
  if (
    input.byteLength > MAX_VOICE_AUDIO_BYTES ||
    input.durationMs > MAX_VOICE_DURATION_MS
  ) {
    return "voice_too_long"
  }
  return "ok"
}
