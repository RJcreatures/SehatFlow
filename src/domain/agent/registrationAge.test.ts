import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { en } from "../../i18n/en.ts"
import {
  applyUtteranceToDraft,
  extractAge,
  extractDisplayName,
  resolveDepartmentCode,
} from "./extract.ts"
import { planAgentAction } from "./plan.ts"
import { createRegistrationDraft } from "./registrationDraft.ts"
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
    confidence: 0,
  }
}

describe("registration age follow-up", () => {
  beforeEach(() => {
    installMemorySessionStorage()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("does not treat years as ENT department", () => {
    expect(resolveDepartmentCode("45 years old")).toBeNull()
    expect(resolveDepartmentCode("ear pain")).toBe("ent")
  })

  it("parses spoken and numeric ages without renaming the patient", () => {
    expect(extractAge("45")).toBe(45)
    expect(extractAge("45 years old")).toBe(45)
    expect(extractAge("twenty five")).toBe(25)
    expect(extractAge("I am forty two")).toBe(42)
    expect(extractDisplayName("twenty five")).toBeNull()
    expect(extractDisplayName("I am 45")).toBeNull()

    const draft = createRegistrationDraft({
      display_name: "Rashmeet",
      department_code: "general_medicine",
    })
    const next = applyUtteranceToDraft(draft, "twenty five", {
      awaitingField: "need_age",
    })
    expect(next.display_name).toBe("Rashmeet")
    expect(next.age).toBe(25)
    expect(next.department_code).toBe("general_medicine")
  })

  it("advances past need_age when the patient answers with a number", async () => {
    const draft = createRegistrationDraft({
      display_name: "Rashmeet",
      department_code: "general_medicine",
    })
    const plan = planAgentAction({
      intent: intent(),
      utterance: "45",
      context: {
        hasVerifiedSlip: false,
        registrationDraft: draft,
        awaitingField: "need_age",
      },
    })
    expect(plan.kind).toBe("tool")
    if (plan.kind === "tool") {
      expect(plan.call.tool).toBe("register_patient")
      if (plan.call.tool === "register_patient") {
        expect(plan.call.args.age).toBe(45)
      }
    }

    const spokenPlan = planAgentAction({
      intent: intent(),
      utterance: "twenty five",
      context: {
        hasVerifiedSlip: false,
        registrationDraft: draft,
        awaitingField: "need_age",
      },
    })
    expect(spokenPlan.kind).toBe("tool")
    if (spokenPlan.kind === "tool" && spokenPlan.call.tool === "register_patient") {
      expect(spokenPlan.call.args.age).toBe(25)
      expect(spokenPlan.call.args.display_name).toBe("Rashmeet")
    }

    const result = await runAgentTurn({
      intent: intent(),
      utterance: "45 years old",
      client: null,
      messages: en,
      departments: [],
      awaitingField: "need_age",
      draft,
    })
    // Without a backend the register tool fails, but it must not re-ask age.
    expect(result.spoken).not.toBe(en.agentAskAge)
    expect(result.awaitingField).not.toBe("need_age")
  })
})
