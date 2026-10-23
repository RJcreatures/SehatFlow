import { createContext } from "react"
import type { Session, User } from "@supabase/supabase-js"
import type { StaffRole } from "../lib/supabase/database.types.ts"
import type { AppSupabase } from "../lib/supabase/queueApi.ts"
import type { SupabaseState } from "../lib/supabase/client.ts"

export type StaffProfile = {
  userId: string
  displayName: string
  role: StaffRole
  active: boolean
}

export type StaffAuthStatus =
  | "checking"
  | "unconfigured"
  | "refused"
  | "signed_out"
  | "signed_in"
  | "denied"

export type StaffAuthValue = {
  status: StaffAuthStatus
  supabaseState: SupabaseState
  client: AppSupabase | null
  session: Session | null
  user: User | null
  profile: StaffProfile | null
  error: string | null
  busy: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

export const StaffAuthContext = createContext<StaffAuthValue | null>(null)
