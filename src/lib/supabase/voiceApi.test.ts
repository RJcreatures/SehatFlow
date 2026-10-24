import { describe, expect, it, vi } from "vitest"
import type { AppSupabase } from "./queueApi.ts"
import {
  invokeVoiceAssist,
  invokeVoiceText,
  invokeVoiceTts,
  voiceErrorMessage,
} from "./voiceApi.ts"
import { en } from "../../i18n/en.ts"

function mockClient(
  impl: (name: string, options: { body: FormData }) => Promise<{
    data: unknown
    error: { message: string } | null
  }>,
): AppSupabase {
  return {
    functions: {
      invoke: vi.fn(impl),
    },
  } as unknown as AppSupabase
}

describe("voice API client", () => {
  it("sends audio and language without credentials fields", async () => {
    const client = mockClient(async (_name, options) => {
      const keys = [...options.body.keys()]
      expect(keys).toContain("audio")
      expect(keys).toContain("language")
      expect(keys).not.toContain("access_code")
      expect(keys).not.toContain("qr_token")
      expect(keys).not.toContain("token_code")
      expect(options.body.get("language")).toBe("hi")
      return {
        data: {
          transcript: "मेरा टोकन क्या है",
          intent: {
            intent: "current_token",
            department_code: null,
            destination_code: null,
            start_landmark: null,
            confidence: 0.9,
          },
          tts_supported: true,
          audio_base64: null,
          audio_mime: null,
          tts_fallback: null,
        },
        error: null,
      }
    })

    const result = await invokeVoiceAssist(client, {
      audio: new Blob(["fake"], { type: "audio/webm" }),
      language: "hi",
      durationMs: 1200,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.transcript).toContain("टोकन")
      expect(result.data.intent.intent).toBe("current_token")
    }
  })

  it("maps rate limit and timeout failures", async () => {
    const rate = mockClient(async () => ({
      data: { error: "voice_rate_limited" },
      error: { message: "Edge Function returned a non-2xx status code" },
    }))
    expect(
      (await invokeVoiceAssist(rate, {
        audio: new Blob(["x"], { type: "audio/webm" }),
        language: "en",
        durationMs: 500,
      })).ok,
    ).toBe(false)

    const timeout = mockClient(async () => ({
      data: { error: "voice_timeout" },
      error: { message: "timeout" },
    }))
    const timed = await invokeVoiceAssist(timeout, {
      audio: new Blob(["x"], { type: "audio/webm" }),
      language: "en",
      durationMs: 500,
    })
    expect(timed).toEqual({ ok: false, code: "voice_timeout" })
  })

  it("maps TTS unsupported language without inventing audio", async () => {
    const client = mockClient(async () => ({
      data: { error: "tts_unsupported_language", tts_supported: false },
      error: { message: "non-2xx" },
    }))
    const result = await invokeVoiceTts(client, {
      text: "آپ کا ٹوکن تیار ہے",
      language: "ur",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(voiceErrorMessage(result.code, en)).toBe(en.voiceUnavailable)
    }
  })

  it("sends typed questions without audio or credentials", async () => {
    const client = mockClient(async (_name, options) => {
      expect(options.body.get("mode")).toBe("text")
      expect(options.body.get("text")).toBe("How do I register?")
      expect([...options.body.keys()]).not.toContain("audio")
      expect([...options.body.keys()]).not.toContain("access_code")
      return {
        data: {
          transcript: "How do I register?",
          intent: {
            intent: "registration_help",
            department_code: null,
            destination_code: null,
            start_landmark: null,
            confidence: 0.95,
          },
          tts_supported: true,
          audio_base64: null,
          audio_mime: null,
          tts_fallback: null,
        },
        error: null,
      }
    })
    const result = await invokeVoiceText(client, {
      text: "How do I register?",
      language: "en",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.intent.intent).toBe("registration_help")
    }
  })

  it("refuses to treat credential-like TTS failures as success", async () => {
    const client = mockClient(async (_name, options) => {
      expect(options.body.get("text")).toBe("Your wait is about 10 minutes.")
      return {
        data: {
          audio_base64: "AAAA",
          audio_mime: "audio/mpeg",
          tts_supported: true,
        },
        error: null,
      }
    })
    const ok = await invokeVoiceTts(client, {
      text: "Your wait is about 10 minutes.",
      language: "en",
    })
    expect(ok.ok).toBe(true)
  })
})
