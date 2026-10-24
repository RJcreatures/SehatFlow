import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { en } from "../../i18n/en.ts"
import { saveSlip, clearSlip, loadSlip } from "../../lib/slipStorage.ts"
import {
  clearRegistrationDraft,
  createRegistrationDraft,
  saveIdempotentRegistration,
  saveRegistrationDraft,
} from "./registrationDraft.ts"
import { executeAgentTool, hasVerifiedSlipContext } from "./execute.ts"
import { configuredDepartmentFacts } from "../voice/departmentFacts.ts"

const departments = configuredDepartmentFacts(en)

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

beforeEach(() => {
  installMemorySessionStorage()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockClient(handlers: {
  getMyTurn?: () => Promise<{ data: unknown; error: unknown }>
  register?: () => Promise<{ data: unknown; error: unknown }>
  help?: () => Promise<{ data: unknown; error: unknown }>
}) {
  return {
    functions: {
      invoke: vi.fn(async (name: string) => {
        if (name === "get-my-turn") {
          return handlers.getMyTurn?.() ?? { data: null, error: { message: "fail" } }
        }
        if (name === "register-patient") {
          return handlers.register?.() ?? { data: null, error: { message: "fail" } }
        }
        return { data: null, error: { message: "unknown" } }
      }),
    },
    rpc: vi.fn(async (name: string) => {
      if (name === "request_urgent_help") {
        return handlers.help?.() ?? { data: null, error: { message: "fail" } }
      }
      return { data: null, error: { message: "unknown" } }
    }),
  } as never
}

describe("agent execute — token isolation", () => {
  beforeEach(() => {
    clearSlip()
    clearRegistrationDraft()
  })

  it("refuses get_my_turn without verified slip context", async () => {
    expect(hasVerifiedSlipContext()).toBe(false)
    const result = await executeAgentTool({
      call: { tool: "get_my_turn", args: {} },
      client: mockClient({}),
      messages: en,
      departments,
    })
    expect(result.ok).toBe(false)
    expect(result.needsMyTurn).toBe(true)
    expect(result.spoken).toContain("slip")
  })

  it("retrieves verified token via get-my-turn and never invents it", async () => {
    saveSlip({
      token_code: "GM-12",
      access_code: "ABCD12",
      qr_token: "qr-secret-never-to-model",
      department_code: "general_medicine",
      department_name_en: "General Medicine",
      department_name_hi: "सामान्य चिकित्सा",
      room_en: "G1",
      room_hi: "G1",
      floor_en: "Ground",
      floor_hi: "भूतल",
      estimated_wait_minutes: 18,
      service_date: "2026-10-24",
    })
    const client = mockClient({
      getMyTurn: async () => ({
        data: {
          token_code: "GM-12",
          department_code: "general_medicine",
          department_name_en: "General Medicine",
          department_name_hi: "सामान्य चिकित्सा",
          room_en: "G1",
          room_hi: "G1",
          floor_en: "Ground",
          floor_hi: "भूतल",
          status: "waiting",
          patients_ahead: 3,
          estimated_wait_minutes: 18,
          service_date: "2026-10-24",
        },
        error: null,
      }),
    })
    const result = await executeAgentTool({
      call: { tool: "get_my_turn", args: {} },
      client,
      messages: en,
      departments,
    })
    expect(result.ok).toBe(true)
    expect(result.spoken).toContain("GM-12")
    expect(result.spoken).toMatch(/Waiting|waiting|18|3/i)
    expect(result.tokenUpdate?.token_code).toBe("GM-12")
    expect(result.spoken.toLowerCase()).not.toContain("department:")
    const invoke = (client as { functions: { invoke: ReturnType<typeof vi.fn> } })
      .functions.invoke
    expect(invoke).toHaveBeenCalledWith(
      "get-my-turn",
      expect.objectContaining({
        body: { qr_token: "qr-secret-never-to-model" },
      }),
    )
  })

  it("rejects arbitrary SQL-like tool names", async () => {
    const result = await executeAgentTool({
      call: { tool: "execute_sql", args: { sql: "drop table patients" } },
      client: mockClient({}),
      messages: en,
      departments,
    })
    expect(result.ok).toBe(false)
    expect(result.spoken).toBe(en.agentUnsupportedAction)
  })
})

describe("agent execute — registration", () => {
  beforeEach(() => {
    clearSlip()
    clearRegistrationDraft()
  })

  it("registers via backend and surfaces the real token", async () => {
    const client = mockClient({
      register: async () => ({
        data: {
          token_code: "PED-7",
          access_code: "ZZ99AA",
          qr_token: "qr-new",
          department_code: "pediatrics",
          department_name_en: "Pediatrics",
          department_name_hi: "बाल रोग",
          room_en: "P1",
          room_hi: "P1",
          floor_en: "Ground",
          floor_hi: "भूतल",
          estimated_wait_minutes: 12,
          service_date: "2026-10-24",
        },
        error: null,
      }),
    })
    const result = await executeAgentTool({
      call: {
        tool: "register_patient",
        args: {
          display_name: "Meera",
          age: 8,
          gender: null,
          department_code: "pediatrics",
          idempotency_key: "idempotent-register-1",
        },
      },
      client,
      messages: en,
      departments,
    })
    expect(result.ok).toBe(true)
    expect(result.spoken).toContain("PED-7")
    expect(result.openSlip).toBe(true)
    expect(result.navigateTo).toBe("/slip")
    expect(loadSlip()?.token_code).toBe("PED-7")
  })

  it("reports failure without claiming a token was created", async () => {
    const result = await executeAgentTool({
      call: {
        tool: "register_patient",
        args: {
          display_name: "Meera",
          age: 8,
          gender: null,
          department_code: "pediatrics",
          idempotency_key: "idempotent-register-fail",
        },
      },
      client: mockClient({
        register: async () => ({ data: null, error: { message: "full" } }),
      }),
      messages: en,
      departments,
    })
    expect(result.ok).toBe(false)
    expect(result.spoken).toBe(en.agentRegisterFailed)
    expect(loadSlip()).toBeNull()
  })

  it("returns cached registration for the same idempotency key", async () => {
    saveIdempotentRegistration("idem-dup-key-9999", {
      token_code: "GM-99",
      access_code: "AA11BB",
      qr_token: "qr",
      department_code: "general_medicine",
      department_name_en: "General Medicine",
      department_name_hi: "सामान्य चिकित्सा",
      room_en: "G1",
      room_hi: "G1",
      floor_en: "Ground",
      floor_hi: "भूतल",
      estimated_wait_minutes: 5,
      service_date: "2026-10-24",
    })
    const client = mockClient({
      register: async () => {
        throw new Error("should not call register again")
      },
    })
    const result = await executeAgentTool({
      call: {
        tool: "register_patient",
        args: {
          display_name: "Meera",
          age: 40,
          gender: null,
          department_code: "general_medicine",
          idempotency_key: "idem-dup-key-9999",
        },
      },
      client,
      messages: en,
      departments,
    })
    expect(result.ok).toBe(true)
    expect(result.spoken).toContain("GM-99")
    expect(
      (client as { functions: { invoke: ReturnType<typeof vi.fn> } }).functions
        .invoke,
    ).not.toHaveBeenCalled()
  })
})

describe("agent execute — departments, routes, help, open", () => {
  it("lists configured departments and finds a verified route", async () => {
    const list = await executeAgentTool({
      call: { tool: "list_departments", args: {} },
      client: null,
      messages: en,
      departments,
    })
    expect(list.ok).toBe(true)
    expect(list.spoken).toMatch(/General Medicine|Pediatrics/i)

    const route = await executeAgentTool({
      call: {
        tool: "find_route",
        args: {
          destination_code: "general_medicine",
          start_landmark: "entrance",
          route_mode: "assisted",
        },
      },
      client: null,
      messages: en,
      departments,
    })
    expect(route.ok).toBe(true)
    expect(route.spoken.length).toBeGreaterThan(10)
  })

  it("submits help request and reports acknowledgment honestly", async () => {
    const pending = await executeAgentTool({
      call: { tool: "submit_help_request", args: { department_code: null } },
      client: mockClient({
        help: async () => ({
          data: {
            id: "flag-1",
            status: "open",
            created_at: "2026-10-24T00:00:00Z",
            acknowledged_at: null,
            department_id: null,
            reused: false,
          },
          error: null,
        }),
      }),
      messages: en,
      departments,
    })
    expect(pending.ok).toBe(true)
    expect(pending.spoken).toBe(en.helpRequestPending)

    const ack = await executeAgentTool({
      call: { tool: "submit_help_request", args: { department_code: null } },
      client: mockClient({
        help: async () => ({
          data: {
            id: "flag-1",
            status: "acknowledged",
            created_at: "2026-10-24T00:00:00Z",
            acknowledged_at: "2026-10-24T00:01:00Z",
            department_id: null,
            reused: true,
          },
          error: null,
        }),
      }),
      messages: en,
      departments,
    })
    expect(ack.spoken).toBe(en.helpRequestAcknowledged)
  })

  it("open_destination only reports navigation when a real path is chosen", async () => {
    const result = await executeAgentTool({
      call: { tool: "open_destination", args: { destination: "emergency" } },
      client: null,
      messages: en,
      departments,
    })
    expect(result.ok).toBe(true)
    expect(result.navigateTo).toBe("/emergency")
    expect(result.openEmergency).toBe(true)
  })

  it("does not put credentials into client tool call args", () => {
    const draft = createRegistrationDraft({
      display_name: "Test",
      age: 20,
      department_code: "ent",
    })
    saveRegistrationDraft(draft)
    const serialized = JSON.stringify(draft)
    expect(serialized).not.toMatch(/service_role|SARVAM|access_code|qr_token/)
  })
})
