import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"
import {
  allowRequest,
  clientKey,
  jsonResponse,
} from "../_shared/patient.ts"

/** Fictional-hospital demo account for judges. Not a production identity. */
const DEMO_EMAIL = Deno.env.get("DEMO_STAFF_EMAIL") ?? "judge@sehatflow.demo"
const DEMO_PASSWORD =
  Deno.env.get("DEMO_STAFF_PASSWORD") ?? "SehatFlowJudgeDemo1!"
const DEMO_DISPLAY_NAME = "Demo Judge"
const DEMO_ROLE = "queue_manager"

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    if (req.method === "OPTIONS") {
      return jsonResponse(req, { ok: true })
    }
    if (req.method !== "POST") {
      return jsonResponse(req, { error: "method not allowed" }, 405)
    }

    if (!allowRequest(`demo-staff:${clientKey(req)}`)) {
      return jsonResponse(req, { error: "too many requests" }, 429)
    }

    const ensured = await ensureDemoStaff(ctx.supabaseAdmin)
    if (!ensured.ok) {
      return jsonResponse(req, { error: ensured.error }, 500)
    }

    const { data, error } = await ctx.supabaseAdmin.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    })

    if (error || !data.session) {
      return jsonResponse(
        req,
        { error: error?.message ?? "demo sign-in failed" },
        500,
      )
    }

    return jsonResponse(req, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      expires_at: data.session.expires_at,
      token_type: data.session.token_type,
    })
  }),
}

// deno-lint-ignore no-explicit-any
async function ensureDemoStaff(
  admin: any,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let userId: string | null = null

  const created = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: DEMO_DISPLAY_NAME },
  })

  if (created.data?.user?.id) {
    userId = created.data.user.id as string
  } else if (
    created.error &&
    /already|registered|exists/i.test(String(created.error.message ?? ""))
  ) {
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (listed.error) {
      return { ok: false, error: listed.error.message }
    }
    const match = (listed.data?.users ?? []).find(
      (user: { id: string; email?: string }) =>
        user.email?.toLowerCase() === DEMO_EMAIL.toLowerCase(),
    )
    if (!match) {
      return {
        ok: false,
        error: "demo staff user exists but could not be found",
      }
    }
    userId = match.id
    const updated = await admin.auth.admin.updateUserById(userId, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    })
    if (updated.error) {
      return { ok: false, error: updated.error.message }
    }
  } else if (created.error) {
    return { ok: false, error: created.error.message }
  }

  if (!userId) {
    return { ok: false, error: "demo staff user missing" }
  }

  const { error: membershipError } = await admin.from("staff_members").upsert(
    {
      user_id: userId,
      display_name: DEMO_DISPLAY_NAME,
      role: DEMO_ROLE,
      active: true,
    },
    { onConflict: "user_id" },
  )

  if (membershipError) {
    return { ok: false, error: membershipError.message }
  }

  return { ok: true }
}
