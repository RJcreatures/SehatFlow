import type { MessageCatalog } from "../../i18n/types.ts"
import type { AppSupabase } from "../../lib/supabase/queueApi.ts"
import type { RouteMode } from "../navigation/types.ts"
import type { VoiceIntent } from "../voice/intents.ts"
import type { DepartmentFact, TokenContext } from "../voice/answers.ts"
import {
  executeAgentTool,
  hasVerifiedSlipContext,
  type LiveQueueHint,
} from "./execute.ts"
import {
  loadConversationMemory,
  saveConversationMemory,
  type ConversationMemory,
  type ConversationTopic,
} from "./conversationContext.ts"
import { planAgentSteps } from "./compoundPlan.ts"
import { classifyAgentGoal, goalClearsTokenLookup } from "./intentGoals.ts"
import {
  loadRegistrationDraft,
  saveRegistrationDraft,
} from "./registrationDraft.ts"
import {
  planAgentAction,
  planClearsTokenLookup,
  seedDraftFromPlan,
  type PlanContext,
} from "./plan.ts"
import {
  emptyTokenLookupDraft,
  mergeTokenLookupDraft,
} from "./tokenLookup.ts"
import type {
  AgentClarifyKey,
  AgentPlan,
  NavigationHandoff,
  RegistrationDraft,
} from "./types.ts"

export type AgentTurnResult = {
  spoken: string
  openEmergency?: boolean
  needsMyTurn?: boolean
  openRegister?: boolean
  openSlip?: boolean
  navigateTo?: string | null
  navigationHandoff?: NavigationHandoff | null
  tokenUpdate?: TokenContext | null
  awaitingField: PlanContext["awaitingField"]
  draft: RegistrationDraft | null
}

function clarifyMessage(
  key: AgentClarifyKey,
  messages: MessageCatalog,
): string {
  switch (key) {
    case "need_name":
      return messages.agentAskName
    case "need_age":
      return messages.agentAskAge
    case "need_department":
      return messages.agentAskDepartment
    case "need_destination":
      return messages.agentAskDestination
    case "need_start":
      return messages.agentAskStart
    case "need_token_context":
      return messages.agentNeedTokenContext
    case "need_token_code":
      return messages.agentAskTokenCode
    case "need_access_code":
      return messages.agentAskAccessCode
    case "need_token_and_access":
      return messages.agentAskTokenAndAccess
    case "token_lookup_rate_limited":
      return messages.agentTokenLookupRateLimited
    case "need_clarify_register":
      return messages.agentClarifyRegister
    default: {
      const _exhaustive: never = key
      void _exhaustive
      return messages.agentUnsupportedAction
    }
  }
}

function topicForPlan(plan: AgentPlan): ConversationTopic {
  if (plan.kind === "tool") {
    switch (plan.call.tool) {
      case "get_my_turn":
      case "get_wait_estimate":
        return "queue"
      case "token_lookup":
        return "token_lookup"
      case "find_route":
        return "directions"
      case "list_departments":
        return "departments"
      case "register_patient":
        return "register"
      case "submit_help_request":
      case "app_help":
        return "help"
      default:
        return null
    }
  }
  return null
}

function rememberTurn(input: {
  memory: ConversationMemory
  utterance: string
  spoken: string
  ok: boolean
  plan: AgentPlan
  intent: VoiceIntent
  tokenLookupPatch?: ConversationMemory["tokenLookupDraft"]
}): void {
  const topic = topicForPlan(input.plan)
  const goal = classifyAgentGoal({
    intent: input.intent,
    utterance: input.utterance,
    memory: input.memory,
  })
  const clearLookup =
    goalClearsTokenLookup(goal.goal) || planClearsTokenLookup(input.plan)

  let tokenLookupDraft =
    input.tokenLookupPatch ?? input.memory.tokenLookupDraft
  if (clearLookup) {
    tokenLookupDraft = emptyTokenLookupDraft()
  }
  if (
    input.plan.kind === "tool" &&
    input.plan.call.tool === "token_lookup" &&
    input.ok
  ) {
    tokenLookupDraft = emptyTokenLookupDraft()
  }

  const next: ConversationMemory = {
    ...input.memory,
    lastUserUtterance: input.utterance,
    lastSpoken: input.spoken,
    lastTopic: topic ?? (clearLookup ? null : input.memory.lastTopic),
    consecutiveFailures: input.ok ? 0 : input.memory.consecutiveFailures + 1,
    tokenLookupDraft,
  }
  if (input.plan.kind === "tool" && input.plan.call.tool === "find_route") {
    next.lastDestinationNodeId = input.plan.call.args.destination_code
    next.lastStartNodeId = input.plan.call.args.start_landmark
    next.lastTopic = "directions"
  }
  if (
    input.plan.kind === "clarify" &&
    input.plan.tool === "find_route" &&
    input.plan.messageKey === "need_start"
  ) {
    next.lastDestinationNodeId =
      input.plan.pendingDestination ?? next.lastDestinationNodeId
    next.lastStartNodeId = null
    next.lastTopic = "directions"
  }
  if (
    input.plan.kind === "clarify" &&
    input.plan.tool === "register_patient"
  ) {
    next.lastTopic = "register"
  }
  saveConversationMemory(next)
}

