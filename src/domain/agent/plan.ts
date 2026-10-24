import type { VoiceIntent } from "../voice/intents.ts"
import {
  applyUtteranceToDraft,
  resolveDepartmentCode,
} from "./extract.ts"
import {
  createRegistrationDraft,
  missingRegistrationField,
  registrationDraftReady,
} from "./registrationDraft.ts"
import type {
  AgentPlan,
  AgentToolCall,
  OpenDestination,
  RegistrationDraft,
} from "./types.ts"

export type PlanContext = {
  hasVerifiedSlip: boolean
  registrationDraft: RegistrationDraft | null
  awaitingField: "need_name" | "need_age" | "need_department" | null
}

/**
 * Deterministic planner: maps classified intent + utterance → allowlisted tool
 * or clarification. Model output never bypasses this layer.
 */
export function planAgentAction(input: {
  intent: VoiceIntent
  utterance: string
  context: PlanContext
}): AgentPlan {
  const { intent, utterance, context } = input
  const lower = utterance.toLowerCase().trim()
  const name = intent.intent

  if (name === "emergency" || /\b(emergency|ambulance|chest pain)\b/.test(lower)) {
    return { kind: "say", messageKey: "emergency" }
  }

  if (
    name === "current_token" ||
    name === "wait_estimate" ||
    /\b(my token|token number|what(?:'s| is) my (?:token|number)|queue (?:status|position))\b/.test(
      lower,
    )
  ) {
    if (!context.hasVerifiedSlip) {
      return {
        kind: "clarify",
        messageKey: "need_token_context",
        tool: "get_my_turn",
      }
    }
    if (
      name === "wait_estimate" ||
      /\b(wait|how long|estimate|minutes?\s*(left|remaining)|time\s*(left|remaining)|how much longer|kitna\s*(time|der)|remaining)\b/.test(
        lower,
      )
    ) {
      return { kind: "tool", call: { tool: "get_wait_estimate", args: {} } }
    }
    return { kind: "tool", call: { tool: "get_my_turn", args: {} } }
  }

  if (
    name === "registration_help" ||
    /\b(register|registration|get (?:a )?token|new (?:token|patient)|enroll)\b/.test(
      lower,
    )
  ) {
    return planRegistration(utterance, context.registrationDraft)
  }

  if (context.awaitingField || context.registrationDraft) {
    const looksLikeDetail =
      Boolean(resolveDepartmentCode(utterance)) ||
      /\b(?:my name is|i am|i'm|age|years?\s*old|\d{1,3})\b/i.test(utterance) ||
      /^[A-Za-z][A-Za-z.\s'-]{1,40}$/.test(utterance.trim()) ||
      /^\s*\d{1,3}\s*$/.test(utterance)
    if (looksLikeDetail) {
      return planRegistration(utterance, context.registrationDraft)
    }
  }

  if (
    name === "department_info" ||
    /\b(departments?|list (?:the )?departments|which departments|available clinics)\b/.test(
      lower,
    )
  ) {
    return { kind: "tool", call: { tool: "list_departments", args: {} } }
  }

  if (
    name === "accessible_route" ||
    /\b(how (?:do i|to) (?:get|go|reach)|directions?|where is|find (?:the )?)\b/.test(
      lower,
    )
  ) {
    const dest =
      intent.destination_code ??
      intent.department_code ??
      resolveDepartmentCode(utterance)
    if (!dest) {
      return {
        kind: "clarify",
        messageKey: "need_destination",
        tool: "find_route",
      }
    }
    return {
      kind: "tool",
      call: {
        tool: "find_route",
        args: {
          destination_code: dest,
          start_landmark: intent.start_landmark ?? "entrance",
          route_mode: "assisted",
        },
      },
    }
  }

  if (/\b(need help|call (?:for )?help|staff help|request help)\b/.test(lower)) {
    const dept = resolveDepartmentCode(utterance) ?? intent.department_code
    return {
      kind: "tool",
      call: {
        tool: "submit_help_request",
        args: { department_code: dept },
      },
    }
  }

  if (/\b(open|go to|take me to|show)\b/.test(lower)) {
    const dest = resolveOpenDestination(lower)
    if (dest) {
      return {
        kind: "tool",
        call: { tool: "open_destination", args: { destination: dest } },
      }
    }
  }

  if (
    name === "app_help" ||
    /\b(how (?:do i|to) use|what can you do|help me use|app help)\b/.test(lower)
  ) {
    return { kind: "tool", call: { tool: "app_help", args: {} } }
  }

  return { kind: "unsupported" }
}

function planRegistration(
  utterance: string,
  existing: RegistrationDraft | null,
): AgentPlan {
  const draft = applyUtteranceToDraft(existing, utterance)
  const missing = missingRegistrationField(draft)
  if (missing) {
    return {
      kind: "clarify",
      messageKey: missing,
      tool: "register_patient",
    }
  }
  if (!registrationDraftReady(draft)) {
    return {
      kind: "clarify",
      messageKey: "need_clarify_register",
      tool: "register_patient",
    }
  }
  const call: AgentToolCall = {
    tool: "register_patient",
    args: {
      display_name: draft.display_name,
      age: draft.age,
      gender: draft.gender,
      department_code: draft.department_code,
      idempotency_key: draft.idempotency_key,
    },
  }
  return { kind: "tool", call }
}

function resolveOpenDestination(lower: string): OpenDestination | null {
  if (/\b(my turn|token status|queue status)\b/.test(lower)) {
    return "my_turn"
  }
  if (/\b(my slip|slip|qr)\b/.test(lower)) {
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

export function seedDraftFromPlan(
  plan: AgentPlan,
  utterance: string,
  existing: RegistrationDraft | null,
): RegistrationDraft | null {
  if (
    (plan.kind === "clarify" && plan.tool === "register_patient") ||
    (plan.kind === "tool" && plan.call.tool === "register_patient")
  ) {
    return applyUtteranceToDraft(
      existing ?? createRegistrationDraft(),
      utterance,
    )
  }
  return existing
}
