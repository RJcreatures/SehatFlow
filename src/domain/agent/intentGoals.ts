import type { VoiceIntent } from "../voice/intents.ts"
import type { ConversationMemory } from "./conversationContext.ts"
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

const DIRECTIONS_RE =
  /\b(how (?:do i|to) (?:get|go|reach)|directions?|where is|where(?:'s| are)|nearest|show (?:me )?(?:the )?route|take me to|navigate|find (?:the )?(?:lab|laboratory|washroom|toilet|pharmacy|billing|registration|cardiology|lift|ramp|stairs))\b/i

const REGISTER_RE =
  /\b(create (?:a |my )?(?:new )?(?:registration )?slip|make (?:a |me (?:a )?)?(?:new )?slip|new (?:registration )?slip|hospital registration(?: slip)?|register(?: me| myself)?|registration help|get (?:a )?new token|new (?:token|patient)|enroll|sign me up|i need (?:a |to )?(?:register|registration|slip))\b/i

const RETRIEVE_SLIP_RE =
  /\b((?:find|open|show|recover|retrieve|get) (?:my )?(?:existing )?(?:registration )?slip|lost (?:my )?(?:slip|token)|where is my (?:registration )?slip|i lost my (?:slip|token))\b/i

const QUEUE_RE =
  /\b(how (?:much )?longer|how long(?: left| remaining)?|until my turn|my turn|wait(?:ing)? time|queue (?:status|position)|patients? (?:are )?ahead|people (?:are )?ahead|how many (?:people |patients )?ahead|what(?:'s| is) my (?:token|number|position)|current (?:queue|token|position))\b/i

const CREDENTIAL_SUPPLY_RE =
  /\b([A-Za-z0-9]{1,8}-\d{1,4})\b|\b(?:access(?:\s*code)?|code)\s*(?:is|:)?\s*[A-Za-z0-9]{8}\b/i

/**
 * Classify the user's goal for this turn.
 * Previous token-lookup drafts only continue when the user is still supplying
 * credentials or still asking about their slip/queue — never for unrelated goals.
 */
export function classifyAgentGoal(input: {
  intent: VoiceIntent
  utterance: string
  memory?: ConversationMemory | null
}): AgentGoal {
  const { intent, utterance, memory } = input
  const lower = utterance.toLowerCase().trim()
  const name = intent.intent

  if (name === "emergency" || /\b(emergency|ambulance|chest pain)\b/.test(lower)) {
    return { goal: "emergency" }
  }

  if (
    /\b(repeat|say again|what did you say|can you repeat|once more)\b/.test(
      lower,
    ) &&
    memory?.lastSpoken
  ) {
    return { goal: "repeat" }
  }

  // Directions and registration beat any pending token lookup.
  if (
    name === "accessible_route" ||
    utteranceMentionsNavigation(lower) ||
    DIRECTIONS_RE.test(lower)
  ) {
    if (
      /\b(where is it|where do i go|how do i get there|which way|take me there)\b/.test(
        lower,
      ) &&
      memory?.lastDestinationNodeId
    ) {
      return { goal: "followup_directions" }
    }
    // "find my slip" is retrieval, not navigation — checked before generic find.
    if (!RETRIEVE_SLIP_RE.test(lower)) {
      return { goal: "directions" }
    }
  }

  if (
    name === "registration_help" ||
    (REGISTER_RE.test(lower) &&
      !/\b(?:from|to|near|at)\s+registration\b/.test(lower) &&
      !DIRECTIONS_RE.test(lower))
  ) {
    return { goal: "register" }
  }

  if (RETRIEVE_SLIP_RE.test(lower)) {
    return { goal: "retrieve_slip" }
  }

  // Explicit screen navigation ("Open my turn") before queue-status questions.
  // Do not steal real wayfinding ("Show me directions to the lab").
  if (
    /\b(open|go to)\b/.test(lower) &&
    !DIRECTIONS_RE.test(lower) &&
    !utteranceMentionsNavigation(lower)
  ) {
    const destination = resolveOpenDestination(lower)
    if (destination) {
      return { goal: "open", destination }
    }
  }

  // Explicit credential supply continues a pending lookup, or starts one.
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
    QUEUE_RE.test(lower)
  ) {
    return { goal: "queue_status" }
  }

  // Pending lookup: only continue if the utterance is a short credential reply
  // (not a new goal). Short replies while awaiting token/access.
  if (isPendingTokenLookup(memory) && looksLikeCredentialReply(utterance)) {
    return { goal: "token_credentials" }
  }

  if (
    name === "department_info" ||
    /\b(departments?|list (?:the )?departments|which departments|available clinics)\b/.test(
      lower,
    )
  ) {
    return { goal: "list_departments" }
  }

  if (/\b(need help|call (?:for )?help|staff help|request help)\b/.test(lower)) {
    return { goal: "help_request" }
  }

  if (
    name === "app_help" ||
    /\b(how (?:do i|to) use|what can you do|help me use|app help)\b/.test(lower)
  ) {
    return { goal: "app_help" }
  }

  if (/\b(open|go to|take me to|show)\b/.test(lower)) {
    const destination = resolveOpenDestination(lower)
    if (destination) {
      return { goal: "open", destination }
    }
  }

  // Stale pending lookup must NOT claim unknown/unsupported turns.
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

function utteranceMentionsNavigation(lower: string): boolean {
  return /\b(washroom|toilet|restroom|bathroom|water|pharmacy|laboratory|lab|radiology|billing|cardiology|heart|lift|ramp|stairs|registration desk)\b/.test(
    lower,
  )
}

function isPendingTokenLookup(
  memory: ConversationMemory | null | undefined,
): boolean {
  const draft = memory?.tokenLookupDraft
  if (!draft) {
    return false
  }
  return Boolean(draft.tokenCode || draft.accessCode) || memory?.lastTopic === "token_lookup"
}

function looksLikeCredentialReply(utterance: string): boolean {
  const trimmed = utterance.trim()
  if (trimmed.length > 48) {
    return false
  }
  if (DIRECTIONS_RE.test(trimmed) || REGISTER_RE.test(trimmed)) {
    return false
  }
  const extracted = extractTokenCredentials(utterance)
  return Boolean(extracted.tokenCode || extracted.accessCode)
}

function resolveOpenDestination(lower: string): OpenDestination | null {
  if (/\b(my turn|token status|queue status)\b/.test(lower)) {
    return "my_turn"
  }
  if (/\b(my slip|slip|qr)\b/.test(lower) && !REGISTER_RE.test(lower)) {
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