async function runSinglePlan(input: {
  plan: AgentPlan
  intent: VoiceIntent
  utterance: string
  client: AppSupabase | null
  messages: MessageCatalog
  departments: DepartmentFact[]
  routeMode?: RouteMode
  startId?: string
  liveQueue?: LiveQueueHint | null
  memory: ConversationMemory
  draft: RegistrationDraft | null
}): Promise<AgentTurnResult> {
  const { plan, memory, draft, intent } = input
  const nextDraft = seedDraftFromPlan(plan, input.utterance, draft)
  if (nextDraft) {
    saveRegistrationDraft(nextDraft)
  }

  const remember = (args: {
    spoken: string
    ok: boolean
    tokenLookupPatch?: ConversationMemory["tokenLookupDraft"]
  }) =>
    rememberTurn({
      memory,
      utterance: input.utterance,
      spoken: args.spoken,
      ok: args.ok,
      plan,
      intent,
      tokenLookupPatch: args.tokenLookupPatch,
    })

  if (plan.kind === "say") {
    if (plan.messageKey === "repeat_last") {
      const spoken = memory.lastSpoken ?? input.messages.agentUnsupportedAction
      remember({ spoken, ok: Boolean(memory.lastSpoken) })
      return { spoken, awaitingField: null, draft: nextDraft }
    }
    if (plan.messageKey === "emergency") {
      const spoken = `${input.messages.emergencyImmediate} ${input.messages.emergencyLead}`
      remember({ spoken, ok: true })
      return {
        spoken,
        openEmergency: true,
        awaitingField: null,
        draft: nextDraft,
      }
    }
    if (plan.messageKey === "registration_help") {
      const spoken = input.messages.voiceAnswerRegistrationHelp
      remember({ spoken, ok: true })
      return {
        spoken,
        openRegister: true,
        awaitingField: null,
        draft: nextDraft,
      }
    }
    const spoken = input.messages.voiceAnswerAppHelp
    remember({ spoken, ok: true })
    return { spoken, awaitingField: null, draft: nextDraft }
  }

  if (plan.kind === "unsupported") {
    const spoken =
      memory.consecutiveFailures >= 1
        ? input.messages.agentClarifyCapabilities
        : input.messages.agentUnsupportedAction
    remember({ spoken, ok: false })
    return { spoken, awaitingField: null, draft: nextDraft }
  }

  if (plan.kind === "clarify") {
    const field =
      plan.messageKey === "need_name" ||
      plan.messageKey === "need_age" ||
      plan.messageKey === "need_department" ||
      plan.messageKey === "need_start"
        ? plan.messageKey
        : null
    const spoken =
      plan.messageKey === "need_token_context" &&
      plan.tool === "token_lookup" &&
      memory.tokenLookupDraft.failedAttempts >= 5
        ? clarifyMessage("token_lookup_rate_limited", input.messages)
        : clarifyMessage(plan.messageKey, input.messages)
    // Only accumulate credentials when clarifying token lookup.
    const tokenLookupPatch =
      plan.tool === "token_lookup"
        ? mergeTokenLookupDraft(memory.tokenLookupDraft, input.utterance)
        : emptyTokenLookupDraft()
    remember({ spoken, ok: false, tokenLookupPatch })
    return {
      spoken,
      needsMyTurn:
        plan.messageKey === "need_token_context" ||
        plan.messageKey === "need_token_and_access" ||
        plan.messageKey === "need_access_code" ||
        plan.messageKey === "need_token_code",
      openRegister: plan.tool === "register_patient",
      navigateTo:
        plan.tool === "register_patient" ? "/register" : undefined,
      awaitingField: field,
      draft: nextDraft,
    }
  }

  const executed = await executeAgentTool({
    call: plan.call,
    client: input.client,
    messages: input.messages,
    departments: input.departments,
    routeMode: input.routeMode,
    startId: input.startId,
    liveQueue: input.liveQueue,
  })

  let tokenLookupPatch = memory.tokenLookupDraft
  if (plan.call.tool === "token_lookup") {
    if (executed.ok) {
      tokenLookupPatch = emptyTokenLookupDraft()
    } else {
      tokenLookupPatch = {
        ...mergeTokenLookupDraft(memory.tokenLookupDraft, input.utterance),
        failedAttempts: memory.tokenLookupDraft.failedAttempts + 1,
      }
    }
  } else if (planClearsTokenLookup(plan)) {
    tokenLookupPatch = emptyTokenLookupDraft()
  }

  remember({
    spoken: executed.spoken,
    ok: executed.ok,
    tokenLookupPatch,
  })

  return {
    spoken: executed.spoken,
    openEmergency: executed.openEmergency,
    needsMyTurn: executed.needsMyTurn,
    openRegister: executed.openRegister,
    openSlip: executed.openSlip,
    navigateTo: executed.navigateTo,
    navigationHandoff: executed.navigationHandoff ?? null,
    tokenUpdate: executed.tokenUpdate,
    awaitingField: null,
    draft:
      plan.call.tool === "register_patient" && executed.ok ? null : nextDraft,
  }
}

