import type { RegistrationDraft } from "./types.ts"
import {
  createRegistrationDraft,
  mergeRegistrationDraft,
} from "./registrationDraft.ts"

/** Codes that match configured hospital departments (see departmentFacts / intents). */
export const CONFIGURED_DEPARTMENT_CODES = [
  "general_medicine",
  "pediatrics",
  "womens_health",
  "orthopedics",
  "ent",
  "ophthalmology",
  "dermatology",
] as const

const DEPT_ALIASES: Record<string, (typeof CONFIGURED_DEPARTMENT_CODES)[number]> =
  {
    "general medicine": "general_medicine",
    medicine: "general_medicine",
    opd: "general_medicine",
    pediatrics: "pediatrics",
    paediatric: "pediatrics",
    children: "pediatrics",
    "women's health": "womens_health",
    womens: "womens_health",
    gynecology: "womens_health",
    gynaecology: "womens_health",
    orthopedics: "orthopedics",
    orthopaedics: "orthopedics",
    bone: "orthopedics",
    ent: "ent",
    ear: "ent",
    eye: "ophthalmology",
    ophthalmology: "ophthalmology",
    dermatology: "dermatology",
    skin: "dermatology",
  }

const SPOKEN_ONES: Record<string, number> = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
}

const SPOKEN_TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

/**
 * Resolve a department mention against configured departments only.
 * Uses word boundaries so "ear" does not match inside "years".
 */
export function resolveDepartmentCode(text: string): string | null {
  const lower = text.toLowerCase().trim()
  for (const code of CONFIGURED_DEPARTMENT_CODES) {
    const spaced = code.replaceAll("_", " ")
    const codeRe = new RegExp(`\\b${escapeRegExp(spaced)}\\b`, "i")
    const rawRe = new RegExp(`\\b${escapeRegExp(code)}\\b`, "i")
    if (codeRe.test(lower) || rawRe.test(lower)) {
      return code
    }
  }
  for (const [alias, code] of Object.entries(DEPT_ALIASES)) {
    const aliasRe = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i")
    if (aliasRe.test(lower)) {
      return code
    }
  }
  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function parseSpokenAge(text: string): number | null {
  const lower = text.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim()
  if (SPOKEN_ONES[lower] != null) {
    return SPOKEN_ONES[lower]!
  }
  if (SPOKEN_TENS[lower] != null) {
    return SPOKEN_TENS[lower]!
  }
  const compound = lower.match(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+|-)?(one|two|three|four|five|six|seven|eight|nine)?\b/,
  )
  if (compound) {
    const tens = SPOKEN_TENS[compound[1]!] ?? 0
    const ones = compound[2] ? (SPOKEN_ONES[compound[2]] ?? 0) : 0
    const n = tens + ones
    if (n >= 0 && n <= 120) {
      return n
    }
  }
  for (const [word, value] of Object.entries(SPOKEN_ONES)) {
    if (value >= 10 && new RegExp(`\\b${word}\\b`).test(lower)) {
      return value
    }
  }
  return null
}

