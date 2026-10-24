import { afterEach, describe, expect, it } from "vitest"
import { clearAlertDedupe, hasAlertBeenSent, markAlertSent } from "./alertDedupe.ts"

const memory = new Map<string, string>()

function installSessionStorage() {
  memory.clear()
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
      removeItem: (key: string) => {
        memory.delete(key)
      },
    },
  })
}

afterEach(() => {
  memory.clear()
})

describe("alert dedupe", () => {
  it("prevents duplicate notification keys within a session", () => {
    installSessionStorage()
    expect(hasAlertBeenSent("called:A1")).toBe(false)
    markAlertSent("called:A1")
    expect(hasAlertBeenSent("called:A1")).toBe(true)
    markAlertSent("called:A1")
    expect(hasAlertBeenSent("called:A1")).toBe(true)
    clearAlertDedupe()
    expect(hasAlertBeenSent("called:A1")).toBe(false)
  })
})
