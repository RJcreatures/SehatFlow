import { describe, expect, it } from "vitest"

/**
 * Mirrors supabase/functions/_shared/voiceTicket.ts HMAC ticket format
 * so browser tests can validate the contract without Deno.
 */
async function mint(language: string, secret: string, ttlMs = 60_000) {
  const payload = {
    lang: language,
    exp: Date.now() + ttlMs,
    jti: "test-jti",
  }
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  )
  const signature = btoa(String.fromCharCode(...new Uint8Array(mac)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
  return `${body}.${signature}`
}

describe("voice session tickets", () => {
  it("mints a two-part ticket that does not embed API keys", async () => {
    const ticket = await mint("hi", "server-secret-only")
    expect(ticket.split(".")).toHaveLength(2)
    expect(ticket).not.toMatch(/SARVAM|sk_|service_role/i)
    const payload = JSON.parse(
      atob(ticket.split(".")[0]!.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { lang: string; exp: number }
    expect(payload.lang).toBe("hi")
    expect(payload.exp).toBeGreaterThan(Date.now())
  })
})
