/**
 * Short-lived session tickets for browser → voice-realtime WebSocket auth.
 * Browsers cannot set Authorization on WebSocket; tickets are minted over HTTPS
 * via voice-assist (withSupabase) and presented as a query param once.
 */

export type VoiceTicketPayload = {
  lang: string
  exp: number
  jti: string
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

async function sign(secret: string, body: string): Promise<string> {
  const key = await hmacKey(secret)
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  )
  return toBase64Url(new Uint8Array(mac))
}

export async function mintVoiceTicket(input: {
  language: string
  secret: string
  ttlMs?: number
}): Promise<{ ticket: string; expiresAt: number }> {
  const expiresAt = Date.now() + (input.ttlMs ?? 120_000)
  const payload: VoiceTicketPayload = {
    lang: input.language,
    exp: expiresAt,
    jti: crypto.randomUUID(),
  }
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await sign(input.secret, body)
  return { ticket: `${body}.${signature}`, expiresAt }
}

export async function verifyVoiceTicket(input: {
  ticket: string
  secret: string
}): Promise<
  | { ok: true; payload: VoiceTicketPayload }
  | { ok: false; reason: "malformed" | "bad_sig" | "expired" }
> {
  const parts = input.ticket.split(".")
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" }
  }
  const [body, signature] = parts
  const expected = await sign(input.secret, body)
  if (expected !== signature) {
    return { ok: false, reason: "bad_sig" }
  }
  try {
    const json = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as VoiceTicketPayload
    if (
      typeof json.lang !== "string" ||
      typeof json.exp !== "number" ||
      typeof json.jti !== "string"
    ) {
      return { ok: false, reason: "malformed" }
    }
    if (json.exp < Date.now()) {
      return { ok: false, reason: "expired" }
    }
    return { ok: true, payload: json }
  } catch {
    return { ok: false, reason: "malformed" }
  }
}

/** Ticket signing secret: prefer dedicated secret, else SARVAM_API_KEY (server-only). */
export function ticketSigningSecret(): string | null {
  return (
    Deno.env.get("VOICE_TICKET_SECRET")?.trim() ||
    Deno.env.get("SARVAM_API_KEY")?.trim() ||
    null
  )
}
