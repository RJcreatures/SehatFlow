import { describe, expect, it } from "vitest"
import { buildRealtimeWsUrl, decodeBase64Audio } from "./realtimeClient.ts"

describe("realtime client helpers", () => {
  it("builds a ticketed WebSocket URL without embedding secrets as path segments", () => {
    const url = buildRealtimeWsUrl({
      supabaseUrl: "https://example.supabase.co",
      publishableKey: "publishable-demo",
      ticket: "abc.def",
    })
    expect(url.startsWith("wss://example.supabase.co/functions/v1/voice-realtime")).toBe(
      true,
    )
    expect(url).toContain("ticket=abc.def")
    expect(url).toContain("apikey=publishable-demo")
    expect(url).not.toMatch(/service_role|SARVAM|sk_/i)
  })

  it("strips a pasted /rest/v1 project URL before building the WS path", () => {
    const url = buildRealtimeWsUrl({
      supabaseUrl: "https://example.supabase.co/rest/v1/",
      publishableKey: "publishable-demo",
      ticket: "abc.def",
    })
    expect(url.startsWith("wss://example.supabase.co/functions/v1/voice-realtime")).toBe(
      true,
    )
    expect(url).not.toContain("/rest/v1/")
  })

  it("decodes base64 audio chunks", () => {
    const buffer = decodeBase64Audio(btoa("hello"))
    expect(new TextDecoder().decode(buffer)).toBe("hello")
  })
})
