import type { UiLanguage } from "../../i18n/index.ts"

export type VoiceCapability = {
  language: UiLanguage
  /** Sarvam Saaras BCP-47 code for STT. */
  sttCode: string | null
  speechInput: boolean
  intentText: boolean
  localizedTextAnswer: boolean
  /** Sarvam Bulbul BCP-47 code when TTS is supported. */
  ttsCode: string | null
  speechOutput: boolean
  notes: string
}

/**
 * Capability matrix from current Sarvam docs (Saaras STT + Bulbul TTS).
 * STT covers all nine UI languages including Urdu (`ur-IN`).
 * Bulbul TTS language_code enum does not list `ur-IN`, so Urdu is text-only
 * for spoken answers until Sarvam documents Urdu TTS support.
 */
export const voiceCapabilities: Record<UiLanguage, VoiceCapability> = {
  en: {
    language: "en",
    sttCode: "en-IN",
    speechInput: true,
    intentText: true,
    localizedTextAnswer: true,
    ttsCode: "en-IN",
    speechOutput: true,
    notes: "Full STT + TTS",
  },
  hi: {
    language: "hi",
    sttCode: "hi-IN",
    speechInput: true,
    intentText: true,
    localizedTextAnswer: true,
    ttsCode: "hi-IN",
    speechOutput: true,
    notes: "Full STT + TTS",
  },
  pa: {
    language: "pa",
    sttCode: "pa-IN",
    speechInput: true,
    intentText: true,
    localizedTextAnswer: true,
    ttsCode: "pa-IN",
    speechOutput: true,
    notes: "Full STT + TTS",
  },
  ur: {
    language: "ur",
    sttCode: "ur-IN",
    speechInput: true,
    intentText: true,
    localizedTextAnswer: true,
    ttsCode: null,
    speechOutput: false,
    notes: "STT + text answers; Bulbul TTS has no ur-IN code — text-only fallback",
  },
  bn: {
    language: "bn",
    sttCode: "bn-IN",
    speechInput: true,
    intentText: true,
    localizedTextAnswer: true,
    ttsCode: "bn-IN",
    speechOutput: true,
    notes: "Full STT + TTS",
  },
  mr: {
    language: "mr",
    sttCode: "mr-IN",
    speechInput: true,
    intentText: true,
    localizedTextAnswer: true,
    ttsCode: "mr-IN",
    speechOutput: true,
    notes: "Full STT + TTS",
  },
  ta: {
    language: "ta",
    sttCode: "ta-IN",
    speechInput: true,
    intentText: true,
    localizedTextAnswer: true,
    ttsCode: "ta-IN",
    speechOutput: true,
    notes: "Full STT + TTS",
  },
  te: {
    language: "te",
    sttCode: "te-IN",
    speechInput: true,
    intentText: true,
    localizedTextAnswer: true,
    ttsCode: "te-IN",
    speechOutput: true,
    notes: "Full STT + TTS",
  },
  gu: {
    language: "gu",
    sttCode: "gu-IN",
    speechInput: true,
    intentText: true,
    localizedTextAnswer: true,
    ttsCode: "gu-IN",
    speechOutput: true,
    notes: "Full STT + TTS",
  },
}

export function getVoiceCapability(language: UiLanguage): VoiceCapability {
  return voiceCapabilities[language]
}

export function voiceAssistantAvailable(language: UiLanguage): boolean {
  const capability = getVoiceCapability(language)
  return capability.speechInput && capability.intentText
}
