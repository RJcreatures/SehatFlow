import type { StaffRole } from "../lib/supabase/database.types.ts"

export type StaffAction =
  | "call_next"
  | "complete"
  | "no_show"
  | "send_to_end"
  | "reassign"
  | "set_doctor_status"
  | "acknowledge_urgent"
  | "reset_demo"
  | "set_demo_clock"

const roleActions: Record<StaffRole, readonly StaffAction[]> = {
  admin: [
    "call_next",
    "complete",
    "no_show",
    "send_to_end",
    "reassign",
    "set_doctor_status",
    "acknowledge_urgent",
    "reset_demo",
    "set_demo_clock",
  ],
  queue_manager: [
    "call_next",
    "complete",
    "no_show",
    "send_to_end",
    "reassign",
    "set_doctor_status",
    "acknowledge_urgent",
    "reset_demo",
    "set_demo_clock",
  ],
  doctor: ["complete", "set_doctor_status"],
  registrar: [],
}

export function staffCan(role: StaffRole, action: StaffAction): boolean {
  return roleActions[role].includes(action)
}
