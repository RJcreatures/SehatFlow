import type { AppSupabase } from "./queueApi.ts"
import type { PatientGender } from "./database.types.ts"

export type RegisterPatientRequest = {
  display_name: string
  age: number
  gender: PatientGender | null
  department_code: string
}

export type RegisterPatientResponse = {
  token_code: string
  access_code: string
  qr_token: string
  department_code: string
  department_name_en: string
  department_name_hi: string
  room_en: string
  room_hi: string
  floor_en: string
  floor_hi: string
  estimated_wait_minutes: number
  service_date: string
}

export type MyTurnAccessRequest = {
  token_code: string
  access_code: string
}

export type MyTurnQrRequest = {
  qr_token: string
}

export type MyTurnRequest = MyTurnAccessRequest | MyTurnQrRequest

export type MyTurnResponse = {
  token_code: string
  department_code: string
  department_name_en: string
  department_name_hi: string
  room_en: string
  room_hi: string
  floor_en: string
  floor_hi: string
  status: string
  patients_ahead: number
  estimated_wait_minutes: number | null
  service_date: string
}

export async function registerPatient(
  client: AppSupabase,
  body: RegisterPatientRequest,
) {
  return client.functions.invoke<RegisterPatientResponse>("register-patient", {
    body,
  })
}

export async function getMyTurn(client: AppSupabase, body: MyTurnRequest) {
  return client.functions.invoke<MyTurnResponse>("get-my-turn", {
    body,
  })
}

export type DemoStaffSessionResponse = {
  access_token: string
  refresh_token: string
  expires_in?: number
  expires_at?: number
  token_type?: string
}

/** One-click fictional staff session for judges. No password form required. */
export async function demoStaffLogin(client: AppSupabase) {
  return client.functions.invoke<DemoStaffSessionResponse>("demo-staff-login", {
    body: {},
  })
}
