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
])

const LANDMARKS = new Set([
  "entrance",
  "reception",
  "help_desk",
  "lift_g",
  "ramp_g",
  "water_station",
])

export function isVoiceIntentName(value: unknown): value is VoiceIntentName {
  return (
    typeof value === "string" &&
    (VOICE_INTENTS as readonly string[]).includes(value)
  )
}

export function parseVoiceIntent(raw: unknown): VoiceIntent | null {
  if (!raw || typeof raw !== "object") {
    return null
  }
  const record = raw as Record<string, unknown>
  if (!isVoiceIntentName(record.intent)) {
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
    const code = record.destination_code.trim().toLowerCase()
    destination_code = DEPARTMENT_CODES.has(code) ? code : null
  }

  let start_landmark: string | null = null
  if (typeof record.start_landmark === "string") {
    const landmark = record.start_landmark.trim().toLowerCase()
    start_landmark = LANDMARKS.has(landmark) ? landmark : null
  }

  if (record.intent === "department_info" && !department_code) {
    return {
      intent: "unknown",
      department_code: null,
      destination_code: null,
      start_landmark: null,
      confidence,
    }
  }
  if (record.intent === "accessible_route" && !destination_code) {
    return {
      intent: "unknown",
      department_code: null,
      destination_code: null,
      start_landmark: null,
      confidence,
    }
  }

  return {
    intent: record.intent,
    department_code,
    destination_code,
    start_landmark,
    confidence,
  }
}

/** Offline/emergency keyword hint — never depends on Sarvam. */
export function transcriptSuggestsEmergency(transcript: string): boolean {
  const text = transcript.toLowerCase()
  const needles = [
    "emergency",
    "ambulance",
    "112",
    "108",
    "chest pain",
    "not breathing",
    "इमरजेंसी",
    "एम्बुलेंस",
    "ਐਮਰਜੈਂਸੀ",
    "ایمرجنسی",
    "জরুরি",
    "आपत्कालीन",
    "அவசர",
    "అత్యవసర",
    "ઇમરજન્સી",
  ]
  return needles.some((needle) => text.includes(needle.toLowerCase()))
}
