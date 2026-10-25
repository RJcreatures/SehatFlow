import { afterEach, describe, expect, it, vi } from "vitest"
import { createOpaqueId } from "./id.ts"

describe("createOpaqueId", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns a non-empty opaque string with randomUUID when available", () => {
    const id = createOpaqueId()
    expect(id.length).toBeGreaterThan(8)
    expect(id.includes("-")).toBe(false)
  })

  it("falls back when randomUUID throws (insecure context)", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => {
        throw new Error("secure context required")
      },
      getRandomValues: (bytes: Uint8Array) => {
        for (let i = 0; i < bytes.length; i += 1) {
          bytes[i] = (i * 17) % 256
        }
        return bytes
      },
    })
    const id = createOpaqueId()
    expect(id).toMatch(/^[0-9a-f]+$/)
    expect(id.length).toBe(32)
  })

  it("falls back further when crypto is missing", () => {
    vi.stubGlobal("crypto", undefined)
    const id = createOpaqueId()
    expect(id.startsWith("id")).toBe(true)
    expect(id.length).toBeGreaterThan(8)
  })
})
