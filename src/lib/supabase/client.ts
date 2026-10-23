import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types.ts"

export type SupabaseEnv = {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

export type SupabaseState =
  | { status: "unconfigured" }
  | { status: "refused"; reason: "privileged-key" }
  | { status: "ready" }

const privilegedRole = "service_role"

export function readSupabaseState(env: SupabaseEnv): SupabaseState {
  const url = normalizeProjectUrl(env.VITE_SUPABASE_URL)
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ""

  if (!url || !key || !isProjectUrl(url)) {
    return { status: "unconfigured" }
  }

  if (isPrivilegedKey(key)) {
    return { status: "refused", reason: "privileged-key" }
  }

  return { status: "ready" }
}

let client: SupabaseClient<Database> | null = null
let clientUrl = ""
let clientKey = ""

export function getSupabaseClient(
  env: SupabaseEnv = import.meta.env,
): SupabaseClient<Database> | null {
  const state = readSupabaseState(env)
  const url = normalizeProjectUrl(env.VITE_SUPABASE_URL)
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ""
  if (state.status !== "ready" || !url) {
    return null
  }

  if (!client || clientUrl !== url || clientKey !== key) {
    client = createClient<Database>(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
    clientUrl = url
    clientKey = key
  }

  return client
}

/** Accepts either the project root URL or a pasted /rest/v1 URL. */
export function normalizeProjectUrl(value: string | undefined): string {
  const trimmed = value?.trim() ?? ""
  if (!trimmed) {
    return ""
  }
  try {
    const url = new URL(trimmed)
    if (url.pathname === "/rest/v1" || url.pathname === "/rest/v1/") {
      url.pathname = "/"
    }
    url.search = ""
    url.hash = ""
    return url.toString().replace(/\/$/, "")
  } catch {
    return ""
  }
}

function isProjectUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.username === "" &&
      url.password === "" &&
      (url.pathname === "/" || url.pathname === "")
    )
  } catch {
    return false
  }
}

function isPrivilegedKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) {
    return true
  }

  const parts = key.split(".")
  if (parts.length !== 3 || !parts[1]) {
    return false
  }

  try {
    const payload: unknown = JSON.parse(atob(decodeBase64Url(parts[1])))
    return (
      typeof payload === "object" &&
      payload !== null &&
      "role" in payload &&
      payload.role === privilegedRole
    )
  } catch {
    return false
  }
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  const remainder = base64.length % 4
  if (remainder === 0) {
    return base64
  }
  return base64 + "=".repeat(4 - remainder)
}
