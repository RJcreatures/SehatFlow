const ACCESS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const QR_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
const GENDERS = new Set(["female", "male", "other", "undisclosed"])

export type RegisterBody = {
  display_name?: unknown
  age?: unknown
  gender?: unknown
  department_code?: unknown
}

export type MyTurnBody = {
  token_code?: unknown
  access_code?: unknown
  qr_token?: unknown
}

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") ?? "*"
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: corsHeaders(req),
  })
}

export function generateAccessCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  let code = ""
  for (let index = 0; index < 8; index += 1) {
    code += ACCESS_ALPHABET[bytes[index]! % ACCESS_ALPHABET.length]
  }
  return code
}

/** Opaque URL-safe QR lookup token (43 chars from 32 random bytes). */
export function generateQrToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let token = ""
  for (let index = 0; index < bytes.length; index += 1) {
    token += QR_ALPHABET[bytes[index]! % QR_ALPHABET.length]
  }
  return token
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export function parseRegisterBody(
  body: RegisterBody,
):
  | {
      ok: true
      display_name: string
      age: number
      gender: string | null
      department_code: string
    }
  | { ok: false; message: string } {
  if (typeof body.display_name !== "string") {
    return { ok: false, message: "invalid registration input" }
  }
  const display_name = body.display_name.trim().replace(/\s+/g, " ")
  if (display_name.length < 1 || display_name.length > 80) {
    return { ok: false, message: "invalid registration input" }
  }

  if (typeof body.age !== "number" || !Number.isInteger(body.age)) {
    return { ok: false, message: "invalid registration input" }
  }
  if (body.age < 0 || body.age > 120) {
    return { ok: false, message: "invalid registration input" }
  }

  let gender: string | null = null
  if (body.gender !== null && body.gender !== undefined && body.gender !== "") {
    if (typeof body.gender !== "string" || !GENDERS.has(body.gender)) {
      return { ok: false, message: "invalid registration input" }
    }
    gender = body.gender
  }

  if (
    typeof body.department_code !== "string" ||
    !/^[a-z0-9_]{2,32}$/.test(body.department_code)
  ) {
    return { ok: false, message: "invalid registration input" }
  }

  return {
    ok: true,
    display_name,
    age: body.age,
    gender,
    department_code: body.department_code,
  }
}

export function parseMyTurnBody(
  body: MyTurnBody,
):
  | { ok: true; mode: "access"; token_code: string; access_code: string }
  | { ok: true; mode: "qr"; qr_token: string }
  | { ok: false; message: string } {
  if (typeof body.qr_token === "string" && body.qr_token.trim().length > 0) {
    const qr_token = body.qr_token.trim()
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(qr_token)) {
      return { ok: false, message: "invalid or expired QR code" }
    }
    return { ok: true, mode: "qr", qr_token }
  }

  if (typeof body.token_code !== "string" || typeof body.access_code !== "string") {
    return { ok: false, message: "invalid token or access code" }
  }
  const token_code = body.token_code.trim().toUpperCase()
  const access_code = body.access_code.trim().toUpperCase()
  if (
    !/^[A-Z0-9]{1,8}-[0-9]{1,4}$/.test(token_code) ||
    !/^[A-Z0-9]{8}$/.test(access_code)
  ) {
    return { ok: false, message: "invalid token or access code" }
  }
  return { ok: true, mode: "access", token_code, access_code }
}

/** Very small per-isolate rate limit for public patient endpoints. */
const hits = new Map<string, { count: number; resetAt: number }>()

export function allowRequest(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now()
  const current = hits.get(key)
  if (!current || current.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (current.count >= limit) {
    return false
  }
  current.count += 1
  return true
}

export function clientKey(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  )
}

export function myTurnJson(row: Record<string, unknown>) {
  return {
    token_code: row.token_code,
    department_code: row.department_code,
    department_name_en: row.department_name_en,
    department_name_hi: row.department_name_hi,
    room_en: row.room_en,
    room_hi: row.room_hi,
    floor_en: row.floor_en,
    floor_hi: row.floor_hi,
    status: row.status,
    patients_ahead: row.patients_ahead,
    estimated_wait_minutes: row.estimated_wait_minutes,
    service_date: row.service_date,
  }
}
