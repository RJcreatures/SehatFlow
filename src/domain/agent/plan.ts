import type { VoiceIntent } from "../voice/intents.ts"
import type { ConversationMemory } from "./conversationContext.ts"
import {
  applyUtteranceToDraft,
  resolveDepartmentCode,
} from "./extract.ts"
import {
  classifyAgentGoal,
  goalClearsTokenLookup,
  type AgentGoal,
} from "./intentGoals.ts"
import {
  extractRouteEnds,
  resolveDestinationNodeId,
  resolveStartNodeId,
  resolveStartReply,
} from "./navigationTarget.ts"
import {
  createRegistrationDraft,
  missingRegistrationField,
  registrationDraftReady,
} from "./registrationDraft.ts"
import { planTokenLookupStep } from "./tokenLookup.ts"
import type {
  AgentPlan,
  AgentToolCall,
  RegistrationDraft,
} from "./types.ts"

export type PlanContext = {
  hasVerifiedSlip: boolean
  registrationDraft: RegistrationDraft | null
  awaitingField:
    | "need_name"
    | "need_age"
    | "need_department"
    | "need_start"
    | null
  conversation?: ConversationMemory | null
  defaultStartId?: string
}

/**
 * Deterministic planner: classifies goal first, then maps to allowlisted tools.
 * Token lookup is never applied globally — only for retrieve_slip / queue /
 * explicit credential replies.
 */
export function planAgentAction(input: {
  intent: VoiceIntent
  utterance: string
  context: PlanContext
}): AgentPlan {
  const { intent, utterance, context } = input
  const memory = context.conversation
  const defaultStart = context.defaultStartId ?? "entrance"
  const classified = classifyAgentGoal({ intent, utterance, memory })
  const registering =
    context.awaitingField === "need_name" ||
    context.awaitingField === "need_age" ||
    context.awaitingField === "need_department" ||
    (context.registrationDraft != null &&
      missingRegistrationField(context.registrationDraft) != null)

  // In-progress registration field replies beat goal reclassification
  // (e.g. bare "45" or "twenty five" must not fall through as unsupported).
  if (
    registering &&
    classified.goal !== "emergency" &&
    classified.goal !== "directions" &&
    classified.goal !== "followup_directions" &&
    classified.goal !== "retrieve_slip" &&
    classified.goal !== "queue_status"
  ) {
    return planRegistration(
      utterance,
      context.registrationDraft,
      context.awaitingField === "need_name" ||
        context.awaitingField === "need_age" ||
        context.awaitingField === "need_department"
        ? context.awaitingField
        : null,
    )
  }

  // Pending start landmark after a destination was already resolved.
  if (
    (context.awaitingField === "need_start" ||
      (memory?.lastDestinationNodeId &&
        memory.lastTopic === "directions" &&
        !memory.lastStartNodeId)) &&
    classified.goal !== "emergency" &&
    classified.goal !== "register" &&
    classified.goal !== "retrieve_slip" &&
    classified.goal !== "queue_status"
  ) {
    const dest =
      memory?.lastDestinationNodeId ??
      resolveDestinationNodeId(
        intent.destination_code ?? intent.department_code,
        utterance,
      )
                    if (dest) {
      // New destination request replaces the pending one.
      if (
        classified.goal === "directions" &&
        /\b(where is|directions?|how (?:do i|to) (?:get|go))\b/i.test(utterance)
      ) {
        const fresh = resolveDestinationNodeId(
          intent.destination_code ?? intent.department_code,
          utterance,
        )
        if (fresh) {
          return planForGoal(classified, {
            intent,
            utterance,
            context,
            defaultStart,
          })
        }
      }
      return completeDirections(utterance, intent, dest, {
        allowBareStartReply: true,
      })
    }
  }

  return planForGoal(classified, {
    intent,
    utterance,
    context,
    defaultStart,
  })
}

