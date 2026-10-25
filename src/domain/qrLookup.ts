const QR_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

/** Matches the Edge Function opaque QR token shape (32–64 URL-safe chars). */
export const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/

/**
 * Cryptographically random QR lookup token.
 * The production token is generated in the register-patient Edge Function;
 * this helper mirrors that algorithm for tests and local tooling.
 */
export function generateQrLookupToken(
  randomBytes: (size: number) => Uint8Array = (size) =>
    crypto.getRandomValues(new Uint8Array(size)),
): string {
  const bytes = randomBytes(32)
  let token = ""
  for (let index = 0; index < bytes.length; index += 1) {
    token += QR_ALPHABET[bytes[index]! % QR_ALPHABET.length]
  }
  return token
}

export function isQrLookupToken(value: string): boolean {
  return QR_TOKEN_PATTERN.test(value)
}

/** Normalize a public app origin; strip trailing slash. */
export function normalizeAppOrigin(raw: string): string {
  return raw.trim().replace(/\/+$/, "")
}

/**
 * Coerce a configured host or URL into a usable http(s) origin.
 * Accepts values missing a scheme (common .env mistake) by assuming https.
 * Returns null when the value cannot form a valid URL base.
 */
export function coerceHttpOrigin(raw: string): string | null {
  const trimmed = normalizeAppOrigin(raw)
  if (!trimmed) {
    return null
  }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null
    }
    return normalizeAppOrigin(url.origin)
  } catch {
    return null
  }
}

/**
 * Build the scannable staff URL. Only the opaque QR token is included —
 * never the access code or personal data. Staff scan this to identify
 * which patient / token a slip belongs to.
 */
export function buildQrScanUrl(appOrigin: string, qrToken: string): string {
  const origin = coerceHttpOrigin(appOrigin)
  if (!origin) {
    throw new Error(`Invalid public app origin: ${appOrigin}`)
  }
  const url = new URL("/staff", `${origin}/`)
  url.searchParams.set("q", qrToken)
  return url.toString()
}

export function resolvePublicAppOrigin(input: {
  configured?: string | null
  windowOrigin?: string | null
}): string {
  const configured = input.configured?.trim()
  if (configured) {
    const origin = coerceHttpOrigin(configured)
    if (origin) {
      return origin
    }
  }
  if (input.windowOrigin) {
    const origin = coerceHttpOrigin(input.windowOrigin)
    if (origin) {
      return origin
    }
  }
  return "http://127.0.0.1:5173"
}

/**
 * Capture `?q=` from a location search string and return the cleaned search
 * (without the QR token). Caller should replaceState with the cleaned URL.
 */
export function captureQrTokenFromSearch(search: string): {
  qrToken: string | null
  cleanedSearch: string
} {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  )
  const raw = params.get("q")
  params.delete("q")
  const remaining = params.toString()
  const cleanedSearch = remaining ? `?${remaining}` : ""
  if (!raw || !isQrLookupToken(raw)) {
    return { qrToken: null, cleanedSearch }
  }
  return { qrToken: raw, cleanedSearch }
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
