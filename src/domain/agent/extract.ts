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

/**
 * Resolve a department mention against configured departments only.
 * Never invents a department code.
 */
export function resolveDepartmentCode(text: string): string | null {
  const lower = text.toLowerCase().trim()
  for (const code of CONFIGURED_DEPARTMENT_CODES) {
    const spaced = code.replaceAll("_", " ")
    if (lower.includes(spaced) || lower.includes(code)) {
      return code
    }
  }
  for (const [alias, code] of Object.entries(DEPT_ALIASES)) {
    if (lower.includes(alias)) {
      return code
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
  const bare = text.match(/\b(\d{1,3})\s*(?:years?\s*old|yrs?\.?)\b/i)
  if (bare) {
    const n = Number(bare[1])
    if (Number.isInteger(n) && n >= 0 && n <= 120) {
      return n
    }
  }
  return null
}

/**
 * Extract an explicit name only when the patient supplies it clearly.
 * Does not invent names from conversation fluff.
 */
export function extractDisplayName(text: string): string | null {
  const patterns = [
    /\b(?:my name is|i am|i'm|name(?:\s+is)?)\s+([A-Za-z][A-Za-z.\s'-]{1,60})/i,
    /\b(?:call me)\s+([A-Za-z][A-Za-z.\s'-]{1,40})/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match?.[1]) {
      continue
    }
    const name = match[1]
      .replace(/\b(?:and|for|from|years?|old|aged?).*$/i, "")
      .trim()
      .replace(/\s+/g, " ")
    if (name.length >= 2 && name.length <= 80 && !/\d/.test(name)) {
      return name
    }
  }
  const trimmed = text.trim()
  if (
    /^[A-Za-z][A-Za-z.\s'-]{1,40}$/.test(trimmed) &&
    trimmed.split(/\s+/).length <= 4 &&
    !/\b(?:yes|no|ok|please|token|register|help)\b/i.test(trimmed)
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
): RegistrationDraft {
  const base = draft ?? createRegistrationDraft()
  const patch: Partial<Omit<RegistrationDraft, "idempotency_key">> = {}
  const dept = resolveDepartmentCode(utterance)
  if (dept) {
    patch.department_code = dept
  }
  const name = extractDisplayName(utterance)
  if (name) {
    patch.display_name = name
  }
  const age = extractAge(utterance)
  if (age != null) {
    patch.age = age
  }
  const gender = extractGender(utterance)
  if (gender !== undefined) {
    patch.gender = gender
  }
  if (age == null && /^\s*\d{1,3}\s*$/.test(utterance)) {
    const n = Number(utterance.trim())
    if (n >= 0 && n <= 120) {
      patch.age = n
    }
  }
  return mergeRegistrationDraft(base, patch)
}
