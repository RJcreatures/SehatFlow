import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { en } from "../../i18n/en.ts"
import { isRoutableNodeId } from "../navigation/hospitalGraph.ts"
import { executeAgentTool } from "./execute.ts"
import { runAgentTurn } from "./runAgent.ts"
import {
  clearConversationMemory,
} from "./conversationContext.ts"
import type { VoiceIntent } from "../voice/intents.ts"
import type { FindLocationState } from "../../pages/FindPage.tsx"

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
  name: VoiceIntent["intent"] = "accessible_route",
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

describe("navigation handoff to Find", () => {
  beforeEach(() => {
    installMemorySessionStorage()
    clearConversationMemory()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("returns valid From/To graph node IDs for departments", async () => {
    const result = await executeAgentTool({
      call: {
        tool: "find_route",
        args: {
          destination_code: "dept_cardiology",
          start_landmark: "entrance",
          route_mode: "assisted",
        },
      },
      client: null,
      messages: en,
      departments: [],
    })

    expect(result.ok).toBe(true)
    expect(result.navigateTo).toBe("/find")
    expect(result.navigationHandoff).toEqual({
      startId: "entrance",
      destinationId: "dept_cardiology",
    })
    expect(isRoutableNodeId(result.navigationHandoff!.startId)).toBe(true)
    expect(isRoutableNodeId(result.navigationHandoff!.destinationId)).toBe(
      true,
    )
  })

  it("supports facility destinations such as washroom and lab", async () => {
    for (const dest of ["washroom_gf", "lab_blood", "reg_desk"] as const) {
      const result = await runAgentTurn({
        intent: intent("accessible_route", { destination_code: dest }),
        utterance:
          dest === "washroom_gf"
            ? "Where is the washroom from registration?"
            : dest === "lab_blood"
              ? "Where is the lab from registration?"
              : "Where is registration from the entrance?",
        client: null,
        messages: en,
        departments: [],
        startId: "entrance",
      })
      if (result.navigationHandoff) {
        expect(isRoutableNodeId(result.navigationHandoff.startId)).toBe(true)
        expect(isRoutableNodeId(result.navigationHandoff.destinationId)).toBe(
          true,
        )
        const state: FindLocationState = {
          fromId: result.navigationHandoff.startId,
          toId: result.navigationHandoff.destinationId,
          showRoute: true,
        }
        expect(state.fromId).toBeTruthy()
        expect(state.toId).toBeTruthy()
      } else {
        // May ask for start or report unknown — never invent a token request.
        expect(result.spoken.length).toBeGreaterThan(0)
        expect(result.spoken).not.toMatch(/token code from the slip/i)
      }
    }
  })

  it("does not invent a handoff for unknown destinations", async () => {
    const result = await executeAgentTool({
      call: {
        tool: "find_route",
        args: {
          destination_code: "dept_not_real",
          start_landmark: "entrance",
          route_mode: "assisted",
        },
      },
      client: null,
      messages: en,
      departments: [],
    })
    expect(result.ok).toBe(false)
    expect(result.navigationHandoff).toBeUndefined()
  })

  it("uses an explicit start landmark and never silent GPS", async () => {
    const result = await runAgentTurn({
      intent: intent("accessible_route"),
      utterance: "How do I get to cardiology from registration?",
      client: null,
      messages: en,
      departments: [],
      startId: "entrance",
    })
    expect(result.navigationHandoff?.destinationId).toBe("dept_cardiology")
    expect(result.navigationHandoff?.startId).toBe("registration")
  })

  it("exposes the same handoff from text-agent turns", async () => {
    const result = await runAgentTurn({
      intent: intent("accessible_route"),
      utterance: "Directions to the laboratory from registration please",
      client: null,
      messages: en,
      departments: [],
      startId: "entrance",
    })
    expect(result.navigationHandoff).toBeTruthy()
    expect(result.navigateTo).toBe("/find")
    const state: FindLocationState = {
      fromId: result.navigationHandoff!.startId,
      toId: result.navigationHandoff!.destinationId,
      showRoute: true,
    }
    expect(isRoutableNodeId(state.fromId!)).toBe(true)
    expect(isRoutableNodeId(state.toId!)).toBe(true)
  })
})
