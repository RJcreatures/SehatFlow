import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { en } from "../../i18n/en.ts"
import {
  clearConversationMemory,
  loadConversationMemory,
} from "./conversationContext.ts"
import { planAgentAction } from "./plan.ts"
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

function intent(name: VoiceIntent["intent"] = "unknown"): VoiceIntent {
  return {
    intent: name,
    department_code: null,
    destination_code: null,
    start_landmark: null,
    confidence: 0.9,
  }
}

describe("directions ask for start location", () => {
  beforeEach(() => {
    installMemorySessionStorage()
    clearConversationMemory()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("does not silently start from the main entrance", async () => {
    const plan = planAgentAction({
      intent: intent(),
      utterance: "Where is cardiology?",
      context: {
        hasVerifiedSlip: false,
        registrationDraft: null,
        awaitingField: null,
        defaultStartId: "entrance",
      },
    })
    expect(plan).toMatchObject({
      kind: "clarify",
      messageKey: "need_start",
      tool: "find_route",
      pendingDestination: "dept_cardiology",
    })

    const first = await runAgentTurn({
      intent: intent(),
      utterance: "Give me directions to the laboratory.",
      client: null,
      messages: en,
      departments: [],
    })
    expect(first.spoken).toBe(en.agentAskStart)
    expect(first.navigationHandoff).toBeFalsy()
    expect(loadConversationMemory().lastDestinationNodeId).toBe("laboratory")
    expect(loadConversationMemory().lastStartNodeId).toBeNull()
  })

  it("completes the route after the patient names a start", async () => {
    await runAgentTurn({
      intent: intent(),
      utterance: "Where is the lab?",
      client: null,
      messages: en,
      departments: [],
    })

    const second = await runAgentTurn({
      intent: intent(),
      utterance: "registration",
      client: null,
      messages: en,
      departments: [],
      awaitingField: "need_start",
    })

    expect(second.navigationHandoff).toEqual({
      startId: "registration",
      destinationId: "laboratory",
    })
    expect(second.spoken).not.toBe(en.agentAskStart)
  })

  it("uses an explicit from→to without asking again", () => {
    const plan = planAgentAction({
      intent: intent("accessible_route"),
      utterance: "How do I get to cardiology from registration?",
      context: {
        hasVerifiedSlip: false,
        registrationDraft: null,
        awaitingField: null,
      },
    })
    expect(plan).toMatchObject({
      kind: "tool",
      call: {
        tool: "find_route",
        args: {
          destination_code: "dept_cardiology",
          start_landmark: "registration",
        },
      },
    })
  })
})
