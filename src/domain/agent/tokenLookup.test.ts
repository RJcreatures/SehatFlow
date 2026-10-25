import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { en } from "../../i18n/en.ts"
import type { AppSupabase } from "../../lib/supabase/queueApi.ts"
import { clearSlip, loadSlip, saveSlip } from "../../lib/slipStorage.ts"
import { executeAgentTool } from "./execute.ts"
import { planAgentAction } from "./plan.ts"
import { runAgentTurn } from "./runAgent.ts"
import {
  clearConversationMemory,
  loadConversationMemory,
  saveConversationMemory,
} from "./conversationContext.ts"
import {
  extractTokenCredentials,
  MAX_TOKEN_LOOKUP_FAILURES,
  mergeTokenLookupDraft,
  tokenLookupReady,
  utteranceWantsTokenLookup,
} from "./tokenLookup.ts"
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
  name: VoiceIntent["intent"],
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

const turnPayload = {
  token_code: "GM-024",
  department_code: "GM",
  department_name_en: "General Medicine",
  department_name_hi: "सामान्य चिकित्सा",
  room_en: "Room 12",
  room_hi: "कमरा 12",
  floor_en: "Ground",
  floor_hi: "भूतल",
  status: "waiting",
  patients_ahead: 3,
  estimated_wait_minutes: 18,
  service_date: "2026-10-25",
}

describe("token lookup credentials", () => {
  it("extracts token and access from an utterance", () => {
    expect(
      extractTokenCredentials("My token is GM-024 and access code is ABCD2345"),
    ).toEqual({ tokenCode: "GM-024", accessCode: "ABCD2345" })
  })

  it("does not treat a bare number as authorized lookup", () => {
    const ready = tokenLookupReady(
      mergeTokenLookupDraft(null, "My token number is 24"),
    )
    expect(ready.ok).toBe(false)
  })

  it("detects lost-slip and check-token phrases", () => {
    expect(utteranceWantsTokenLookup("I lost my slip. Can you help?")).toBe(
      true,
    )
    expect(utteranceWantsTokenLookup("Check my token.")).toBe(true)
    expect(utteranceWantsTokenLookup("Where is cardiology?")).toBe(false)
  })
})

describe("token_lookup planning and execution", () => {
  beforeEach(() => {
    installMemorySessionStorage()
    clearSlip()
    clearConversationMemory()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("clarifies when only a token number is supplied", () => {
    const plan = planAgentAction({
      intent: intent("unknown"),
      utterance: "My token number is GM-024. How long do I wait?",
      context: {
        hasVerifiedSlip: false,
        registrationDraft: null,
        awaitingField: null,
      },
    })
    expect(plan).toEqual({
      kind: "clarify",
      messageKey: "need_access_code",
      tool: "token_lookup",
    })
  })

  it("plans verified lookup when both credentials are present", () => {
    const plan = planAgentAction({
      intent: intent("unknown"),
      utterance: "Token GM-024 access code ABCD2345",
      context: {
        hasVerifiedSlip: false,
        registrationDraft: null,
        awaitingField: null,
      },
    })
    expect(plan).toEqual({
      kind: "tool",
      call: {
        tool: "token_lookup",
        args: { token_code: "GM-024", access_code: "ABCD2345" },
      },
    })
  })

  it("saves slip and returns queue info on valid lookup", async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: turnPayload, error: null }),
      },
    } as unknown as AppSupabase

    const result = await executeAgentTool({
      call: {
        tool: "token_lookup",
        args: { token_code: "GM-024", access_code: "ABCD2345" },
      },
      client,
      messages: en,
      departments: [],
    })

    expect(result.ok).toBe(true)
    expect(result.spoken).toContain("GM-024")
    expect(loadSlip()?.token_code).toBe("GM-024")
    expect(loadSlip()?.access_code).toBe("ABCD2345")
    expect(client.functions.invoke).toHaveBeenCalledWith("get-my-turn", {
      body: { token_code: "GM-024", access_code: "ABCD2345" },
    })
  })

  it("rejects invalid credentials without inventing wait times", async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "invalid token or access code" },
        }),
      },
    } as unknown as AppSupabase

    const result = await executeAgentTool({
      call: {
        tool: "token_lookup",
        args: { token_code: "GM-024", access_code: "ABCD2345" },
      },
      client,
      messages: en,
      departments: [],
    })

    expect(result.ok).toBe(false)
    expect(result.spoken).toBe(en.agentTokenLookupFailed)
    expect(loadSlip()).toBeNull()
  })

  it("rate-limits repeated failed lookups", async () => {
    saveConversationMemory({
      ...loadConversationMemory(),
      tokenLookupDraft: {
        tokenCode: "GM-024",
        accessCode: "WRONG123",
        failedAttempts: MAX_TOKEN_LOOKUP_FAILURES,
      },
    })

    const result = await runAgentTurn({
      intent: intent("unknown"),
      utterance: "Check my token GM-024 WRONG1234",
      client: null,
      messages: en,
      departments: [],
    })

    expect(result.spoken).toBe(en.agentTokenLookupRateLimited)
  })

  it("replaces verified context when another token is supplied", async () => {
    saveSlip({
      token_code: "GM-001",
      access_code: "OLDCODE1",
      department_code: "GM",
      department_name_en: "General Medicine",
      department_name_hi: "सामान्य चिकित्सा",
      room_en: "Room 1",
      room_hi: "कमरा 1",
      floor_en: "Ground",
      floor_hi: "भूतल",
      estimated_wait_minutes: 5,
      service_date: "2026-10-25",
    })

    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: { ...turnPayload, token_code: "PED-009" },
          error: null,
        }),
      },
    } as unknown as AppSupabase

    await executeAgentTool({
      call: {
        tool: "token_lookup",
        args: { token_code: "PED-009", access_code: "NEWCODE1" },
      },
      client,
      messages: en,
      departments: [],
    })

    expect(loadSlip()?.token_code).toBe("PED-009")
    expect(loadSlip()?.access_code).toBe("NEWCODE1")
  })

  it("handles missing backend as a service error", async () => {
    const result = await executeAgentTool({
      call: {
        tool: "token_lookup",
        args: { token_code: "GM-024", access_code: "ABCD2345" },
      },
      client: null,
      messages: en,
      departments: [],
    })
    expect(result.ok).toBe(false)
    expect(result.spoken).toBe(en.backendUnconfigured)
  })
})
