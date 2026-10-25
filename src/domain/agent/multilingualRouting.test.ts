import { describe, expect, it } from "vitest"
import { en } from "../../i18n/en.ts"
import { classifyAgentGoal } from "./intentGoals.ts"
import { planAgentAction } from "./plan.ts"
import { parseVoiceIntent } from "../voice/intents.ts"
import type { VoiceIntent } from "../voice/intents.ts"

function unknownIntent(): VoiceIntent {
  return {
    intent: "unknown",
    department_code: null,
    destination_code: null,
    start_landmark: null,
    confidence: 0,
  }
}

const emptyContext = {
  hasVerifiedSlip: false,
  registrationDraft: null,
  awaitingField: null as null,
  defaultStartId: "entrance",
}

describe("multilingual intent routing (Hindi and Indic)", () => {
  it("classifies Hindi directions without English keywords", () => {
    expect(
      classifyAgentGoal({
        intent: unknownIntent(),
        utterance: "लैब कहाँ है?",
      }).goal,
    ).toBe("directions")
    expect(
      classifyAgentGoal({
        intent: unknownIntent(),
        utterance: "कार्डियोलॉजी का रास्ता बताओ",
      }).goal,
    ).toBe("directions")
  })

  it("classifies Hindi registration and queue phrases", () => {
    expect(
      classifyAgentGoal({
        intent: unknownIntent(),
        utterance: "मेरा रजिस्ट्रेशन करो",
      }).goal,
    ).toBe("register")
    expect(
      classifyAgentGoal({
        intent: unknownIntent(),
        utterance: "मेरी बारी कब आएगी?",
      }).goal,
    ).toBe("queue_status")
  })

  it("plans Hindi lab directions through the deterministic planner", () => {
    const plan = planAgentAction({
      intent: unknownIntent(),
      utterance: "लैब कहाँ है?",
      context: emptyContext,
    })
    expect(plan).toMatchObject({
      kind: "clarify",
      messageKey: "need_start",
      tool: "find_route",
    })
    if (plan.kind === "clarify") {
      expect(plan.pendingDestination).toBe("laboratory")
    }
  })

  it("keeps accessible_route when Sarvam omits destination_code", () => {
    const parsed = parseVoiceIntent({
      intent: "accessible_route",
      department_code: null,
      destination_code: null,
      start_landmark: null,
      confidence: 0.8,
    })
    expect(parsed?.intent).toBe("accessible_route")

    const plan = planAgentAction({
      intent: parsed!,
      utterance: "शौचालय कहाँ है?",
      context: emptyContext,
    })
    expect(plan.kind === "clarify" || plan.kind === "tool").toBe(true)
    if (plan.kind === "clarify") {
      expect(plan.tool).toBe("find_route")
      expect(plan.messageKey).not.toBe("need_token_and_access")
    }
  })

  it("accepts laboratory and cardiology destination codes from voice", () => {
    expect(
      parseVoiceIntent({
        intent: "accessible_route",
        destination_code: "laboratory",
        department_code: null,
        start_landmark: null,
        confidence: 0.9,
      })?.destination_code,
    ).toBe("laboratory")
    expect(
      parseVoiceIntent({
        intent: "accessible_route",
        destination_code: "cardiology",
        department_code: null,
        start_landmark: null,
        confidence: 0.9,
      })?.destination_code,
    ).toBe("cardiology")
  })

  it("does not leave Hindi users on the unsupported fallback", () => {
    const plan = planAgentAction({
      intent: unknownIntent(),
      utterance: "फार्मेसी कैसे जाऊँ?",
      context: emptyContext,
    })
    expect(plan.kind).not.toBe("unsupported")
    if (plan.kind === "clarify") {
      expect(plan.messageKey).not.toBe("need_token_and_access")
    }
    void en
  })
})
