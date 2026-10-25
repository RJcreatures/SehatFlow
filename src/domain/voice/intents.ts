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

/** Destinations Sarvam / planner may return (graph ids or department codes). */
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

export function isVoiceIntentName(value: unknown): value is VoiceIntentName {
  return (
    typeof value === "string" &&
    (VOICE_INTENTS as readonly string[]).includes(value)
  )
}

function normalizeDestination(value: string): string | null {
  const code = value.trim().toLowerCase().replace(/\s+/g, "_")
  const aliased = DESTINATION_ALIASES[code] ?? code
  if (DESTINATION_CODES.has(aliased) || LANDMARKS.has(aliased)) {
    return aliased
  }
  if (DEPARTMENT_CODES.has(aliased)) {
    return aliased
  }
  return null
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
    destination_code = normalizeDestination(record.destination_code)
  }

  let start_landmark: string | null = null
  if (typeof record.start_landmark === "string") {
    const landmark = record.start_landmark.trim().toLowerCase()
    start_landmark = LANDMARKS.has(landmark)
      ? landmark
      : normalizeDestination(landmark)
  }

  // Keep high-level intents even when codes are missing — the deterministic
  // planner resolves destinations from the utterance (including Hindi aliases).
  if (record.intent === "department_info" && !department_code) {
    return {
      intent: "department_info",
      department_code: null,
      destination_code: null,
      start_landmark: null,
      confidence,
    }
  }
  if (record.intent === "accessible_route") {
    return {
      intent: "accessible_route",
      department_code,
      destination_code,
      start_landmark,
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
    "आपातकाल",
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
