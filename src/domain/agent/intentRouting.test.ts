import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { en } from "../../i18n/en.ts"
import { clearSlip, saveSlip } from "../../lib/slipStorage.ts"
import {
  clearConversationMemory,
  loadConversationMemory,
  saveConversationMemory,
} from "./conversationContext.ts"
import { classifyAgentGoal } from "./intentGoals.ts"
import { planAgentAction } from "./plan.ts"
import { runAgentTurn } from "./runAgent.ts"
import { emptyTokenLookupDraft } from "./tokenLookup.ts"
import type { VoiceIntent } from "../voice/intents.ts"

function installMemorySessionStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal("sessionStorage", {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return [...store.keys()][index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  } satisfies Storage)
}

function intent(
  name: VoiceIntent["intent"] = "unknown",
  extra: Partial<VoiceIntent> = {},
): VoiceIntent {
  return {
    intent: name,
    department_code: null,
    destination_code: null,
    start_landmark: null,
    confidence: 0,
    ...extra,
  }
}

const emptyContext: {
  hasVerifiedSlip: boolean
  registrationDraft: null
  awaitingField: null
  defaultStartId: string
} = {
  hasVerifiedSlip: false,
  registrationDraft: null,
  awaitingField: null,
  defaultStartId: "entrance",
}

function assertNotTokenRequest(spoken: string) {
  expect(spoken).not.toBe(en.agentAskTokenCode)
  expect(spoken).not.toBe(en.agentAskAccessCode)
  expect(spoken).not.toBe(en.agentAskTokenAndAccess)
  expect(spoken).not.toBe(en.agentNeedTokenContext)
  expect(spoken.toLowerCase()).not.toMatch(/token code from the slip/)
}

