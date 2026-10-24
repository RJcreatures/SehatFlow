import { describe, expect, it } from "vitest"
import { readyLanguages } from "../../i18n/index.ts"
import {
  getVoiceCapability,
  voiceAssistantAvailable,
  voiceCapabilities,
} from "./capabilities.ts"

describe("voice capability matrix", () => {
  it("covers every UI-ready language explicitly", () => {
    for (const language of readyLanguages()) {
      expect(voiceCapabilities[language.id]).toBeDefined()
      expect(getVoiceCapability(language.id).language).toBe(language.id)
    }
  })

  it("enables STT for all nine languages including Urdu", () => {
    for (const language of readyLanguages()) {
      const capability = getVoiceCapability(language.id)
      expect(capability.speechInput).toBe(true)
      expect(capability.sttCode).toMatch(/-IN$/)
      expect(voiceAssistantAvailable(language.id)).toBe(true)
    }
  })

  it("disables TTS for Urdu while keeping text answers", () => {
    const urdu = getVoiceCapability("ur")
    expect(urdu.speechOutput).toBe(false)
    expect(urdu.ttsCode).toBeNull()
    expect(urdu.localizedTextAnswer).toBe(true)
    expect(urdu.speechInput).toBe(true)
  })

  it("enables TTS for Hindi and English with native BCP-47 codes", () => {
    expect(getVoiceCapability("hi")).toMatchObject({
      speechOutput: true,
      ttsCode: "hi-IN",
      sttCode: "hi-IN",
    })
    expect(getVoiceCapability("en")).toMatchObject({
      speechOutput: true,
      ttsCode: "en-IN",
    })
  })
})
