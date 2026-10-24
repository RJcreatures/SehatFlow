import { describe, expect, it } from "vitest"
import {
  isAllowedVoiceMime,
  MAX_VOICE_AUDIO_BYTES,
  validateVoiceRecording,
} from "./audioLimits.ts"

describe("voice audio limits", () => {
  it("allows common browser recording MIME types", () => {
    expect(isAllowedVoiceMime("audio/webm;codecs=opus")).toBe(true)
    expect(isAllowedVoiceMime("audio/wav")).toBe(true)
    expect(isAllowedVoiceMime("application/json")).toBe(false)
    expect(isAllowedVoiceMime("text/plain")).toBe(false)
  })

  it("rejects empty, oversize, and overlong recordings", () => {
    expect(
      validateVoiceRecording({
        byteLength: 0,
        durationMs: 1000,
        mime: "audio/webm",
      }),
    ).toBe("voice_bad_audio")
    expect(
      validateVoiceRecording({
        byteLength: MAX_VOICE_AUDIO_BYTES + 1,
        durationMs: 1000,
        mime: "audio/webm",
      }),
    ).toBe("voice_too_long")
    expect(
      validateVoiceRecording({
        byteLength: 1000,
        durationMs: 20_000,
        mime: "audio/webm",
      }),
    ).toBe("voice_too_long")
    expect(
      validateVoiceRecording({
        byteLength: 1000,
        durationMs: 2000,
        mime: "audio/webm",
      }),
    ).toBe("ok")
  })
})