describe("intent routing — no spurious token requests", () => {
  beforeEach(() => {
    installMemorySessionStorage()
    clearSlip()
    clearConversationMemory()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("1. directions to laboratory never requests a token", async () => {
    const utterance = "Give me directions to the laboratory."
    expect(classifyAgentGoal({ intent: intent(), utterance }).goal).toBe(
      "directions",
    )
    const plan = planAgentAction({
      intent: intent(),
      utterance,
      context: emptyContext,
    })
    expect(plan).toMatchObject({
      kind: "clarify",
      messageKey: "need_start",
      tool: "find_route",
      pendingDestination: "laboratory",
    })

    const result = await runAgentTurn({
      intent: intent(),
      utterance,
      client: null,
      messages: en,
      departments: [],
    })
    expect(result.spoken).toBe(en.agentAskStart)
    assertNotTokenRequest(result.spoken)
    expect(result.needsMyTurn).toBeFalsy()
  })

  it("2. where is cardiology selects navigation", async () => {
    const utterance = "Where is cardiology?"
    const plan = planAgentAction({
      intent: intent(),
      utterance,
      context: emptyContext,
    })
    expect(plan).toMatchObject({
      kind: "clarify",
      messageKey: "need_start",
      pendingDestination: "dept_cardiology",
    })
    const result = await runAgentTurn({
      intent: intent("unknown"),
      utterance: "How do I get to cardiology from registration?",
      client: null,
      messages: en,
      departments: [],
    })
    expect(result.navigationHandoff?.destinationId).toBe("dept_cardiology")
    expect(result.navigationHandoff?.startId).toBe("registration")
    assertNotTokenRequest(result.spoken)
  })

  it("3. create a slip opens registration, not token lookup", async () => {
    const utterance = "Create a slip for me."
    expect(classifyAgentGoal({ intent: intent(), utterance }).goal).toBe(
      "register",
    )
    const plan = planAgentAction({
      intent: intent(),
      utterance,
      context: emptyContext,
    })
    expect(plan).toMatchObject({
      kind: "clarify",
      tool: "register_patient",
    })
    const result = await runAgentTurn({
      intent: intent(),
      utterance,
      client: null,
      messages: en,
      departments: [],
    })
    expect(result.openRegister).toBe(true)
    expect(result.navigateTo).toBe("/register")
    assertNotTokenRequest(result.spoken)
  })

  it("4. register for OPD enters registration flow", async () => {
    const utterance = "Register me for the OPD."
    const plan = planAgentAction({
      intent: intent("registration_help"),
      utterance,
      context: emptyContext,
    })
    expect(plan.kind).toBe("clarify")
    if (plan.kind === "clarify") {
      expect(plan.tool).toBe("register_patient")
      expect(["need_name", "need_age", "need_department"]).toContain(
        plan.messageKey,
      )
    }
    const result = await runAgentTurn({
      intent: intent("registration_help"),
      utterance,
      client: null,
      messages: en,
      departments: [],
    })
    expect(result.openRegister).toBe(true)
    assertNotTokenRequest(result.spoken)
  })

  it("5. find existing slip enters secure retrieval", () => {
    const utterance = "Find my existing slip."
    expect(classifyAgentGoal({ intent: intent(), utterance }).goal).toBe(
      "retrieve_slip",
    )
    const plan = planAgentAction({
      intent: intent(),
      utterance,
      context: emptyContext,
    })
    expect(plan).toEqual({
      kind: "clarify",
      messageKey: "need_token_and_access",
      tool: "token_lookup",
    })
  })

  it("6. queue wait uses verified context or secure lookup", async () => {
    const utterance = "How much longer until my turn?"
    const without = planAgentAction({
      intent: intent(),
      utterance,
      context: emptyContext,
    })
    expect(without).toEqual({
      kind: "clarify",
      messageKey: "need_token_and_access",
      tool: "token_lookup",
    })

    saveSlip({
      token_code: "GM-024",
      access_code: "ABCD2345",
      department_code: "general_medicine",
      department_name_en: "General Medicine",
      department_name_hi: "x",
      room_en: "r",
      room_hi: "r",
      floor_en: "g",
      floor_hi: "g",
      estimated_wait_minutes: 10,
      service_date: "2026-10-25",
    })
    const withSlip = planAgentAction({
      intent: intent("wait_estimate"),
      utterance,
      context: { ...emptyContext, hasVerifiedSlip: true },
    })
    expect(withSlip).toEqual({
      kind: "tool",
      call: { tool: "get_wait_estimate", args: {} },
    })
  })

  it("7. pending token clarify then directions switches to navigation", async () => {
    saveConversationMemory({
      ...loadConversationMemory(),
      lastTopic: "token_lookup",
      lastSpoken: en.agentAskTokenCode,
      tokenLookupDraft: {
        tokenCode: null,
        accessCode: "ABCD2345",
        failedAttempts: 1,
      },
    })

    const result = await runAgentTurn({
      intent: intent("unknown"),
      utterance: "Show me directions to the lab from registration",
      client: null,
      messages: en,
      departments: [],
    })

    expect(result.navigationHandoff?.destinationId).toBe("laboratory")
    expect(result.navigationHandoff?.startId).toBe("registration")
    assertNotTokenRequest(result.spoken)
    expect(loadConversationMemory().tokenLookupDraft).toEqual(
      emptyTokenLookupDraft(),
    )
  })

  it("8. pending route then queue switches to queue handling", async () => {
    saveConversationMemory({
      ...loadConversationMemory(),
      lastTopic: "directions",
      lastDestinationNodeId: "laboratory",
      lastStartNodeId: "entrance",
      lastSpoken: "Walk to the laboratory.",
      tokenLookupDraft: emptyTokenLookupDraft(),
    })

    const plan = planAgentAction({
      intent: intent("unknown"),
      utterance: "Check my queue position",
      context: {
        ...emptyContext,
        conversation: loadConversationMemory(),
      },
    })
    expect(plan.kind).toBe("clarify")
    if (plan.kind === "clarify") {
      expect(plan.tool).toBe("token_lookup")
    }
  })

  it("9. Sarvam unknown does not auto-select token lookup", () => {
    const plan = planAgentAction({
      intent: intent("unknown", { confidence: 0.1 }),
      utterance: "Hello there",
      context: emptyContext,
    })
    expect(plan.kind).toBe("unsupported")
    expect(plan).not.toMatchObject({ tool: "token_lookup" })
  })

  it("10. missing credentials still block protected queue ops", async () => {
    const result = await runAgentTurn({
      intent: intent("current_token"),
      utterance: "What is my token number?",
      client: null,
      messages: en,
      departments: [],
    })
    expect(result.needsMyTurn).toBe(true)
    expect(
      result.spoken === en.agentAskTokenAndAccess ||
        result.spoken === en.agentNeedTokenContext,
    ).toBe(true)
  })

  it("11. emergency wins when services unavailable", async () => {
    saveConversationMemory({
      ...loadConversationMemory(),
      tokenLookupDraft: {
        tokenCode: "GM-024",
        accessCode: null,
        failedAttempts: 2,
      },
      lastTopic: "token_lookup",
    })
    const result = await runAgentTurn({
      intent: intent("emergency"),
      utterance: "Chest pain and check my token",
      client: null,
      messages: en,
      departments: [],
    })
    expect(result.openEmergency).toBe(true)
    expect(result.spoken).toContain(en.emergencyImmediate)
  })

  it("12. text and voice share the same planner path for directions", async () => {
    const utterance = "How do I get to registration from the entrance?"
    const textPlan = planAgentAction({
      intent: intent("unknown"),
      utterance,
      context: emptyContext,
    })
    const voicePlan = planAgentAction({
      intent: intent("accessible_route"),
      utterance,
      context: emptyContext,
    })
    expect(textPlan).toMatchObject({
      kind: "tool",
      call: { tool: "find_route" },
    })
    expect(voicePlan).toMatchObject({
      kind: "tool",
      call: { tool: "find_route" },
    })
    const result = await runAgentTurn({
      intent: intent("accessible_route"),
      utterance,
      client: null,
      messages: en,
      departments: [],
    })
    expect(result.navigationHandoff?.destinationId).toBe("registration")
    expect(result.navigationHandoff?.startId).toBe("entrance")
    assertNotTokenRequest(result.spoken)
  })

  it("does not treat EXISTING as an access code", () => {
    const plan = planAgentAction({
      intent: intent(),
      utterance: "Find my existing slip.",
      context: emptyContext,
    })
    expect(plan).toEqual({
      kind: "clarify",
      messageKey: "need_token_and_access",
      tool: "token_lookup",
    })
  })
})
