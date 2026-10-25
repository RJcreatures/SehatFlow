/**
 * Opaque id that works outside secure contexts (e.g. phone on http://LAN:5173).
 * Prefer crypto.randomUUID when available; otherwise getRandomValues / Math.random.
 */
export function createOpaqueId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    try {
      return cryptoApi.randomUUID().replaceAll("-", "")
    } catch {
      // insecure context can expose the method but still throw
    }
  }
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const bytes = new Uint8Array(16)
    cryptoApi.getRandomValues(bytes)
    let out = ""
    for (const byte of bytes) {
      out += byte.toString(16).padStart(2, "0")
    }
    return out
  }
  return `id${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}
