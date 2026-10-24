import { appConfig } from "../config/hospital.ts"

export type StoredHelpRequest = {
  requestKey: string
  flagId: string
  status: "open" | "acknowledged"
  createdAt: string
  acknowledgedAt: string | null
}

const storageKey = `${appConfig.storageKey}.helpRequest`

export function createHelpRequestKey(
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  return randomUUID().replaceAll("-", "")
}

export function loadHelpRequest(): StoredHelpRequest | null {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (!isStoredHelpRequest(parsed)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function saveHelpRequest(value: StoredHelpRequest): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    // sessionStorage may be unavailable; UI still shows in-memory state.
  }
}

export function clearHelpRequest(): void {
  try {
    sessionStorage.removeItem(storageKey)
  } catch {
    // ignore
  }
}

export function isStoredHelpRequest(value: unknown): value is StoredHelpRequest {
  if (!value || typeof value !== "object") {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.requestKey === "string" &&
    record.requestKey.length >= 8 &&
    typeof record.flagId === "string" &&
    (record.status === "open" || record.status === "acknowledged") &&
    typeof record.createdAt === "string" &&
    (record.acknowledgedAt === null || typeof record.acknowledgedAt === "string")
  )
}

/** Help requests must never be treated as queue reorder operations. */
export const HELP_REQUEST_QUEUE_SAFE = true as const
