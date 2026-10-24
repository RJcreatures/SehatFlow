import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { staffCan } from "./roles.ts"
import {
  createHelpRequestKey,
  HELP_REQUEST_QUEUE_SAFE,
  isStoredHelpRequest,
  loadHelpRequest,
  saveHelpRequest,
} from "./helpRequest.ts"

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

describe("patient help request helpers", () => {
  it("creates stable idempotency keys and stores open requests", () => {
    const key = createHelpRequestKey(() => "11111111-2222-3333-4444-555555555555")
    expect(key).toBe("11111111222233334444555555555555")
    expect(key.length).toBeGreaterThanOrEqual(8)

    saveHelpRequest({
      requestKey: key,
      flagId: "flag-1",
      status: "open",
      createdAt: "2026-10-24T10:00:00.000Z",
      acknowledgedAt: null,
    })
    const loaded = loadHelpRequest()
    expect(loaded?.flagId).toBe("flag-1")
    expect(loaded?.status).toBe("open")
    expect(isStoredHelpRequest(loaded)).toBe(true)
  })

  it("rejects malformed stored help requests", () => {
    sessionStorage.setItem("sahaayopd.preferences.helpRequest", '{"flagId":"x"}')
    expect(loadHelpRequest()).toBeNull()
  })

  it("keeps help acknowledgment separate from routine queue mutations", () => {
    expect(HELP_REQUEST_QUEUE_SAFE).toBe(true)
    expect(staffCan("admin", "acknowledge_urgent")).toBe(true)
    expect(staffCan("queue_manager", "acknowledge_urgent")).toBe(true)
    expect(staffCan("doctor", "acknowledge_urgent")).toBe(false)
    expect(staffCan("registrar", "acknowledge_urgent")).toBe(false)
    // Acknowledgment capability is not a queue reorder action.
    expect(staffCan("admin", "call_next")).toBe(true)
    expect(staffCan("admin", "acknowledge_urgent")).not.toBe(
      staffCan("doctor", "call_next"),
    )
  })
})
