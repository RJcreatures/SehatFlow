import { afterEach, describe, expect, it, vi } from "vitest"
import { generateQrLookupToken } from "./qrLookup.ts"
import {
  detectQrDecodeEngine,
  extractQrTokenFromScanText,
  stopMediaStream,
} from "./qrScan.ts"

describe("QR scan payload parsing", () => {
  it("accepts bare opaque tokens and staff or legacy My Turn URLs", () => {
    const token = generateQrLookupToken()
    expect(extractQrTokenFromScanText(token)).toBe(token)
    expect(
      extractQrTokenFromScanText(`https://demo.example/staff?q=${token}`),
    ).toBe(token)
    expect(
      extractQrTokenFromScanText(`https://demo.example/my-turn?q=${token}`),
    ).toBe(token)
    expect(
      extractQrTokenFromScanText(`https://demo.example/staff?q=${token}&x=1`),
    ).toBe(token)
  })

  it("rejects malformed, short, or unrelated payloads", () => {
    expect(extractQrTokenFromScanText("")).toBeNull()
    expect(extractQrTokenFromScanText("short")).toBeNull()
    expect(extractQrTokenFromScanText("https://example.com/other")).toBeNull()
    expect(
      extractQrTokenFromScanText("https://demo.example/my-turn?q=not-valid!!"),
    ).toBeNull()
  })

  it("never requires logging the raw token to succeed", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    const token = generateQrLookupToken()
    expect(extractQrTokenFromScanText(token)).toBe(token)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe("camera stream cleanup", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("stops all tracks and tolerates null streams", () => {
    const stop = vi.fn()
    const stream = {
      getTracks: () => [{ stop }, { stop }],
    } as unknown as MediaStream
    stopMediaStream(null)
    stopMediaStream(undefined)
    stopMediaStream(stream)
    expect(stop).toHaveBeenCalledTimes(2)
  })
})

describe("decode engine selection", () => {
  it("prefers BarcodeDetector when present", () => {
    expect(detectQrDecodeEngine(function BarcodeDetector() {})).toBe(
      "barcodeDetector",
    )
    expect(detectQrDecodeEngine(undefined)).toBe("jsqr")
  })
})
