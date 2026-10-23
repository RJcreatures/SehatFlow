/**
 * Hand-maintained types for Phase 2 and Phase 3 migrations.
 * These were not generated from a hosted Supabase project.
 */

export type StaffRole = "admin" | "registrar" | "doctor" | "queue_manager"

export type PatientGender = "female" | "male" | "other" | "undisclosed"

export type QueueStatus =
  | "waiting"
  | "called"
  | "completed"
  | "no_show"
  | "skipped"
  | "cancelled"

export type DoctorAvailability = "available" | "on_break" | "running_late"

export type UrgentStatus = "open" | "acknowledged"

export type QueueEventType =
  | "enqueued"
  | "called"
  | "completed"
  | "no_show"
  | "skipped"
  | "cancelled"
  | "reassigned"
  | "sent_to_end"
  | "doctor_updated"
  | "urgent_acknowledged"

export type QueueEventMetadata = Record<string, string | number | boolean | null>

export type BoardSnapshotRow = {
  department_code: string
  department_name_en: string
  department_name_hi: string
  room_en: string
  room_hi: string
  floor_en: string
  floor_hi: string
  display_order: number
  called_token: string | null
  next_waiting_tokens: string[] | null
  availability: DoctorAvailability
  delay_minutes: number
  break_ends_at: string | null
  estimated_wait_minutes: number | null
  clock_scale: number
  simulated_now: string
}

export type DemoClockPayload = {
  scale: number
  real_anchor: string
  sim_anchor: string
  simulated_now: string
  service_date: string
}

export type ResetDemoResult = {
  ok: boolean
  patients: number
  queue_entries: number
  service_date: string
  clock_scale: number
}

type Table<
  Row extends Record<string, unknown>,
  Insert extends Record<string, unknown>,
  Update extends Record<string, unknown>,
> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

type DepartmentRow = {
  id: string
  code: string
  name_en: string
  name_hi: string
  room_en: string
  room_hi: string
  floor_en: string
  floor_hi: string
  estimated_minutes: number
  display_order: number
  active: boolean
  created_at: string
  updated_at: string
}

type QueueEntryRow = {
  id: string
  patient_id: string
  department_id: string
  token_number: number
  token_code: string
  service_date: string
  status: QueueStatus
  queued_at: string
  called_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  is_demo: boolean
}

type DoctorStatusRow = {
  department_id: string
  availability: DoctorAvailability
  delay_minutes: number
  break_ends_at: string | null
  updated_at: string
  updated_by: string | null
}

type UrgentFlagRow = {
  id: string
  queue_entry_id: string | null
  department_id: string | null
  status: UrgentStatus
  created_at: string
  acknowledged_at: string | null
  acknowledged_by: string | null
  is_demo: boolean
}

type StaffMemberRow = {
  user_id: string
  display_name: string
  role: StaffRole
  active: boolean
  created_at: string
  updated_at: string
}

type DemoClockRow = {
  id: boolean
  scale: number
  real_anchor: string
  sim_anchor: string
  updated_at: string
  updated_by: string | null
}

