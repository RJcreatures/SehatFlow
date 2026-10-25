import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  BoardSnapshotRow,
  Database,
  DemoClockPayload,
  DoctorAvailability,
  ResetDemoResult,
} from "./database.types.ts"

export type AppSupabase = SupabaseClient<Database>

export async function fetchBoardSnapshot(client: AppSupabase) {
  return client.rpc("get_board_snapshot")
}

export async function fetchDemoClock(client: AppSupabase) {
  return client.rpc("get_demo_clock")
}

export async function callNext(client: AppSupabase, departmentId: string) {
  return client.rpc("call_next", { p_department_id: departmentId })
}

export async function completeToken(client: AppSupabase, entryId: string) {
  return client.rpc("complete_token", { p_queue_entry_id: entryId })
}

export async function markNoShow(client: AppSupabase, entryId: string) {
  return client.rpc("mark_no_show", { p_queue_entry_id: entryId })
}

export async function sendToEnd(client: AppSupabase, entryId: string) {
  return client.rpc("send_to_end", { p_queue_entry_id: entryId })
}

export async function reassignToken(
  client: AppSupabase,
  entryId: string,
  targetDepartmentId: string,
) {
  return client.rpc("reassign_token", {
    p_queue_entry_id: entryId,
    p_target_department_id: targetDepartmentId,
  })
}

export async function setDoctorStatus(
  client: AppSupabase,
  departmentId: string,
  availability: DoctorAvailability,
  delayMinutes = 0,
  breakEndsAt: string | null = null,
) {
  return client.rpc("set_doctor_status", {
    p_department_id: departmentId,
    p_availability: availability,
    p_delay_minutes: delayMinutes,
    p_break_ends_at: breakEndsAt,
  })
}

export async function acknowledgeUrgent(client: AppSupabase, flagId: string) {
  return client.rpc("acknowledge_urgent", { p_flag_id: flagId })
}

export async function requestUrgentHelp(
  client: AppSupabase,
  requestKey: string,
  departmentCode?: string | null,
) {
  return client.rpc("request_urgent_help", {
    p_request_key: requestKey,
    p_department_code: departmentCode ?? null,
  })
}

export async function setDemoClock(client: AppSupabase, scale: 1 | 10) {
  return client.rpc("set_demo_clock", { p_scale: scale })
}

export async function resetDemo(client: AppSupabase) {
  return client.rpc("reset_demo")
}

export type EnsureDemoQueueResult = {
  ok: boolean
  action?: "noop" | "seeded" | string
  reason?: string
  active_tokens?: number
  departments_with_queue?: number
  patients?: number
  queue_entries?: number
  service_date?: string
}

export async function ensureDemoQueue(client: AppSupabase) {
  return client.rpc("ensure_demo_queue")
}

export type { BoardSnapshotRow, DemoClockPayload, ResetDemoResult }
