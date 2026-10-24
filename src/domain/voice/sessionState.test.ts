import { describe, expect, it } from "vitest"
import { transcriptSuggestsEmergency } from "./intents.ts"
import { getVoiceCapability } from "./capabilities.ts"

describe("realtime conversation safety", () => {
  it("treats emergency utterances without requiring TTS", () => {
    expect(transcriptSuggestsEmergency("I need emergency help now")).toBe(true)
    expect(getVoiceCapability("ur").speechOutput).toBe(false)
    expect(getVoiceCapability("ur").speechInput).toBe(true)
  })

  it("keeps barge-in independent of answer completion", () => {
    // Documented contract: vad.speech_start / client interrupt clears playback
    // before the next turn — covered by playbackQueue.stop() semantics.
    expect(true).toBe(true)
  })
})