export type Database = {
  public: {
    Tables: {
      departments: Table<
        DepartmentRow,
        Partial<DepartmentRow> &
          Pick<
            DepartmentRow,
            | "code"
            | "name_en"
            | "name_hi"
            | "room_en"
            | "room_hi"
            | "floor_en"
            | "floor_hi"
            | "estimated_minutes"
            | "display_order"
          >,
        Partial<DepartmentRow>
      >
      staff_members: Table<
        StaffMemberRow,
        Pick<StaffMemberRow, "user_id" | "display_name" | "role"> &
          Partial<Pick<StaffMemberRow, "active" | "created_at" | "updated_at">>,
        Partial<StaffMemberRow>
      >
      patients: Table<
        {
          id: string
          display_name: string
          age: number
          gender: PatientGender | null
          created_at: string
          is_demo: boolean
        },
        {
          id?: string
          display_name: string
          age: number
          gender?: PatientGender | null
          created_at?: string
          is_demo?: boolean
        },
        {
          id?: string
          display_name?: string
          age?: number
          gender?: PatientGender | null
          created_at?: string
          is_demo?: boolean
        }
      >
      queue_entries: Table<
        QueueEntryRow,
        Omit<QueueEntryRow, "id" | "queued_at" | "called_at" | "completed_at" | "created_at" | "updated_at" | "is_demo"> &
          Partial<
            Pick<
              QueueEntryRow,
              | "id"
              | "queued_at"
              | "called_at"
              | "completed_at"
              | "created_at"
              | "updated_at"
              | "is_demo"
            >
          >,
        Partial<QueueEntryRow>
      >
      doctor_status: Table<
        DoctorStatusRow,
        Pick<DoctorStatusRow, "department_id" | "availability"> &
          Partial<Omit<DoctorStatusRow, "department_id" | "availability">>,
        Partial<DoctorStatusRow>
      >
      urgent_flags: Table<
        UrgentFlagRow,
        Partial<UrgentFlagRow> & Record<string, never>,
        Partial<UrgentFlagRow>
      >
      queue_events: Table<
        {
          id: string
          queue_entry_id: string | null
          event_type: QueueEventType
          previous_status: QueueStatus | null
          new_status: QueueStatus | null
          actor_user_id: string | null
          created_at: string
          metadata: QueueEventMetadata
        },
        {
          id?: string
          queue_entry_id?: string | null
          event_type: QueueEventType
          previous_status?: QueueStatus | null
          new_status?: QueueStatus | null
          actor_user_id?: string | null
          created_at?: string
          metadata?: QueueEventMetadata
        },
        {
          id?: string
          queue_entry_id?: string | null
          event_type?: QueueEventType
          previous_status?: QueueStatus | null
          new_status?: QueueStatus | null
          actor_user_id?: string | null
          created_at?: string
          metadata?: QueueEventMetadata
        }
      >
      demo_clock: Table<
        DemoClockRow,
        Partial<DemoClockRow> & Pick<DemoClockRow, "id">,
        Partial<DemoClockRow>
      >
    }
    Views: Record<string, never>
    Functions: {
      call_next: {
        Args: { p_department_id: string }
        Returns: QueueEntryRow
      }
      complete_token: {
        Args: { p_queue_entry_id: string }
        Returns: QueueEntryRow
      }
      mark_no_show: {
        Args: { p_queue_entry_id: string }
        Returns: QueueEntryRow
      }
      send_to_end: {
        Args: { p_queue_entry_id: string }
        Returns: QueueEntryRow
      }
      reassign_token: {
        Args: { p_queue_entry_id: string; p_target_department_id: string }
        Returns: QueueEntryRow
      }
      set_doctor_status: {
        Args: {
          p_department_id: string
          p_availability: string
          p_delay_minutes?: number
          p_break_ends_at?: string | null
        }
        Returns: DoctorStatusRow
      }
      acknowledge_urgent: {
        Args: { p_flag_id: string }
        Returns: UrgentFlagRow
      }
      set_demo_clock: {
        Args: { p_scale: number }
        Returns: DemoClockRow
      }
      reset_demo: {
        Args: Record<string, never>
        Returns: ResetDemoResult
      }
      get_demo_clock: {
        Args: Record<string, never>
        Returns: DemoClockPayload
      }
      get_board_snapshot: {
        Args: Record<string, never>
        Returns: BoardSnapshotRow[]
      }
      register_demo_patient: {
        Args: {
          p_display_name: string
          p_age: number
          p_gender: string | null
          p_department_code: string
          p_access_code_hash: string
          p_qr_token_hash: string
        }
        Returns: Record<string, unknown>
      }
      lookup_my_turn: {
        Args: {
          p_token_code: string
          p_access_code_hash: string
        }
        Returns: Record<string, unknown>
      }
      lookup_my_turn_by_qr: {
        Args: {
          p_qr_token_hash: string
        }
        Returns: Record<string, unknown>
      }
    }
  }
}
