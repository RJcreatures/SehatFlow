import { describe, expect, it } from "vitest"
import {
  buildQrScanUrl,
  captureQrTokenFromSearch,
  generateQrLookupToken,
  isQrLookupToken,
  resolvePublicAppOrigin,
  sha256Hex,
} from "./qrLookup.ts"

describe("QR lookup tokens", () => {
  it("generates unique opaque tokens", () => {
    const a = generateQrLookupToken()
    const b = generateQrLookupToken()
    expect(isQrLookupToken(a)).toBe(true)
    expect(isQrLookupToken(b)).toBe(true)
    expect(a).not.toBe(b)
    expect(a.length).toBe(32)
  })

  it("hashes tokens for vault storage without returning the raw value", async () => {
    const token = generateQrLookupToken()
    const hash = await sha256Hex(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toBe(token)
    expect(await sha256Hex(token)).toBe(hash)
  })

  it("builds a public my-turn URL with only the opaque token", () => {
    const url = buildQrScanUrl("https://demo.example.com/", "Abcdefghijklmnopqrstuvwxyz012345")
    expect(url).toBe(
      "https://demo.example.com/my-turn?q=Abcdefghijklmnopqrstuvwxyz012345",
    )
    expect(url.includes("access")).toBe(false)
  })

  it("captures and cleans the QR token from the scan URL", () => {
    const captured = captureQrTokenFromSearch(
      "?q=Abcdefghijklmnopqrstuvwxyz012345&utm=1",
    )
    expect(captured.qrToken).toBe("Abcdefghijklmnopqrstuvwxyz012345")
    expect(captured.cleanedSearch).toBe("?utm=1")
    expect(captureQrTokenFromSearch("?q=short").qrToken).toBeNull()
  })

  it("prefers the configured public app URL over localhost", () => {
    expect(
      resolvePublicAppOrigin({
        configured: "https://sahaay.example/",
        windowOrigin: "http://127.0.0.1:5173",
      }),
    ).toBe("https://sahaay.example")
  })
})
