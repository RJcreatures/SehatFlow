import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parseAgentToolCall } from "./validate.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

describe("agent privacy and allowlist", () => {
  it("strips credential-like fields from get_my_turn proposals", () => {
    const parsed = parseAgentToolCall({
      tool: "get_my_turn",
      args: {
        access_code: "LEAK",
        qr_token: "LEAK",
        token_code: "GM-1",
      },
    })
    expect(parsed).toEqual({ tool: "get_my_turn", args: {} })
  })

  it("voice client payloads never include slip secrets in source", () => {
    const voiceApi = readFileSync(join(root, "lib/supabase/voiceApi.ts"), "utf8")
    expect(voiceApi).not.toMatch(/access_code/)
    expect(voiceApi).not.toMatch(/qr_token/)
    expect(voiceApi).not.toMatch(/service_role/)

    const provider = readFileSync(
      join(root, "domain/voice/providerPayload.ts"),
      "utf8",
    )
    expect(provider).not.toMatch(/access_code/)
    expect(provider).not.toMatch(/qr_token/)
  })

  it("keeps SARVAM key off the browser agent path", () => {
    const execute = readFileSync(join(root, "domain/agent/execute.ts"), "utf8")
    expect(execute).not.toMatch(/SARVAM/)
    expect(execute).not.toMatch(/service_role/)
  })
})
