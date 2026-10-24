import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearSlip,
  isSavedSlip,
  loadSlip,
  loadSlipResult,
  saveSlip,
  type SavedSlip,
} from "./slipStorage.ts"

const sample: Omit<SavedSlip, "saved_at"> = {
  token_code: "GM-042",
  access_code: "ABCD1234",
  qr_token: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl",
  department_code: "general_medicine",
  department_name_en: "General Medicine",
  department_name_hi: "सामान्य चिकित्सा",
  room_en: "Room 12",
  room_hi: "कक्ष 12",
  floor_en: "Ground floor",
  floor_hi: "भूतल",
  estimated_wait_minutes: 25,
  service_date: "2026-10-23",
}

function installMemorySessionStorage() {
  const store = new Map<string, string>()
  const memory: Storage = {
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
  }
  vi.stubGlobal("sessionStorage", memory)
}

beforeEach(() => {
  installMemorySessionStorage()
})

afterEach(() => {
  clearSlip()
  vi.unstubAllGlobals()
})

describe("slipStorage", () => {
  it("returns missing when no slip is saved", () => {
    expect(loadSlipResult()).toEqual({ status: "missing" })
    expect(loadSlip()).toBeNull()
  })

  it("round-trips a valid saved slip including qr_token", () => {
    saveSlip(sample)
    const result = loadSlipResult()
    expect(result.status).toBe("ok")
    if (result.status === "ok") {
      expect(result.slip.token_code).toBe("GM-042")
      expect(result.slip.qr_token).toBe(sample.qr_token)
      expect(isSavedSlip(result.slip)).toBe(true)
    }
  })

  it("rejects incomplete or malformed stored slip data", () => {
    sessionStorage.setItem("sahaayopd.preferences.slip", "{not-json")
    expect(loadSlipResult()).toEqual({ status: "invalid" })

    sessionStorage.setItem(
      "sahaayopd.preferences.slip",
      JSON.stringify({ token_code: "GM-001" }),
    )
    expect(loadSlipResult()).toEqual({ status: "invalid" })
    expect(loadSlip()).toBeNull()
  })

  it("accepts older slips that omit qr_token", () => {
    const { qr_token: _ignored, ...withoutQr } = sample
    saveSlip(withoutQr)
    const result = loadSlipResult()
    expect(result.status).toBe("ok")
    if (result.status === "ok") {
      expect(result.slip.qr_token).toBeUndefined()
    }
  })
})
