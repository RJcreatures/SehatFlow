import type { VoiceIntent } from "../voice/intents.ts"
import type { ConversationMemory } from "./conversationContext.ts"
import {
  utteranceSuggestsAppHelp,
  utteranceSuggestsDepartmentsList,
  utteranceSuggestsDirections,
  utteranceSuggestsEmergency,
  utteranceSuggestsFacility,
  utteranceSuggestsFollowupDirections,
  utteranceSuggestsHelpRequest,
  utteranceSuggestsQueue,
  utteranceSuggestsRegister,
  utteranceSuggestsRepeat,
  utteranceSuggestsRetrieveSlip,
} from "./localePhrases.ts"
import {
  extractTokenCredentials,
  utteranceWantsTokenLookup,
} from "./tokenLookup.ts"
import type { OpenDestination } from "./types.ts"

/**
 * High-level patient goals. Precedence is enforced in classifyAgentGoal —
 * token lookup must never win over directions, registration, or emergency.
 */
export type AgentGoal =
  | { goal: "emergency" }
  | { goal: "repeat" }
  | { goal: "followup_directions" }
  | { goal: "directions" }
  | { goal: "register" }
  | { goal: "retrieve_slip" }
  | { goal: "queue_status" }
  | { goal: "token_credentials" }
  | { goal: "list_departments" }
  | { goal: "help_request" }
  | { goal: "app_help" }
  | { goal: "open"; destination: OpenDestination }
  | { goal: "unsupported" }

const CREDENTIAL_SUPPLY_RE =
  /\b([A-Za-z0-9]{1,8}-\d{1,4})\b|\b(?:access(?:\s*code)?|code)\s*(?:is|:)?\s*[A-Za-z0-9]{8}\b/i

/**
 * Classify the user's goal for this turn.
 * Previous token-lookup drafts only continue when the user is still supplying
 * credentials or still asking about their slip/queue — never for unrelated goals.
 * Multilingual cues use includes()-based matching (ASCII \\b fails on Indic text).
 */
export function classifyAgentGoal(input: {
  intent: VoiceIntent
  utterance: string
  memory?: ConversationMemory | null
}): AgentGoal {
  const { intent, utterance, memory } = input
  const lower = utterance.toLowerCase().trim()
  const name = intent.intent

  if (name === "emergency" || utteranceSuggestsEmergency(utterance)) {
    return { goal: "emergency" }
  }

  if (utteranceSuggestsRepeat(utterance) && memory?.lastSpoken) {
    return { goal: "repeat" }
  }

  // Directions and registration beat any pending token lookup.
  if (
    name === "accessible_route" ||
    utteranceSuggestsDirections(utterance) ||
    utteranceSuggestsFacility(utterance)
  ) {
    if (
      utteranceSuggestsFollowupDirections(utterance) &&
      memory?.lastDestinationNodeId
    ) {
      return { goal: "followup_directions" }
    }
    if (!utteranceSuggestsRetrieveSlip(utterance)) {
      return { goal: "directions" }
    }
  }

  if (
    name === "registration_help" ||
    (utteranceSuggestsRegister(utterance) &&
      !utteranceSuggestsDirections(utterance))
  ) {
    return { goal: "register" }
  }

  if (utteranceSuggestsRetrieveSlip(utterance)) {
    return { goal: "retrieve_slip" }
  }

  // Explicit screen navigation ("Open my turn") before queue-status questions.
  if (
    /\b(open|go to)\b/i.test(lower) &&
    !utteranceSuggestsDirections(utterance)
  ) {
    const destination = resolveOpenDestination(lower)
    if (destination) {
      return { goal: "open", destination }
    }
  }

  if (CREDENTIAL_SUPPLY_RE.test(utterance)) {
    const extracted = extractTokenCredentials(utterance)
    if (extracted.tokenCode || extracted.accessCode) {
      return { goal: "token_credentials" }
    }
  }

  if (
    utteranceWantsTokenLookup(utterance) ||
    name === "current_token" ||
    name === "wait_estimate" ||
    utteranceSuggestsQueue(utterance)
  ) {
    return { goal: "queue_status" }
  }

  if (isPendingTokenLookup(memory) && looksLikeCredentialReply(utterance)) {
    return { goal: "token_credentials" }
  }

  if (name === "department_info" || utteranceSuggestsDepartmentsList(utterance)) {
    return { goal: "list_departments" }
  }

  if (utteranceSuggestsHelpRequest(utterance)) {
    return { goal: "help_request" }
  }

  if (name === "app_help" || utteranceSuggestsAppHelp(utterance)) {
    return { goal: "app_help" }
  }

  if (/\b(open|go to|take me to|show)\b/i.test(lower)) {
    const destination = resolveOpenDestination(lower)
    if (destination) {
      return { goal: "open", destination }
    }
  }

  return { goal: "unsupported" }
}

/** Goals that invalidate a pending token-lookup draft. */
export function goalClearsTokenLookup(goal: AgentGoal["goal"]): boolean {
  return (
    goal === "emergency" ||
    goal === "directions" ||
    goal === "followup_directions" ||
    goal === "register" ||
    goal === "list_departments" ||
    goal === "help_request" ||
    goal === "app_help" ||
    goal === "open"
  )
}

function isPendingTokenLookup(
  memory: ConversationMemory | null | undefined,
): boolean {
  const draft = memory?.tokenLookupDraft
  if (!draft) {
    return false
  }
  return (
    Boolean(draft.tokenCode || draft.accessCode) ||
    memory?.lastTopic === "token_lookup"
  )
}

function looksLikeCredentialReply(utterance: string): boolean {
  const trimmed = utterance.trim()
  if (trimmed.length > 48) {
    return false
  }
  if (
    utteranceSuggestsDirections(trimmed) ||
    utteranceSuggestsRegister(trimmed)
  ) {
    return false
  }
  const extracted = extractTokenCredentials(utterance)
  return Boolean(extracted.tokenCode || extracted.accessCode)
}

function resolveOpenDestination(lower: string): OpenDestination | null {
  if (/\b(my turn|token status|queue status)\b/.test(lower)) {
    return "my_turn"
  }
  if (/\b(my slip|slip|qr)\b/.test(lower) && !utteranceSuggestsRegister(lower)) {
    return "slip"
  }
  if (/\b(find|map|directions?|navigate)\b/.test(lower)) {
    return "find"
  }
  if (/\bemergency\b/.test(lower)) {
    return "emergency"
  }
  if (/\bregister|registration\b/.test(lower)) {
    return "register"
  }
  if (/\b(ask ai|assistant|sehatflow)\b/.test(lower)) {
    return "ask"
  }
  if (/\b(home|start)\b/.test(lower)) {
    return "home"
  }
  return null
}
