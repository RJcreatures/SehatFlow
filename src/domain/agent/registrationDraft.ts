import { appConfig } from "../../config/hospital.ts"
import { createOpaqueId } from "../../lib/id.ts"
import type { RegisterPatientResponse } from "../../lib/supabase/patientApi.ts"
import type { RegistrationDraft } from "./types.ts"

const draftKey = `${appConfig.storageKey}.agentRegisterDraft`
const idempotencyStoreKey = `${appConfig.storageKey}.agentRegisterIdempotency`

export type IdempotentRegistration = {
  key: string
  response: RegisterPatientResponse
  savedAt: string
}

export function createRegistrationDraft(
  partial?: Partial<RegistrationDraft>,
): RegistrationDraft {
  return {
    display_name: partial?.display_name ?? null,
    age: partial?.age ?? null,
    gender: partial?.gender ?? null,
    department_code: partial?.department_code ?? null,
    idempotency_key: partial?.idempotency_key ?? createOpaqueId(),
  }
}

export function mergeRegistrationDraft(
  current: RegistrationDraft,
  patch: Partial<Omit<RegistrationDraft, "idempotency_key">>,
): RegistrationDraft {
  return {
    ...current,
    display_name:
      patch.display_name !== undefined
        ? patch.display_name
        : current.display_name,
    age: patch.age !== undefined ? patch.age : current.age,
    gender: patch.gender !== undefined ? patch.gender : current.gender,
    department_code:
      patch.department_code !== undefined
        ? patch.department_code
        : current.department_code,
  }
}

export function registrationDraftReady(
  draft: RegistrationDraft,
): draft is RegistrationDraft & {
  display_name: string
  age: number
  department_code: string
} {
  return (
    typeof draft.display_name === "string" &&
    draft.display_name.trim().length > 0 &&
    typeof draft.age === "number" &&
    Number.isInteger(draft.age) &&
    draft.age >= 0 &&
    draft.age <= 120 &&
    typeof draft.department_code === "string" &&
    draft.department_code.length > 0
  )
}

export function missingRegistrationField(
  draft: RegistrationDraft,
): "need_department" | "need_name" | "need_age" | null {
  if (!draft.department_code) {
    return "need_department"
  }
  if (!draft.display_name?.trim()) {
    return "need_name"
  }
  if (draft.age == null) {
    return "need_age"
  }
  return null
}

export function loadRegistrationDraft(): RegistrationDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey)
    if (!raw) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") {
      return null
    }
    const record = parsed as Record<string, unknown>
    if (typeof record.idempotency_key !== "string") {
      return null
    }
    return {
      display_name:
        typeof record.display_name === "string" ? record.display_name : null,
      age: typeof record.age === "number" ? record.age : null,
      gender:
        record.gender === "female" ||
        record.gender === "male" ||
        record.gender === "other" ||
        record.gender === "undisclosed"
          ? record.gender
          : null,
      department_code:
        typeof record.department_code === "string"
          ? record.department_code
          : null,
      idempotency_key: record.idempotency_key,
    }
  } catch {
    return null
  }
}

export function saveRegistrationDraft(draft: RegistrationDraft): void {
  try {
    sessionStorage.setItem(draftKey, JSON.stringify(draft))
  } catch {
    /* ignore */
  }
}

export function clearRegistrationDraft(): void {
  try {
    sessionStorage.removeItem(draftKey)
  } catch {
    /* ignore */
  }
}

export function loadIdempotentRegistration(
  key: string,
): IdempotentRegistration | null {
  try {
    const raw = sessionStorage.getItem(idempotencyStoreKey)
    if (!raw) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") {
      return null
    }
    const record = parsed as IdempotentRegistration
    if (record.key !== key || !record.response?.token_code) {
      return null
    }
    return record
  } catch {
    return null
  }
}

export function saveIdempotentRegistration(
  key: string,
  response: RegisterPatientResponse,
): void {
  try {
    const payload: IdempotentRegistration = {
      key,
      response,
      savedAt: new Date().toISOString(),
    }
    sessionStorage.setItem(idempotencyStoreKey, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}
