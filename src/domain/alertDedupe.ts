import { appConfig } from "../config/hospital.ts"

const STORAGE_KEY = `${appConfig.storageKey}.alertDedupe`

/**
 * Session-scoped dedupe for queue notifications / simulated call prompts.
 * Survives polling and soft refreshes within the same browser tab session.
 */
export function hasAlertBeenSent(dedupeKey: string): boolean {
  return loadKeys().has(dedupeKey)
}

export function markAlertSent(dedupeKey: string): void {
  const keys = loadKeys()
  keys.add(dedupeKey)
  saveKeys(keys)
}

export function clearAlertDedupe(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

function loadKeys(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return new Set()
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return new Set()
    }
    return new Set(parsed.filter((item): item is string => typeof item === "string"))
  } catch {
    return new Set()
  }
}

function saveKeys(keys: Set<string>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]))
  } catch {
    // ignore quota / private mode
  }
}