/**
 * Bounded agent loop: plan → validate → execute trusted ops → localized summary.
 * Supports multi-step compound utterances without inventing data.
 */
export async function runAgentTurn(input: {
  intent: VoiceIntent
  utterance: string
  client: AppSupabase | null
  messages: MessageCatalog
  departments: DepartmentFact[]
  routeMode?: RouteMode
  startId?: string
  awaitingField?: PlanContext["awaitingField"]
  draft?: RegistrationDraft | null
  liveQueue?: LiveQueueHint | null
  conversation?: ConversationMemory | null
}): Promise<AgentTurnResult> {
  let memory = input.conversation ?? loadConversationMemory()
  const draft =
    input.draft !== undefined ? input.draft : loadRegistrationDraft()
  const context: PlanContext = {
    hasVerifiedSlip: hasVerifiedSlipContext(),
    registrationDraft: draft,
    awaitingField: input.awaitingField ?? null,
    conversation: memory,
    defaultStartId: input.startId ?? "entrance",
  }

  const steps = planAgentSteps({
    intent: input.intent,
    utterance: input.utterance,
    context,
  })

  const runStep = (plan: AgentPlan, mem: ConversationMemory, d: RegistrationDraft | null) =>
    runSinglePlan({
      plan,
      intent: input.intent,
      utterance: input.utterance,
      client: input.client,
      messages: input.messages,
      departments: input.departments,
      routeMode: input.routeMode,
      startId: input.startId,
      liveQueue: input.liveQueue,
      memory: mem,
      draft: d,
    })

  // Emergency must never wait on other tools.
  if (steps.length === 1 && steps[0]?.kind === "say" && steps[0].messageKey === "emergency") {
    return runStep(steps[0], memory, draft)
  }

  if (steps.length <= 1) {
    return runStep(
      steps[0] ??
        planAgentAction({
          intent: input.intent,
          utterance: input.utterance,
          context,
        }),
      memory,
      draft,
    )
  }

  // Prefer non-token tools first so directions/registration are not blocked
  // by a sibling token-lookup clarification in a compound utterance.
  const ordered = [
    ...steps.filter(
      (step) => !(step.kind === "clarify" && step.tool === "token_lookup"),
    ),
    ...steps.filter(
      (step) => step.kind === "clarify" && step.tool === "token_lookup",
    ),
  ]

  const spokenParts: string[] = []
  let result: AgentTurnResult = {
    spoken: "",
    awaitingField: null,
    draft,
    navigationHandoff: null,
  }
  let workingDraft = draft

  for (const step of ordered) {
    const part = await runStep(step, loadConversationMemory(), workingDraft)
    memory = loadConversationMemory()
    workingDraft = part.draft
    spokenParts.push(part.spoken)
    result = {
      spoken: spokenParts.join(" "),
      openEmergency: result.openEmergency || part.openEmergency,
      needsMyTurn: result.needsMyTurn || part.needsMyTurn,
      openRegister: result.openRegister || part.openRegister,
      openSlip: result.openSlip || part.openSlip,
      navigateTo: part.navigateTo ?? result.navigateTo,
      navigationHandoff: part.navigationHandoff ?? result.navigationHandoff,
      tokenUpdate: part.tokenUpdate ?? result.tokenUpdate,
      awaitingField: part.awaitingField,
      draft: workingDraft,
    }

    if (part.openEmergency) {
      break
    }
    // Stop after a token-lookup clarify — later tools already ran first.
    if (step.kind === "clarify" && step.tool === "token_lookup") {
      break
    }
  }

  rememberTurn({
    memory: loadConversationMemory(),
    utterance: input.utterance,
    spoken: result.spoken,
    ok: !result.needsMyTurn || Boolean(result.tokenUpdate),
    plan: ordered.find((step) => step.kind === "tool") ?? ordered[0]!,
    intent: input.intent,
  })

  return result
}
