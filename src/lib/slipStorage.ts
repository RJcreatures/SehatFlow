import { appConfig } from "../config/hospital.ts"

export type SavedSlip = {
  token_code: string
  access_code: string
  /** Opaque QR lookup token; present for slips issued after Stage 2. */
  qr_token?: string
  department_code: string
  department_name_en: string
  department_name_hi: string
  room_en: string
  room_hi: string
  floor_en: string
  floor_hi: string
  estimated_wait_minutes: number
  service_date: string
  saved_at: string
}

const storageKey = `${appConfig.storageKey}.slip`

export function saveSlip(slip: Omit<SavedSlip, "saved_at">): void {
  const payload: SavedSlip = {
    ...slip,
    saved_at: new Date().toISOString(),
  }
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(payload))
  } catch {
    // sessionStorage may be unavailable; the slip screen still shows in-memory data.
  }
}

export function loadSlip(): SavedSlip | null {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (!isSavedSlip(parsed)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearSlip(): void {
  try {
    sessionStorage.removeItem(storageKey)
  } catch {
    // ignore
  }
}

function isSavedSlip(value: unknown): value is SavedSlip {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  const qrOk =
    record.qr_token === undefined || typeof record.qr_token === "string"
  return (
    typeof record.token_code === "string" &&
    typeof record.access_code === "string" &&
    qrOk &&
    typeof record.department_code === "string" &&
    typeof record.department_name_en === "string" &&
    typeof record.department_name_hi === "string" &&
    typeof record.room_en === "string" &&
    typeof record.room_hi === "string" &&
    typeof record.floor_en === "string" &&
    typeof record.floor_hi === "string" &&
    typeof record.estimated_wait_minutes === "number" &&
    typeof record.service_date === "string" &&
    typeof record.saved_at === "string"
  )
}
