import {
  LANDMARK_CATALOG,
  routableDestinationIds,
  routableStartIds,
} from "./landmarkCatalog.ts"
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
export const SELECTABLE_START_LANDMARKS = routableStartIds()

const ALIAS_BY_ID: Record<string, readonly string[]> = Object.fromEntries(
  LANDMARK_CATALOG.map((entry) => [entry.id, entry.aliases]),
)

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
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "u").test(haystack)
}

function scoreAliases(normalized: string, aliases: readonly string[]): {
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
 * Deterministic landmark matcher — returns only IDs that exist in the graph.
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
    const aliases = ALIAS_BY_ID[id] ?? [id.replaceAll("_", " ")]
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

/**
 * Match a To destination: clinical departments and shared landmarks.
 * Never silently picks an unrelated place — ambiguous matches stay as suggestions.
 */
export function matchDestinationText(
  text: string,
  destinationIds: readonly string[] = routableDestinationIds(),
): LocationMatchResult {
  const normalized = normalizeMatchText(text)
  if (!normalized) {
    return { status: "none" }
  }

  const allowed = new Set(destinationIds)
  const candidates: LocationMatchCandidate[] = []
  for (const entry of LANDMARK_CATALOG) {
    if (!allowed.has(entry.id) || !hospitalGraph.nodes[entry.id]) {
      continue
    }
    const { score, hit } = scoreAliases(normalized, entry.aliases)
    if (score >= 30) {
      const dept = hospitalGraph.nodes[entry.id]?.departmentCode
      candidates.push({
        id: entry.id,
        kind: dept ? "department" : "landmark",
        code: dept ?? entry.id,
        score,
        aliasesHit: hit,
      })
    }
  }

  return finalizeCandidates(candidates)
}

/** @deprecated Prefer matchDestinationText for To-field search. */
export function matchDepartmentText(
  text: string,
  activeCodes: readonly string[],
): LocationMatchResult {
  const ids = activeCodes
    .map((code) => {
      const node = Object.values(hospitalGraph.nodes).find(
        (item) => item.departmentCode === code,
      )
      return node?.id
    })
    .filter((id): id is string => Boolean(id))
  return matchDestinationText(text, ids)
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
  if (close.length === 1 && top.score >= 55) {
    return { status: "exact", candidate: top }
  }
  return {
    status: "suggestions",
    candidates: close.slice(0, 4),
  }
}
