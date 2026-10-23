import type { PatientGender } from "../lib/supabase/database.types.ts"

export type RegistrationInput = {
  displayName: string
  age: number
  gender: PatientGender | null
  departmentCode: string
}

export type RegistrationFieldError =
  | "name"
  | "age"
  | "gender"
  | "department"
  | "token"
  | "access_code"

const NAME_MAX = 80
const TOKEN_PATTERN = /^[A-Z0-9]{1,8}-[0-9]{1,4}$/
const DEPARTMENT_PATTERN = /^[a-z0-9_]{2,32}$/
const GENDERS = new Set<PatientGender>([
  "female",
  "male",
  "other",
  "undisclosed",
])

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

export function validateRegistrationInput(input: {
  displayName: string
  ageText: string
  gender: string
  departmentCode: string
}): { ok: true; value: RegistrationInput } | { ok: false; field: RegistrationFieldError } {
  const displayName = normalizeDisplayName(input.displayName)
  if (displayName.length < 1 || displayName.length > NAME_MAX) {
    return { ok: false, field: "name" }
  }

  if (!/^\d{1,3}$/.test(input.ageText.trim())) {
    return { ok: false, field: "age" }
  }
  const age = Number(input.ageText.trim())
  if (!Number.isInteger(age) || age < 0 || age > 120) {
    return { ok: false, field: "age" }
  }

  let gender: PatientGender | null = null
  if (input.gender !== "") {
    if (!GENDERS.has(input.gender as PatientGender)) {
      return { ok: false, field: "gender" }
    }
    gender = input.gender as PatientGender
  }

  if (!DEPARTMENT_PATTERN.test(input.departmentCode)) {
    return { ok: false, field: "department" }
  }

  return {
    ok: true,
    value: {
      displayName,
      age,
      gender,
      departmentCode: input.departmentCode,
    },
  }
}

export function validateMyTurnInput(input: {
  tokenCode: string
  accessCode: string
}):
  | { ok: true; tokenCode: string; accessCode: string }
  | { ok: false; field: RegistrationFieldError } {
  const tokenCode = input.tokenCode.trim().toUpperCase()
  const accessCode = input.accessCode.trim().toUpperCase()

  if (!TOKEN_PATTERN.test(tokenCode)) {
    return { ok: false, field: "token" }
  }
  if (!/^[A-Z0-9]{8}$/.test(accessCode)) {
    return { ok: false, field: "access_code" }
  }

  return { ok: true, tokenCode, accessCode }
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

/** Unambiguous alphabet for printed slips. */
const ACCESS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export function generateAccessCode(
  randomBytes: Uint8Array = crypto.getRandomValues(new Uint8Array(8)),
): string {
  let code = ""
  for (let index = 0; index < 8; index += 1) {
    code += ACCESS_ALPHABET[randomBytes[index]! % ACCESS_ALPHABET.length]
  }
  return code
}
