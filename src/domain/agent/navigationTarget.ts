import type { SavedSlip } from "../../lib/slipStorage.ts"
import {
  departmentDestinationId,
  hospitalGraph,
} from "../navigation/hospitalGraph.ts"
import {
  LANDMARK_CATALOG,
  routableDestinationIds,
  routableStartIds,
} from "../navigation/landmarkCatalog.ts"
import {
  matchDestinationText,
  matchLandmarkText,
} from "../navigation/locationMatch.ts"
import { resolveDepartmentCode } from "./extract.ts"

/** Prefer an explicit "to X" / "where is X" span when the full utterance is noisy. */
function destinationFocusText(utterance: string): string {
  const toMatch = utterance.match(
    /\b(?:to|towards?|for)\s+([a-zA-Z][a-zA-Z\s']{1,40}?)(?:\s+from\b|[?.!]|$)/i,
  )
  if (toMatch?.[1]) {
    return toMatch[1].trim()
  }
  const whereFrom = utterance.match(
    /\bwhere(?:\s+is|\s*'s)?\s+(?:the\s+)?(.+?)\s+from\b/i,
  )
  if (whereFrom?.[1]) {
    return whereFrom[1].trim()
  }
  const whereMatch = utterance.match(
    /\bwhere(?:\s+is|\s*'s)?\s+(?:the\s+)?([a-zA-Z][a-zA-Z\s']{1,40}?)(?:\s*[?,!]|$)/i,
  )
  if (whereMatch?.[1]) {
    return whereMatch[1].trim()
  }
  return utterance
}

/** Graph node id for routing (department room or shared landmark). */
export function resolveDestinationNodeId(
  hint: string | null | undefined,
  utterance = "",
): string | null {
  const focused = destinationFocusText(utterance)
  const candidates = [hint, focused, utterance].filter(
    (value): value is string => Boolean(value && value.trim()),
  )
  if (candidates.length === 0) {
    return null
  }

  for (const text of candidates) {
    if (utteranceMentionsFacility(text) || text === focused) {
      const facilityMatch = matchDestinationText(text, routableDestinationIds())
      if (facilityMatch.status === "exact") {
        return facilityMatch.candidate.id
      }
      if (facilityMatch.status === "suggestions") {
        const clinical = facilityMatch.candidates.find(
          (item) => item.kind === "department",
        )
        if (clinical && text === focused) {
          return clinical.id
        }
      }
    }

    const dept = resolveDepartmentCode(text)
    if (dept) {
      const node = departmentDestinationId(dept)
      if (node) {
        return node
      }
    }

    const destMatch = matchDestinationText(text, routableDestinationIds())
    if (destMatch.status === "exact") {
      return destMatch.candidate.id
    }
  }

  if (hint && hospitalGraph.nodes[hint]) {
    return hint
  }

  return null
}

/**
 * Resolve a start landmark. Pass fallback="" to avoid assuming entrance when
 * the patient has not named a starting place.
 */
export function resolveStartNodeId(
  utterance: string,
  hint: string | null | undefined,
  fallback = "entrance",
): string {
  if (hint && hospitalGraph.nodes[hint]) {
    return hint
  }
  const fromTo = utterance.match(/\bfrom\s+(.+?)\s+to\s+/i)
  const fromOnly = utterance.match(
    /\bfrom\s+([a-zA-Z][a-zA-Z\s']{1,40}?)(?:\s*[?.!]|$)/i,
  )
  const atOnly = utterance.match(
    /\b(?:i am|i'm|starting|start)(?:\s+at|\s+from)?\s+([a-zA-Z][a-zA-Z\s']{1,40}?)(?:\s*[?.!]|$)/i,
  )
  const fromText =
    fromTo?.[1]?.trim() ??
    fromOnly?.[1]?.trim() ??
    atOnly?.[1]?.trim() ??
    (typeof hint === "string" && hint.trim() && !hospitalGraph.nodes[hint]
      ? hint.trim()
      : null)
  if (fromText) {
    const startMatch = matchLandmarkText(fromText, routableStartIds())
    if (startMatch.status === "exact") {
      return startMatch.candidate.id
    }
  }
  if (/\bfrom\b/i.test(utterance) || /\b(?:i am|i'm) (?:at|near)\b/i.test(utterance)) {
    const startMatch = matchLandmarkText(utterance, routableStartIds())
    if (startMatch.status === "exact") {
      return startMatch.candidate.id
    }
  }
  if (fallback && hospitalGraph.nodes[fallback]) {
    return fallback
  }
  return ""
}

/**
 * Resolve a short landmark-only reply used while clarifying start
 * ("registration", "pharmacy"). Never call this on full directions questions.
 */
export function resolveStartReply(utterance: string): string | null {
  const trimmed = utterance.trim()
  if (!trimmed || trimmed.length > 48) {
    return null
  }
  if (
    /\b(where is|directions?|how (?:do i|to)|from .+ to|check my|register|token)\b/i.test(
      trimmed,
    )
  ) {
    return null
  }
  const replyMatch = matchLandmarkText(trimmed, routableStartIds())
  if (replyMatch.status === "exact") {
    return replyMatch.candidate.id
  }
  if (/\b(entrance|main (?:gate|door|entry))\b/i.test(trimmed)) {
    return "entrance"
  }
  return null
}

/** Map a verified slip's department to a routable graph node. */
export function resolveSlipDepartmentNodeId(
  slip: Pick<SavedSlip, "department_code" | "department_name_en" | "token_code">,
): string | null {
  const byCode = departmentDestinationId(slip.department_code)
  if (byCode) {
    return byCode
  }
  const marker = slip.token_code.split("-")[0]?.toUpperCase()
  if (marker) {
    const byMarker = LANDMARK_CATALOG.find(
      (entry) => entry.marker?.toUpperCase() === marker && entry.asDestination,
    )
    if (byMarker && hospitalGraph.nodes[byMarker.id]) {
      return byMarker.id
    }
  }
  return resolveDestinationNodeId(null, slip.department_name_en)
}

export function extractRouteEnds(utterance: string): {
  fromText: string | null
  toText: string | null
} {
  const match = utterance.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?:[?.!]|$)/i)
  if (!match) {
    return { fromText: null, toText: null }
  }
  return {
    fromText: match[1]?.trim() ?? null,
    toText: match[2]?.trim() ?? null,
  }
}

export function utteranceMentionsFacility(text: string): boolean {
  return /\b(washroom|toilet|restroom|bathroom|water|pharmacy|laboratory|lab|radiology|billing|cardiology|heart)\b/i.test(
    text,
  )
}

export function utteranceWantsCompoundWaitAndDirections(text: string): boolean {
  const lower = text.toLowerCase()
  const wait =
    /\b(how long|how much longer|wait|my turn|queue|minutes?\s*(left|remaining))\b/.test(
      lower,
    )
  const directions =
    /\b(where|directions?|how (?:do i|to) (?:get|go)|which way)\b/.test(lower)
  return wait && directions && /\b(and|also|then|after)\b/.test(lower)
}
