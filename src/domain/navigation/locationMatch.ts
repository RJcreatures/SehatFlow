import { hospitalGraph } from "./hospitalGraph.ts"

export type MatchKind = "landmark" | "department"

export type LocationMatchCandidate = {
  id: string
  kind: MatchKind
  /** Department code when kind is department; otherwise landmark node id. */
  code: string
  score: number
  aliasesHit: string[]
}

export type LocationMatchResult =
  | { status: "exact"; candidate: LocationMatchCandidate }
  | { status: "suggestions"; candidates: LocationMatchCandidate[] }
  | { status: "none" }

/** Known landmark pickers shown on /find (must exist in the graph). */
export const SELECTABLE_START_LANDMARKS = [
  "entrance",
  "reception",
  "help_desk",
  "lift_g",
  "ramp_g",
  "water_station",
] as const

const LANDMARK_ALIASES: Record<string, string[]> = {
  entrance: [
    "entrance",
    "main entrance",
    "gate",
    "front door",
    "entry",
    "प्रवेश",
    "मुख्य द्वार",
    "गेट",
  ],
  reception: [
    "reception",
    "registration",
    "counter",
    "desk",
    "रिसेप्शन",
    "पंजीकरण",
    "काउंटर",
  ],
  help_desk: [
    "help desk",
    "helpdesk",
    "information",
    "info desk",
    "हेल्प डेस्क",
    "जानकारी",
  ],
  lift_g: ["lift", "elevator", "लिफ्ट", "elevator near entrance"],
  ramp_g: ["ramp", "accessible ramp", "रैंप", "wheelchair ramp"],
  water_station: [
    "water",
    "water station",
    "drinking water",
    "cooler",
    "पानी",
    "पानी का स्थान",
  ],
  stairs_g: ["stairs", "staircase", "सीढ़ी", "सीढ़ियाँ"],
  corridor_g_main: ["main corridor", "central corridor", "गलियारा", "मुख्य गलियारा"],
  corridor_g_clinic: ["clinic wing", "clinic corridor", "क्लिनिक"],
  corridor_f_main: ["first floor corridor", "पहली मंज़िल गलियारा"],
}

const DEPARTMENT_ALIASES: Record<string, string[]> = {
  general_medicine: [
    "general medicine",
    "medicine",
    "gm",
    "doctor",
    "opd",
    "सामान्य चिकित्सा",
    "मेडिसिन",
  ],
  pediatrics: [
    "pediatrics",
    "paediatrics",
    "children",
    "child",
    "kids",
    "बाल",
    "बच्चे",
  ],
  womens_health: [
    "women",
    "women's health",
    "womens health",
    "gynae",
    "gynecology",
    "महिला",
    "स्त्री",
  ],
  orthopedics: [
    "orthopedics",
    "orthopaedics",
    "bones",
    "joints",
    "fracture",
    "हड्डी",
    "जोड़",
  ],
  ent: ["ent", "ear", "nose", "throat", "कान", "नाक", "गला"],
  ophthalmology: [
    "eye",
    "eyes",
    "ophthalmology",
    "vision",
    "नेत्र",
    "आँख",
    "आंख",
  ],
  dermatology: [
    "skin",
    "dermatology",
    "rash",
    "skin problems",
    "त्वचा",
    "चमड़ी",
  ],
}

export function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function hasWholeToken(haystack: string, needle: string): boolean {
  if (!needle) {
    return false
  }
  if (haystack === needle) {
    return true
  }
  // Prefer whole-token matches so short aliases like "ent" do not hit inside
  // "department", and "ear" does not hit inside longer words.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "u").test(haystack)
}

function scoreAliases(normalized: string, aliases: string[]): {
  score: number
  hit: string[]
} {
  const hit: string[] = []
  let score = 0
  for (const alias of aliases) {
    const needle = normalizeMatchText(alias)
    if (!needle) {
      continue
    }
    if (normalized === needle) {
      score = Math.max(score, 100)
      hit.push(alias)
      continue
    }
    if (hasWholeToken(normalized, needle)) {
      score = Math.max(score, 70 + Math.min(20, needle.length))
      hit.push(alias)
      continue
    }
    // Longer phrases may still match when the user typed a shorter form.
    if (needle.length >= 6 && hasWholeToken(needle, normalized)) {
      score = Math.max(score, 65)
      hit.push(alias)
      continue
    }
    const parts = needle.split(" ").filter((part) => part.length >= 3)
    if (parts.length === 0) {
      continue
    }
    const matched = parts.filter((part) => hasWholeToken(normalized, part))
    if (matched.length > 0 && matched.length === parts.length) {
      score = Math.max(score, 55)
      hit.push(alias)
    } else if (matched.length > 0 && matched.some((part) => part.length >= 4)) {
      score = Math.max(score, 30 + matched.length * 5)
      hit.push(alias)
    }
  }
  return { score, hit }
}

/**
 * Deterministic landmark/destination matcher.
 * Not an AI model — returns only IDs that exist in the configured graph/department list.
 */
export function matchLandmarkText(
  text: string,
  landmarkIds: readonly string[] = SELECTABLE_START_LANDMARKS,
): LocationMatchResult {
  const normalized = normalizeMatchText(text)
  if (!normalized) {
    return { status: "none" }
  }

  const candidates: LocationMatchCandidate[] = []
  for (const id of landmarkIds) {
    if (!hospitalGraph.nodes[id]) {
      continue
    }
    const aliases = LANDMARK_ALIASES[id] ?? [id.replaceAll("_", " ")]
    const { score, hit } = scoreAliases(normalized, aliases)
    if (score >= 30) {
      candidates.push({
        id,
        kind: "landmark",
        code: id,
        score,
        aliasesHit: hit,
      })
    }
  }

  return finalizeCandidates(candidates)
}

export function matchDepartmentText(
  text: string,
  activeCodes: readonly string[],
): LocationMatchResult {
  const normalized = normalizeMatchText(text)
  if (!normalized) {
    return { status: "none" }
  }

  const allowed = new Set(activeCodes)
  const candidates: LocationMatchCandidate[] = []
  for (const [code, aliases] of Object.entries(DEPARTMENT_ALIASES)) {
    if (!allowed.has(code)) {
      continue
    }
    const { score, hit } = scoreAliases(normalized, aliases)
    if (score >= 30) {
      candidates.push({
        id: `dept_${code}`,
        kind: "department",
        code,
        score,
        aliasesHit: hit,
      })
    }
  }

  return finalizeCandidates(candidates)
}

function finalizeCandidates(
  candidates: LocationMatchCandidate[],
): LocationMatchResult {
  const ranked = [...candidates].sort((a, b) => b.score - a.score)
  if (ranked.length === 0) {
    return { status: "none" }
  }
  const top = ranked[0]!
  const close = ranked.filter((item) => item.score >= top.score - 15)
  // A single clear winner is enough to auto-select; the UI still shows the
  // confirmed landmark before routing. Ambiguous ties still need confirmation.
  if (close.length === 1 && top.score >= 55) {
    return { status: "exact", candidate: top }
  }
  return {
    status: "suggestions",
    candidates: close.slice(0, 4),
  }
}
