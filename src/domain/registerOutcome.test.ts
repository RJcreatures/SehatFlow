import { describe, expect, it, vi } from "vitest"
import { en } from "../i18n/en.ts"
import {
  isRegisterPatientResponse,
  mapRegisterFailure,
  withRegisterTimeout,
} from "./registerOutcome.ts"

describe("mapRegisterFailure", () => {
  it("maps rate limit, full queue, and network failures without inventing tokens", () => {
    expect(
      mapRegisterFailure({
        invokeError: null,
        bodyError: "too many requests",
        messages: en,
      }).kind,
    ).toBe("rate_limit")
    expect(
      mapRegisterFailure({
        invokeError: null,
        bodyError: "department queue is full",
        messages: en,
      }).message,
    ).toBe(en.registerQueueFull)
    expect(
      mapRegisterFailure({
        invokeError: { message: "Failed to send a request to the Edge Function" },
        messages: en,
      }).kind,
    ).toBe("network")
  })

  it("treats timeouts as uncertain outcomes", () => {
    const result = mapRegisterFailure({
      invokeError: null,
      timedOut: true,
      messages: en,
    })
    expect(result.kind).toBe("uncertain")
    expect(result.message).toBe(en.registerUncertain)
  })

  it("does not echo raw SDK strings for patients", () => {
    const result = mapRegisterFailure({
      invokeError: { message: "FunctionsHttpError: weird stack" },
      messages: en,
    })
    expect(result.message).toBe(en.registerFailed)
    expect(result.message).not.toMatch(/FunctionsHttpError|stack/i)
  })
})

describe("withRegisterTimeout", () => {
  it("returns the value when work finishes in time", async () => {
    const raced = await withRegisterTimeout(Promise.resolve({ ok: true }), 50)
    expect(raced).toEqual({ ok: true, value: { ok: true } })
  })

  it("marks a timeout without resolving a fake success", async () => {
    vi.useFakeTimers()
    const pending = new Promise<{ token: string }>(() => {})
    const racedPromise = withRegisterTimeout(pending, 30)
    await vi.advanceTimersByTimeAsync(30)
    await expect(racedPromise).resolves.toEqual({ ok: false, timedOut: true })
    vi.useRealTimers()
  })
})

describe("isRegisterPatientResponse", () => {
  it("requires a real token payload", () => {
    expect(isRegisterPatientResponse(null)).toBe(false)
    expect(
      isRegisterPatientResponse({
        token_code: "GM-1",
        access_code: "ABCD2345",
        department_code: "general_medicine",
        service_date: "2026-10-24",
      }),
    ).toBe(true)
  })
})
