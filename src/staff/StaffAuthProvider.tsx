import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Session } from "@supabase/supabase-js"
import {
  getSupabaseClient,
  readSupabaseState,
} from "../lib/supabase/client.ts"
import { supabaseErrorMessage } from "../lib/supabase/errors.ts"
import { demoStaffLogin } from "../lib/supabase/patientApi.ts"
import type { StaffRole } from "../lib/supabase/database.types.ts"
import {
  StaffAuthContext,
  type StaffAuthStatus,
  type StaffProfile,
} from "./StaffAuthContext.ts"

type Props = {
  children: ReactNode
}

export function StaffAuthProvider({ children }: Props) {
  const supabaseState = readSupabaseState(import.meta.env)
  const client = getSupabaseClient()
  const [status, setStatus] = useState<StaffAuthStatus>(() => {
    if (supabaseState.status === "unconfigured") {
      return "unconfigured"
    }
    if (supabaseState.status === "refused") {
      return "refused"
    }
    return "checking"
  })
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const resolveMembership = useCallback(
    async (nextSession: Session | null) => {
      if (!client) {
        setSession(null)
        setProfile(null)
        setStatus(
          supabaseState.status === "refused" ? "refused" : "unconfigured",
        )
        return
      }

      if (!nextSession) {
        setSession(null)
        setProfile(null)
        setStatus("signed_out")
        return
      }

      setSession(nextSession)
      const { data, error: membershipError } = await client
        .from("staff_members")
        .select("user_id, display_name, role, active")
        .eq("user_id", nextSession.user.id)
        .maybeSingle()

      if (membershipError) {
        setProfile(null)
        setStatus("denied")
        setError(membershipError.message)
        return
      }

      if (!data || !data.active) {
        setProfile(
          data
            ? {
                userId: data.user_id,
                displayName: data.display_name,
                role: data.role as StaffRole,
                active: data.active,
              }
            : null,
        )
        setStatus("denied")
        return
      }

      setProfile({
        userId: data.user_id,
        displayName: data.display_name,
        role: data.role as StaffRole,
        active: data.active,
      })
      setStatus("signed_in")
      setError(null)
    },
    [client, supabaseState.status],
  )

  useEffect(() => {
    if (!client) {
      return
    }

    let cancelled = false

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (cancelled) {
        return
      }
      if (sessionError) {
        setError(sessionError.message)
        setStatus("signed_out")
        return
      }
      void resolveMembership(data.session)
    })

    const { data: subscription } = client.auth.onAuthStateChange(
      (_event, nextSession) => {
        void resolveMembership(nextSession)
      },
    )

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [client, resolveMembership])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!client) {
        setError("Supabase is not configured.")
        return
      }
      setBusy(true)
      setError(null)
      const { error: signInError } = await client.auth.signInWithPassword({
        email,
        password,
      })
      setBusy(false)
      if (signInError) {
        setError(supabaseErrorMessage(signInError, "Sign-in failed."))
      }
    },
    [client],
  )

  const signInDemo = useCallback(async () => {
    if (!client) {
      setError("Supabase is not configured.")
      return
    }
    setBusy(true)
    setError(null)
    const { data, error: demoError } = await demoStaffLogin(client)
    if (demoError || !data?.access_token || !data.refresh_token) {
      setBusy(false)
      setError(
        supabaseErrorMessage(
          demoError ?? new Error("Demo login failed."),
          "Demo login failed.",
        ),
      )
      return
    }
    const { error: sessionError } = await client.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    })
    setBusy(false)
    if (sessionError) {
      setError(supabaseErrorMessage(sessionError, "Demo login failed."))
    }
  }, [client])

  const signOut = useCallback(async () => {
    if (!client) {
      return
    }
    setBusy(true)
    setError(null)
    const { error: signOutError } = await client.auth.signOut()
    setBusy(false)
    if (signOutError) {
      setError(supabaseErrorMessage(signOutError, "Sign-out failed."))
    }
  }, [client])

  const value = useMemo(
    () => ({
      status,
      supabaseState,
      client,
      session,
      user: session?.user ?? null,
      profile,
      error,
      busy,
      signIn,
      signInDemo,
      signOut,
      clearError: () => setError(null),
    }),
    [
      status,
      supabaseState,
      client,
      session,
      profile,
      error,
      busy,
      signIn,
      signInDemo,
      signOut,
    ],
  )

  return (
    <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>
  )
}