export function planForGoal(
  classified: AgentGoal,
  input: {
    intent: VoiceIntent
    utterance: string
    context: PlanContext
    defaultStart: string
  },
): AgentPlan {
  const { intent, utterance, context, defaultStart } = input
  const memory = context.conversation

  switch (classified.goal) {
    case "emergency":
      return { kind: "say", messageKey: "emergency" }

    case "repeat":
      return { kind: "say", messageKey: "repeat_last" }

    case "followup_directions":
      return planDirections(
        utterance,
        {
          ...intent,
          destination_code: memory?.lastDestinationNodeId ?? null,
          start_landmark: memory?.lastStartNodeId ?? null,
        },
        defaultStart,
      )

    case "directions":
      return planDirections(utterance, intent, defaultStart)

    case "register":
      return planRegistration(
        utterance,
        context.registrationDraft,
        context.awaitingField === "need_name" ||
          context.awaitingField === "need_age" ||
          context.awaitingField === "need_department"
          ? context.awaitingField
          : null,
      )

    case "retrieve_slip":
      if (context.hasVerifiedSlip) {
        return {
          kind: "tool",
          call: { tool: "open_destination", args: { destination: "slip" } },
        }
      }
      return (
        planTokenLookupStep(utterance, memory) ?? {
          kind: "clarify",
          messageKey: "need_token_and_access",
          tool: "token_lookup",
        }
      )

    case "token_credentials":
      return (
        planTokenLookupStep(utterance, memory) ?? {
          kind: "clarify",
          messageKey: "need_token_and_access",
          tool: "token_lookup",
        }
      )

    case "queue_status":
      if (context.hasVerifiedSlip) {
        if (
          intent.intent === "wait_estimate" ||
          /\b(wait|how long|how much longer|estimate|minutes?\s*(left|remaining)|time\s*(left|remaining)|until my turn|remaining|patients? (?:are )?ahead|people (?:are )?ahead)\b/i.test(
            utterance,
          )
        ) {
          return { kind: "tool", call: { tool: "get_wait_estimate", args: {} } }
        }
        return { kind: "tool", call: { tool: "get_my_turn", args: {} } }
      }
      return (
        planTokenLookupStep(utterance, memory) ?? {
          kind: "clarify",
          messageKey: "need_token_and_access",
          tool: "token_lookup",
        }
      )

    case "list_departments":
      return { kind: "tool", call: { tool: "list_departments", args: {} } }

    case "help_request": {
      const dept = resolveDepartmentCode(utterance) ?? intent.department_code
      return {
        kind: "tool",
        call: {
          tool: "submit_help_request",
          args: { department_code: dept },
        },
      }
    }

    case "app_help":
      return { kind: "tool", call: { tool: "app_help", args: {} } }

    case "open":
      return {
        kind: "tool",
        call: {
          tool: "open_destination",
          args: { destination: classified.destination },
        },
      }

    case "unsupported":
      // Continue in-progress registration field collection only.
      if (
        context.awaitingField === "need_name" ||
        context.awaitingField === "need_age" ||
        context.awaitingField === "need_department" ||
        context.registrationDraft
      ) {
        const looksLikeDetail =
          Boolean(resolveDepartmentCode(utterance)) ||
          /\b(?:my name is|i am|i'm|age|years?\s*old|\d{1,3})\b/i.test(
            utterance,
          ) ||
          /^[A-Za-z][A-Za-z.\s'-]{1,40}$/.test(utterance.trim()) ||
          /^\s*\d{1,3}\s*$/.test(utterance)
        if (looksLikeDetail) {
          return planRegistration(
            utterance,
            context.registrationDraft,
            context.awaitingField === "need_name" ||
              context.awaitingField === "need_age" ||
              context.awaitingField === "need_department"
              ? context.awaitingField
              : null,
          )
        }
      }
      return { kind: "unsupported" }

    default: {
      const _exhaustive: never = classified
      void _exhaustive
      return { kind: "unsupported" }
    }
  }
}

function planDirections(
  utterance: string,
  intent: VoiceIntent,
  _defaultStart: string,
): AgentPlan {
  const ends = extractRouteEnds(utterance)
  const destNode = resolveDestinationNodeId(
    intent.destination_code ?? intent.department_code,
    ends.toText ? `${ends.toText} ${utterance}` : utterance,
  )
  if (!destNode) {
    return {
      kind: "clarify",
      messageKey: "need_destination",
      tool: "find_route",
    }
  }
  return completeDirections(utterance, intent, destNode, {
    allowBareStartReply: false,
  })
}

/**
 * Build a route only when the start landmark is explicit.
 * Never silently assume the patient is at the main entrance.
 */
function completeDirections(
  utterance: string,
  intent: VoiceIntent,
  destNode: string,
  options: { allowBareStartReply: boolean },
): AgentPlan {
  const ends = extractRouteEnds(utterance)
  const hint = intent.start_landmark ?? ends.fromText ?? null
  let startId = resolveStartNodeId(utterance, hint, "")
  if (!startId && options.allowBareStartReply) {
    startId = resolveStartReply(utterance) ?? ""
  }

  if (!startId) {
    return {
      kind: "clarify",
      messageKey: "need_start",
      tool: "find_route",
      pendingDestination: destNode,
    }
  }

  return {
    kind: "tool",
    call: {
      tool: "find_route",
      args: {
        destination_code: destNode,
        start_landmark: startId,
        route_mode: "assisted",
      },
    },
  }
}

function planRegistration(
  utterance: string,
  existing: RegistrationDraft | null,
  awaitingField: "need_name" | "need_age" | "need_department" | null = null,
): AgentPlan {
  const draft = applyUtteranceToDraft(existing, utterance, { awaitingField })
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
  // Switching away from registration should not keep an orphan draft as a
  // sticky awaiting state for unrelated turns.
  if (
    plan.kind === "tool" &&
    (plan.call.tool === "find_route" ||
      plan.call.tool === "open_destination" ||
      plan.call.tool === "get_my_turn" ||
      plan.call.tool === "get_wait_estimate" ||
      plan.call.tool === "token_lookup")
  ) {
    return existing
  }
  return existing
}

/** Whether this plan should clear a pending token-lookup draft. */
export function planClearsTokenLookup(plan: AgentPlan): boolean {
  if (plan.kind === "say" && plan.messageKey === "emergency") {
    return true
  }
  if (plan.kind === "tool") {
    return (
      plan.call.tool === "find_route" ||
      plan.call.tool === "register_patient" ||
      plan.call.tool === "list_departments" ||
      plan.call.tool === "app_help" ||
      plan.call.tool === "submit_help_request" ||
      (plan.call.tool === "open_destination" &&
        plan.call.args.destination !== "slip" &&
        plan.call.args.destination !== "my_turn")
    )
  }
  if (plan.kind === "clarify" && plan.tool === "register_patient") {
    return true
  }
  if (plan.kind === "clarify" && plan.tool === "find_route") {
    return true
  }
  return false
}

export function shouldClearTokenLookupForUtterance(input: {
  intent: VoiceIntent
  utterance: string
  memory?: ConversationMemory | null
}): boolean {
  const goal = classifyAgentGoal(input)
  return goalClearsTokenLookup(goal.goal)
}
