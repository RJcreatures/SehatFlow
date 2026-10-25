import { getSupabaseClient, readSupabaseState } from "./client.ts"
import { ensureDemoQueue } from "./queueApi.ts"

const COOLDOWN_MS = 60_000

let lastAttemptMs = 0
let inFlight: Promise<void> | null = null

/**
 * Keeps the fictional hospital board looking alive for judges.
 * Server-side ensure_demo_queue is idempotent (advisory lock + sparse check).
 * Client cooldown avoids RPC spam from remounts / Strict Mode.
 */
export function ensureDemoQueueOnce(): Promise<void> {
  if (inFlight) {
    return inFlight
  }

  const now = Date.now()
  if (now - lastAttemptMs < COOLDOWN_MS) {
    return Promise.resolve()
  }

  const state = readSupabaseState(import.meta.env)
  const client = getSupabaseClient()
  if (state.status !== "ready" || !client) {
    return Promise.resolve()
  }

  lastAttemptMs = now
  inFlight = ensureDemoQueue(client)
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      inFlight = null
    })

  return inFlight
}
