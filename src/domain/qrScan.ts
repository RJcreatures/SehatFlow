import { isQrLookupToken } from "./qrLookup.ts"

/**
 * Extract a SehatFlow opaque QR lookup token from scanner payload text.
 * Accepts the full My Turn URL (`…/my-turn?q=…`) or a bare opaque token.
 * Never logs the raw token.
 */
export function extractQrTokenFromScanText(raw: string): string | null {
  const text = raw.trim()
  if (!text) {
    return null
  }
  if (isQrLookupToken(text)) {
    return text
  }
  try {
    const url = new URL(text)
    const q = url.searchParams.get("q")
    if (q && isQrLookupToken(q)) {
      return q
    }
  } catch {
    // Not a URL — try embedded ?q= in loose text.
  }
  const match = text.match(/[?&]q=([A-Za-z0-9_-]{32,64})/)
  if (match?.[1] && isQrLookupToken(match[1])) {
    return match[1]
  }
  return null
}

/** Stop every track on a MediaStream. Safe to call repeatedly. */
export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) {
    return
  }
  for (const track of stream.getTracks()) {
    try {
      track.stop()
    } catch {
      // ignore already-stopped tracks
    }
  }
}

export type QrDecodeEngine = "barcodeDetector" | "jsqr" | "unavailable"

export function detectQrDecodeEngine(
  barcodeDetectorCtor: unknown = (
    globalThis as { BarcodeDetector?: unknown }
  ).BarcodeDetector,
): QrDecodeEngine {
  if (typeof barcodeDetectorCtor === "function") {
    return "barcodeDetector"
  }
  return "jsqr"
}
