import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"
import {
  allowRequest,
  clientKey,
  jsonResponse,
  myTurnJson,
  parseMyTurnBody,
  sha256Hex,
  type MyTurnBody,
} from "../_shared/patient.ts"

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    if (req.method === "OPTIONS") {
      return jsonResponse(req, { ok: true })
    }
    if (req.method !== "POST") {
      return jsonResponse(req, { error: "method not allowed" }, 405)
    }

    if (!allowRequest(`myturn:${clientKey(req)}`)) {
      return jsonResponse(req, { error: "too many requests" }, 429)
    }

    let body: MyTurnBody
    try {
      body = (await req.json()) as MyTurnBody
    } catch {
      return jsonResponse(req, { error: "invalid token or access code" }, 400)
    }

    const parsed = parseMyTurnBody(body)
    if (!parsed.ok) {
      return jsonResponse(req, { error: parsed.message }, 400)
    }

    if (parsed.mode === "qr") {
      const qrHash = await sha256Hex(parsed.qr_token)
      const { data, error } = await ctx.supabaseAdmin.rpc("lookup_my_turn_by_qr", {
        p_qr_token_hash: qrHash,
      })
      if (error) {
        return jsonResponse(req, { error: "invalid or expired QR code" }, 400)
      }
      return jsonResponse(req, myTurnJson(data as Record<string, unknown>))
    }

    const accessCodeHash = await sha256Hex(parsed.access_code)
    const { data, error } = await ctx.supabaseAdmin.rpc("lookup_my_turn", {
      p_token_code: parsed.token_code,
      p_access_code_hash: accessCodeHash,
    })

    if (error) {
      return jsonResponse(req, { error: "invalid token or access code" }, 400)
    }

    return jsonResponse(req, myTurnJson(data as Record<string, unknown>))
  }),
}
