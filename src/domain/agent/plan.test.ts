import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { planAgentAction } from "./plan.ts"
import { createRegistrationDraft } from "./registrationDraft.ts"
import { parseAgentToolCall } from "./validate.ts"
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

function intent(name: VoiceIntent["intent"], extra: Partial<VoiceIntent> = {}): VoiceIntent {
  return {
    intent: name,
    department_code: null,
    destination_code: null,
    start_landmark: null,
    confidence: 0.9,
    ...extra,
  }
}

describe("agent planner tool selection", () => {
  it("selects get_my_turn when slip context is verified", () => {
    const plan = planAgentAction({
      intent: intent("current_token"),
      utterance: "What is my token?",
      context: {
        hasVerifiedSlip: true,
        registrationDraft: null,
        awaitingField: null,
      },
    })
    expect(plan).toEqual({
      kind: "tool",
      call: { tool: "get_my_turn", args: {} },
    })
  })

  it("asks for My Turn when token context is missing", () => {
    const plan = planAgentAction({
      intent: intent("current_token"),
      utterance: "What is my token number?",
      context: {
        hasVerifiedSlip: false,
        registrationDraft: null,
        awaitingField: null,
      },
    })
    expect(plan.kind).toBe("clarify")
    if (plan.kind === "clarify") {
      expect(plan.messageKey).toBe("need_token_context")
    }
  })

  it("plans registration and asks for missing name", () => {
    const plan = planAgentAction({
      intent: intent("registration_help"),
      utterance: "Register me for General Medicine.",
      context: {
        hasVerifiedSlip: false,
        registrationDraft: null,
        awaitingField: null,
      },
    })
    expect(plan.kind).toBe("clarify")
    if (plan.kind === "clarify") {
      expect(plan.tool).toBe("register_patient")
      expect(plan.messageKey).toBe("need_name")
    }
  })

  it("emits register_patient when all required fields are present", () => {
    const draft = createRegistrationDraft({
      display_name: "Asha Devi",
      age: 34,
      department_code: "general_medicine",
      idempotency_key: "idemkey123456",
    })
    const plan = planAgentAction({
      intent: intent("registration_help"),
      utterance: "Register me for General Medicine. My name is Asha Devi, age 34.",
      context: {
        hasVerifiedSlip: false,
        registrationDraft: draft,
        awaitingField: null,
      },
    })
    expect(plan.kind).toBe("tool")
    if (plan.kind === "tool") {
      expect(plan.call.tool).toBe("register_patient")
      if (plan.call.tool === "register_patient") {
        expect(plan.call.args.display_name).toBe("Asha Devi")
        expect(plan.call.args.age).toBe(34)
        expect(plan.call.args.department_code).toBe("general_medicine")
        expect(plan.call.args.idempotency_key).toBe("idemkey123456")
      }
    }
  })

  it("lists departments and opens destinations", () => {
    expect(
      planAgentAction({
        intent: intent("department_info"),
        utterance: "List the departments",
        context: {
          hasVerifiedSlip: false,
          registrationDraft: null,
          awaitingField: null,
        },
      }),
    ).toEqual({ kind: "tool", call: { tool: "list_departments", args: {} } })

    const open = planAgentAction({
      intent: intent("unknown"),
      utterance: "Open my turn",
      context: {
        hasVerifiedSlip: false,
        registrationDraft: null,
        awaitingField: null,
      },
    })
    expect(open).toEqual({
      kind: "tool",
      call: { tool: "open_destination", args: { destination: "my_turn" } },
    })
  })

  it("plans find_route for directions with a known department", () => {
    const plan = planAgentAction({
      intent: intent("accessible_route"),
      utterance: "How do I get to Pediatrics?",
      context: {
        hasVerifiedSlip: false,
        registrationDraft: null,
        awaitingField: null,
      },
    })
    expect(plan.kind).toBe("tool")
    if (plan.kind === "tool") {
      expect(plan.call.tool).toBe("find_route")
      if (plan.call.tool === "find_route") {
        expect(plan.call.args.destination_code).toBe("pediatrics")
      }
    }
  })

  it("rejects forged free-form tools at validation", () => {
    expect(parseAgentToolCall({ tool: "run_sql", args: { q: "select 1" } })).toBeNull()
    expect(
      parseAgentToolCall({
        tool: "register_patient",
        args: {
          display_name: "X",
          age: 20,
          gender: null,
          department_code: "general_medicine",
          idempotency_key: "short",
        },
      }),
    ).toBeNull()
    expect(
      parseAgentToolCall({
        tool: "get_my_turn",
        args: { access_code: "secret", token_code: "GM-1" },
      }),
    ).toEqual({ tool: "get_my_turn", args: {} })
  })
})

describe("registration draft follow-ups", () => {
  beforeEach(() => {
    installMemorySessionStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("accepts a bare name follow-up while awaiting name", () => {
    const draft = createRegistrationDraft({
      department_code: "orthopedics",
    })
    const plan = planAgentAction({
      intent: intent("unknown"),
      utterance: "Ravi Kumar",
      context: {
        hasVerifiedSlip: false,
        registrationDraft: draft,
        awaitingField: "need_name",
      },
    })
    expect(plan.kind).toBe("clarify")
    if (plan.kind === "clarify") {
      expect(plan.messageKey).toBe("need_age")
    }
  })
})
