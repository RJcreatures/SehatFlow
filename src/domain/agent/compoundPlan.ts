import type { VoiceIntent } from "../voice/intents.ts"
import { loadSlip } from "../../lib/slipStorage.ts"
import {
  extractRouteEnds,
  resolveDestinationNodeId,
  resolveSlipDepartmentNodeId,
  resolveStartNodeId,
  utteranceMentionsFacility,
} from "./navigationTarget.ts"
import { planAgentAction, type PlanContext } from "./plan.ts"
import {
  planTokenLookupStep,
  utteranceWantsTokenLookup,
} from "./tokenLookup.ts"
import type { AgentPlan, AgentToolCall } from "./types.ts"

/**
 * Detect multiple intents in one utterance and return ordered allowlisted steps.
 * Emergency always wins alone. Deduplicates identical tools.
 */
export function planAgentSteps(input: {
  intent: VoiceIntent
  utterance: string
  context: PlanContext
}): AgentPlan[] {
  const { intent, utterance, context } = input
  const lower = utterance.toLowerCase()

  if (
    intent.intent === "emergency" ||
    /\b(emergency|ambulance|chest pain)\b/.test(lower)
  ) {
    return [{ kind: "say", messageKey: "emergency" }]
  }

  const segments = splitCompoundUtterance(utterance)
  if (segments.length <= 1) {
    return [planAgentAction(input)]
  }

  const steps: AgentPlan[] = []
  const seenTools = new Set<string>()

  for (const segment of segments) {
    const segmentIntent: VoiceIntent = {
      ...intent,
      // Re-resolve per segment; keep confidence from parent classify.
      destination_code: null,
      department_code: null,
      start_landmark: null,
    }
    const plan = planAgentAction({
      intent: segmentIntent,
      utterance: segment,
      context,
    })
    if (plan.kind === "tool") {
      const key = toolKey(plan.call)
      if (seenTools.has(key)) {
        continue
      }
      seenTools.add(key)
    }
    if (plan.kind === "unsupported") {
      continue
    }
    steps.push(plan)
  }

  // Prefer a single find_route when one segment names destination and another
  // names a from→to / start landmark.
  const ends = extractRouteEnds(utterance)
  if (ends.toText || utteranceMentionsFacility(utterance)) {
    const dest =
      resolveDestinationNodeId(null, ends.toText ?? utterance) ??
      resolveDestinationNodeId(intent.destination_code, utterance)
    if (dest) {
      const start = resolveStartNodeId(
        utterance,
        intent.start_landmark ?? ends.fromText,
        "",
      )
      const withoutRoutes = steps.filter(
        (step) =>
          !(
            (step.kind === "tool" && step.call.tool === "find_route") ||
            (step.kind === "clarify" && step.tool === "find_route")
          ),
      )
      if (!start) {
        withoutRoutes.unshift({
          kind: "clarify",
          messageKey: "need_start",
          tool: "find_route",
          pendingDestination: dest,
        })
      } else {
        const routeCall: AgentToolCall = {
          tool: "find_route",
          args: {
            destination_code: dest,
            start_landmark: start,
            route_mode: "assisted",
          },
        }
        withoutRoutes.unshift({ kind: "tool", call: routeCall })
      }
      return finalizeCompound(withoutRoutes, utterance, context)
    }
  }

  if (steps.length === 0) {
    return [planAgentAction(input)]
  }

  return finalizeCompound(steps, utterance, context)
}

function finalizeCompound(
  steps: AgentPlan[],
  utterance: string,
  context: PlanContext,
): AgentPlan[] {
  const lower = utterance.toLowerCase()
  const wantsQueue =
    /\b(how (?:much )?longer|how long|until my turn|my turn|wait(?:ing)? time|queue (?:status|position)|patients? (?:are )?ahead|people (?:are )?ahead|how many (?:people |patients )?ahead)\b/.test(
      lower,
    )
  const hasQueueTool = steps.some(
    (step) =>
      step.kind === "tool" &&
      (step.call.tool === "get_my_turn" ||
        step.call.tool === "get_wait_estimate" ||
        step.call.tool === "token_lookup"),
  )
  const hasDirections = steps.some(
    (step) => step.kind === "tool" && step.call.tool === "find_route",
  )

  // Do not inject token lookup into a directions-first compound request unless
  // the user also explicitly asked to check/retrieve their token.
  if (wantsQueue && !hasQueueTool) {
    if (context.hasVerifiedSlip) {
      steps.unshift({
        kind: "tool",
        call: { tool: "get_wait_estimate", args: {} },
      })
    } else if (utteranceWantsTokenLookup(utterance) && !hasDirections) {
      const lookup = planTokenLookupStep(utterance, context.conversation)
      if (lookup) {
        steps.unshift(lookup)
      }
    } else if (utteranceWantsTokenLookup(utterance) && hasDirections) {
      const lookup = planTokenLookupStep(utterance, context.conversation)
      if (lookup) {
        steps.push(lookup)
      }
    }
  }

  // Drop registration clarifications that were triggered by a landmark mention.
  const cleaned = steps.filter(
    (step) =>
      !(
        step.kind === "clarify" &&
        step.tool === "register_patient" &&
        steps.some(
          (other) => other.kind === "tool" && other.call.tool === "find_route",
        )
      ),
  )
  steps.length = 0
  steps.push(...cleaned)

  // After queue, if user asks where to go next / department and we have slip.
  if (
    /\b(where (?:is|do i|should i)|my department|what (?:should i do )?next|afterward|afterwards)\b/.test(
      lower,
    )
  ) {
    const slip = loadSlip()
    const deptNode = slip ? resolveSlipDepartmentNodeId(slip) : null
    if (
      deptNode &&
      !steps.some(
        (step) => step.kind === "tool" && step.call.tool === "find_route",
      )
    ) {
      steps.push({
        kind: "clarify",
        messageKey: "need_start",
        tool: "find_route",
        pendingDestination: deptNode,
      })
    }
  }

  // Repeat last directions before queue when asked.
  if (/\brepeat\b/.test(lower) && context.conversation?.lastSpoken) {
    const withoutDupRepeat = steps.filter(
      (step) => !(step.kind === "say" && step.messageKey === "repeat_last"),
    )
    withoutDupRepeat.unshift({ kind: "say", messageKey: "repeat_last" })
    steps.length = 0
    steps.push(...withoutDupRepeat)
  }

  return dedupePlans(steps).slice(0, 3)
}

function splitCompoundUtterance(utterance: string): string[] {
  const parts = utterance
    .split(/\b(?:and then|and also|also|,|;|\band\b|\bthen\b)\b/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 2)
  return parts.length > 0 ? parts : [utterance]
}

function toolKey(call: AgentToolCall): string {
  if (call.tool === "find_route") {
    return `find_route:${call.args.start_landmark}->${call.args.destination_code}`
  }
  if (call.tool === "token_lookup") {
    return `token_lookup:${call.args.token_code}`
  }
  if (call.tool === "open_destination") {
    return `open:${call.args.destination}`
  }
  return call.tool
}

function dedupePlans(steps: AgentPlan[]): AgentPlan[] {
  const out: AgentPlan[] = []
  const seen = new Set<string>()
  for (const step of steps) {
    const key =
      step.kind === "tool"
        ? toolKey(step.call)
        : step.kind === "clarify"
          ? `clarify:${step.messageKey}`
          : step.kind === "say"
            ? `say:${step.messageKey}`
            : step.kind
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(step)
  }
  return out
}
