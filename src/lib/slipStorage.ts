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

export type LoadSlipResult =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "ok"; slip: SavedSlip }

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

export function loadSlipResult(): LoadSlipResult {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) {
      return { status: "missing" }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { status: "invalid" }
    }
    if (!isSavedSlip(parsed)) {
      return { status: "invalid" }
    }
    return { status: "ok", slip: parsed }
  } catch {
    return { status: "invalid" }
  }
}

export function loadSlip(): SavedSlip | null {
  const result = loadSlipResult()
  return result.status === "ok" ? result.slip : null
}

export function clearSlip(): void {
  try {
    sessionStorage.removeItem(storageKey)
  } catch {
    // ignore
  }
}

export function isSavedSlip(value: unknown): value is SavedSlip {
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
    Number.isFinite(record.estimated_wait_minutes) &&
    typeof record.service_date === "string" &&
    typeof record.saved_at === "string"
  )
}