export function extractAge(text: string): number | null {
  const years = text.match(
    /\b(?:i(?:'m| am)|age(?:\s+is)?|aged?)\s*(\d{1,3})\b/i,
  )
  if (years) {
    const n = Number(years[1])
    if (Number.isInteger(n) && n >= 0 && n <= 120) {
      return n
    }
  }
  const bare = text.match(/\b(\d{1,3})\s*(?:years?\s*old|yrs?\.?|years?)?\b/i)
  if (bare && /^\s*\d{1,3}(\s*(years?\s*old|yrs?\.?|years?))?\s*$/i.test(text.trim())) {
    const n = Number(bare[1])
    if (Number.isInteger(n) && n >= 0 && n <= 120) {
      return n
    }
  }
  const labeledSpoken = text.match(
    /\b(?:i(?:'m| am)|age(?:\s+is)?|aged?)\s+([a-z\s-]{3,40})\b/i,
  )
  if (labeledSpoken?.[1]) {
    const spoken = parseSpokenAge(labeledSpoken[1])
    if (spoken != null) {
      return spoken
    }
  }
  if (/^\s*\d{1,3}\s*$/.test(text.trim())) {
    const n = Number(text.trim())
    if (n >= 0 && n <= 120) {
      return n
    }
  }
  const onlySpoken = parseSpokenAge(text)
  if (
    onlySpoken != null &&
    /^\s*[a-z\s-]{3,40}\s*$/i.test(text.trim()) &&
    !/\b(?:my name is|call me|register|department)\b/i.test(text)
  ) {
    return onlySpoken
  }
  const yearsOldSpoken = text.match(
    /\b([a-z\s-]{3,30})\s+years?\s*old\b/i,
  )
  if (yearsOldSpoken?.[1]) {
    return parseSpokenAge(yearsOldSpoken[1])
  }
  return null
}

function looksLikeAgeUtterance(text: string): boolean {
  return (
    extractAge(text) != null ||
    /^\s*\d{1,3}\s*$/.test(text.trim()) ||
    /\b(?:age|years?\s*old|yrs?\.?)\b/i.test(text)
  )
}

/**
 * Extract an explicit name only when the patient supplies it clearly.
 * Does not invent names from conversation fluff or age answers.
 */
export function extractDisplayName(text: string): string | null {
  if (looksLikeAgeUtterance(text) && !/\b(?:my name is|call me|name(?:\s+is)?)\b/i.test(text)) {
    return null
  }
  const patterns = [
    /\b(?:my name is|i am|i'm|name(?:\s+is)?)\s+([A-Za-z][A-Za-z.\s'-]{1,60})/i,
    /\b(?:call me)\s+([A-Za-z][A-Za-z.\s'-]{1,40})/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match?.[1]) {
      continue
    }
    // "I am 45" / "I am forty five" are ages, not names.
    if (extractAge(text) != null && !/\b(?:my name is|call me|name(?:\s+is)?)\b/i.test(text)) {
      return null
    }
    const name = match[1]
      .replace(/\b(?:and|for|from|years?|old|aged?).*$/i, "")
      .trim()
      .replace(/\s+/g, " ")
    if (
      name.length >= 2 &&
      name.length <= 80 &&
      !/\d/.test(name) &&
      parseSpokenAge(name) == null
    ) {
      return name
    }
  }
  const trimmed = text.trim()
  if (
    /^[A-Za-z][A-Za-z.\s'-]{1,40}$/.test(trimmed) &&
    trimmed.split(/\s+/).length <= 4 &&
    !/\b(?:yes|no|ok|please|token|register|help|age)\b/i.test(trimmed) &&
    parseSpokenAge(trimmed) == null
  ) {
    return trimmed.replace(/\s+/g, " ")
  }
  return null
}

export function extractGender(
  text: string,
): RegistrationDraft["gender"] | undefined {
  const lower = text.toLowerCase()
  if (/\b(female|woman|girl)\b/.test(lower)) {
    return "female"
  }
  if (/\b(male|man|boy)\b/.test(lower)) {
    return "male"
  }
  if (/\b(other|non[- ]?binary)\b/.test(lower)) {
    return "other"
  }
  if (/\b(prefer not|undisclosed|skip gender)\b/.test(lower)) {
    return "undisclosed"
  }
  return undefined
}

export function applyUtteranceToDraft(
  draft: RegistrationDraft | null,
  utterance: string,
  options?: { awaitingField?: "need_name" | "need_age" | "need_department" | null },
): RegistrationDraft {
  const base = draft ?? createRegistrationDraft()
  const patch: Partial<Omit<RegistrationDraft, "idempotency_key">> = {}
  const awaiting = options?.awaitingField ?? null

  // While collecting age, never reinterpret the reply as a department or name.
  if (awaiting !== "need_age") {
    const dept = resolveDepartmentCode(utterance)
    if (dept) {
      patch.department_code = dept
    }
  }

  if (awaiting !== "need_age") {
    const name = extractDisplayName(utterance)
    if (name) {
      patch.display_name = name
    }
  }

  const age = extractAge(utterance)
  if (age != null) {
    patch.age = age
  } else if (awaiting === "need_age" && /^\s*\d{1,3}\s*$/.test(utterance)) {
    const n = Number(utterance.trim())
    if (n >= 0 && n <= 120) {
      patch.age = n
    }
  }

  const gender = extractGender(utterance)
  if (gender !== undefined) {
    patch.gender = gender
  }

  return mergeRegistrationDraft(base, patch)
}
