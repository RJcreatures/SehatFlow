import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"
import {
  allowRequest,
  clientKey,
  generateAccessCode,
  generateQrToken,
  jsonResponse,
  parseRegisterBody,
  sha256Hex,
  type RegisterBody,
} from "../_shared/patient.ts"

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    if (req.method === "OPTIONS") {
      return jsonResponse(req, { ok: true })
    }
    if (req.method !== "POST") {
      return jsonResponse(req, { error: "method not allowed" }, 405)
    }

    if (!allowRequest(`register:${clientKey(req)}`)) {
      return jsonResponse(req, { error: "too many requests" }, 429)
    }

    let body: RegisterBody
    try {
      body = (await req.json()) as RegisterBody
    } catch {
      return jsonResponse(req, { error: "invalid registration input" }, 400)
    }

    const parsed = parseRegisterBody(body)
    if (!parsed.ok) {
      return jsonResponse(req, { error: parsed.message }, 400)
    }

    const accessCode = generateAccessCode()
    const accessCodeHash = await sha256Hex(accessCode)
    const qrToken = generateQrToken()
    const qrTokenHash = await sha256Hex(qrToken)

    const { data, error } = await ctx.supabaseAdmin.rpc("register_demo_patient", {
      p_display_name: parsed.display_name,
      p_age: parsed.age,
      p_gender: parsed.gender,
      p_department_code: parsed.department_code,
      p_access_code_hash: accessCodeHash,
      p_qr_token_hash: qrTokenHash,
    })

    if (error) {
      const message = error.message.includes("unknown or inactive department")
        ? "unknown or inactive department"
        : error.message.includes("department queue is full")
          ? "department queue is full"
          : "invalid registration input"
      return jsonResponse(req, { error: message }, 400)
    }

    const row = data as Record<string, unknown>
    return jsonResponse(req, {
      token_code: row.token_code,
      access_code: accessCode,
      qr_token: qrToken,
      department_code: row.department_code,
      department_name_en: row.department_name_en,
      department_name_hi: row.department_name_hi,
      room_en: row.room_en,
      room_hi: row.room_hi,
      floor_en: row.floor_en,
      floor_hi: row.floor_hi,
      estimated_wait_minutes: row.estimated_wait_minutes,
      service_date: row.service_date,
    })
  }),
}
