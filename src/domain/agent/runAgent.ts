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
  loadRegistrationDraft,
  saveRegistrationDraft,
} from "./registrationDraft.ts"
import { planAgentAction, seedDraftFromPlan, type PlanContext } from "./plan.ts"
import type { AgentClarifyKey, RegistrationDraft } from "./types.ts"

export type AgentTurnResult = {
  spoken: string
  openEmergency?: boolean
  needsMyTurn?: boolean
  openRegister?: boolean
  openSlip?: boolean
  navigateTo?: string | null
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
    case "need_token_context":
      return messages.agentNeedTokenContext
    case "need_clarify_register":
      return messages.agentClarifyRegister
    default: {
      const _exhaustive: never = key
      void _exhaustive
      return messages.agentUnsupportedAction
    }
  }
}

/**
 * Bounded agent loop: plan → validate → execute trusted ops → localized summary.
 * Conversation draft is session-scoped; never used as authorization.
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
}): Promise<AgentTurnResult> {
  const draft =
    input.draft !== undefined ? input.draft : loadRegistrationDraft()
  const context: PlanContext = {
    hasVerifiedSlip: hasVerifiedSlipContext(),
    registrationDraft: draft,
    awaitingField: input.awaitingField ?? null,
  }

  const plan = planAgentAction({
    intent: input.intent,
    utterance: input.utterance,
    context,
  })

  const nextDraft = seedDraftFromPlan(plan, input.utterance, draft)
  if (nextDraft) {
    saveRegistrationDraft(nextDraft)
  }

  if (plan.kind === "say") {
    if (plan.messageKey === "emergency") {
      return {
        spoken: `${input.messages.emergencyImmediate} ${input.messages.emergencyLead}`,
        openEmergency: true,
        awaitingField: null,
        draft: nextDraft,
      }
    }
    if (plan.messageKey === "registration_help") {
      return {
        spoken: input.messages.voiceAnswerRegistrationHelp,
        openRegister: true,
        awaitingField: null,
        draft: nextDraft,
      }
    }
    return {
      spoken: input.messages.voiceAnswerAppHelp,
      awaitingField: null,
      draft: nextDraft,
    }
  }

  if (plan.kind === "unsupported") {
    return {
      spoken: input.messages.agentUnsupportedAction,
      awaitingField: null,
      draft: nextDraft,
    }
  }

  if (plan.kind === "clarify") {
    const field =
      plan.messageKey === "need_name" ||
      plan.messageKey === "need_age" ||
      plan.messageKey === "need_department"
        ? plan.messageKey
        : null
    return {
      spoken: clarifyMessage(plan.messageKey, input.messages),
      needsMyTurn: plan.messageKey === "need_token_context",
      openRegister: plan.tool === "register_patient",
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

  return {
    spoken: executed.spoken,
    openEmergency: executed.openEmergency,
    needsMyTurn: executed.needsMyTurn,
    openRegister: executed.openRegister,
    openSlip: executed.openSlip,
    navigateTo: executed.navigateTo,
    tokenUpdate: executed.tokenUpdate,
    awaitingField: null,
    draft: plan.call.tool === "register_patient" && executed.ok ? null : nextDraft,
  }
}
