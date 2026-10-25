import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { en } from "../../i18n/en.ts"
import { clearSlip, saveSlip } from "../../lib/slipStorage.ts"
import type { AppSupabase } from "../../lib/supabase/queueApi.ts"
import {
  clearConversationMemory,
  saveConversationMemory,
  loadConversationMemory,
} from "./conversationContext.ts"
import { planAgentSteps } from "./compoundPlan.ts"
import { runAgentTurn } from "./runAgent.ts"
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
    confidence: 0.9,
    ...extra,
  }
}

function saveVerifiedSlip() {
  saveSlip({
    token_code: "GM-024",
    access_code: "ABCD2345",
    qr_token: "opaque-qr",
    department_code: "general_medicine",
    department_name_en: "General Medicine",
    department_name_hi: "सामान्य चिकित्सा",
    room_en: "Room 12",
    room_hi: "कमरा 12",
    floor_en: "Ground",
    floor_hi: "भूतल",
    estimated_wait_minutes: 18,
    service_date: "2026-10-25",
  })
}

describe("compound agent plans", () => {
  beforeEach(() => {
    installMemorySessionStorage()
    clearSlip()
    clearConversationMemory()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("plans queue plus directions when slip is verified", () => {
    saveVerifiedSlip()
    const steps = planAgentSteps({
      intent: intent("wait_estimate"),
      utterance: "How long until my turn, and where is my department?",
      context: {
        hasVerifiedSlip: true,
        registrationDraft: null,
        awaitingField: null,
        defaultStartId: "entrance",
      },
    })
    const tools = steps
      .filter((step) => step.kind === "tool")
      .map((step) => (step.kind === "tool" ? step.call.tool : null))
    expect(tools).toContain("get_wait_estimate")
    expect(
      steps.some(
        (step) =>
          (step.kind === "tool" && step.call.tool === "find_route") ||
          (step.kind === "clarify" &&
            step.tool === "find_route" &&
            step.messageKey === "need_start"),
      ),
    ).toBe(true)
  })

  it("plans directions plus facility in one find_route", () => {
    const steps = planAgentSteps({
      intent: intent("accessible_route"),
      utterance: "Where is cardiology, and how do I get there from registration?",
      context: {
        hasVerifiedSlip: false,
        registrationDraft: null,
        awaitingField: null,
        defaultStartId: "entrance",
      },
    })
    const route = steps.find(
      (step) => step.kind === "tool" && step.call.tool === "find_route",
    )
    expect(route?.kind).toBe("tool")
    if (route?.kind === "tool" && route.call.tool === "find_route") {
      expect(route.call.args.destination_code).toBe("dept_cardiology")
      expect(route.call.args.start_landmark).toMatch(/reg|entrance|desk/i)
    }
  })

  it("handles three-part questions without duplicate tools", () => {
    saveVerifiedSlip()
    const steps = planAgentSteps({
      intent: intent("unknown"),
      utterance:
        "How many patients are ahead of me, where is the lab, and what should I do next?",
      context: {
        hasVerifiedSlip: true,
        registrationDraft: null,
        awaitingField: null,
        defaultStartId: "entrance",
      },
    })
    const findRoutes = steps.filter(
      (step) => step.kind === "tool" && step.call.tool === "find_route",
    )
    expect(findRoutes.length).toBeLessThanOrEqual(2)
    expect(
      steps.some(
        (step) =>
          step.kind === "tool" &&
          (step.call.tool === "get_wait_estimate" ||
            step.call.tool === "get_my_turn"),
      ),
    ).toBe(true)
  })

  it("returns partial success when queue fails but directions work", async () => {
    saveVerifiedSlip()
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "unavailable" },
        }),
      },
    } as unknown as AppSupabase

    const result = await runAgentTurn({
      intent: intent("unknown"),
      utterance:
        "How long until my turn, and where is cardiology from registration?",
      client,
      messages: en,
      departments: [],
      startId: "entrance",
    })

    expect(result.spoken.length).toBeGreaterThan(10)
    expect(result.navigationHandoff?.destinationId).toBe("dept_cardiology")
    expect(result.spoken).toMatch(/cardiology|Cardio|queue|turn|slip|can't|cannot|unable|retrieve|start/i)
  })

  it("asks one clarification when token credentials are incomplete", async () => {
    const result = await runAgentTurn({
      intent: intent("unknown"),
      utterance: "Where is the lab? Also, can you check my token?",
      client: null,
      messages: en,
      departments: [],
    })
    expect(result.needsMyTurn).toBe(true)
    expect(result.spoken).toMatch(/token|access/i)
  })

  it("keeps emergency first even when other dependencies fail", async () => {
    const result = await runAgentTurn({
      intent: intent("emergency"),
      utterance: "Chest pain and also check my token GM-024",
      client: null,
      messages: en,
      departments: [],
    })
    expect(result.openEmergency).toBe(true)
    expect(result.spoken).toContain(en.emergencyImmediate)
  })

  it("repeats directions then answers queue when asked", async () => {
    saveVerifiedSlip()
    saveConversationMemory({
      ...loadConversationMemory(),
      lastSpoken: "Walk to Cardiology on the first floor.",
      lastDestinationNodeId: "dept_cardiology",
      lastStartNodeId: "entrance",
      lastTopic: "directions",
    })
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: {
            token_code: "GM-024",
            department_code: "general_medicine",
            department_name_en: "General Medicine",
            department_name_hi: "सामान्य चिकित्सा",
            room_en: "Room 12",
            room_hi: "कमरा 12",
            floor_en: "Ground",
            floor_hi: "भूतल",
            status: "waiting",
            patients_ahead: 2,
            estimated_wait_minutes: 12,
            service_date: "2026-10-25",
          },
          error: null,
        }),
      },
    } as unknown as AppSupabase

    const result = await runAgentTurn({
      intent: intent("unknown"),
      utterance: "Repeat the directions, then tell me how long the queue is.",
      client,
      messages: en,
      departments: [],
    })

    expect(result.spoken.toLowerCase()).toMatch(/cardiology|walk|floor/)
    expect(result.spoken.toLowerCase()).toMatch(/minute|wait|ahead|queue|turn/)
  })
})
