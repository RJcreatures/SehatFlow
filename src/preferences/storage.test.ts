import { afterEach, describe, expect, it } from "vitest"
import { appConfig } from "../config/hospital.ts"
import { defaultPreferences, loadPreferences, savePreferences } from "./storage.ts"
import type { Preferences } from "./types.ts"

const memory = new Map<string, string>()

function installMemoryStorage() {
  memory.clear()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
      removeItem: (key: string) => {
        memory.delete(key)
      },
    },
  })
}

afterEach(() => {
  memory.clear()
})

describe("preferences storage", () => {
  it("starts with onboarding incomplete for first launch", () => {
    installMemoryStorage()
    expect(loadPreferences()).toEqual(defaultPreferences)
    expect(loadPreferences().onboardingCompleted).toBe(false)
  })

  it("persists language and completed onboarding", () => {
    installMemoryStorage()
    const next: Preferences = {
      language: "hi",
      textSize: "lg",
      contrast: "high",
      languageChosen: true,
      onboardingCompleted: true,
      queueNotificationsEnabled: true,
      simulatedCallEnabled: false,
    }
    savePreferences(next)
    expect(loadPreferences()).toEqual(next)
    expect(memory.get(appConfig.storageKey)).toContain('"language":"hi"')
  })

  it("treats legacy languageChosen visitors as already onboarded", () => {
    installMemoryStorage()
    memory.set(
      appConfig.storageKey,
      JSON.stringify({
        language: "hi",
        textSize: "md",
        contrast: "default",
        languageChosen: true,
      }),
    )
    const loaded = loadPreferences()
    expect(loaded.onboardingCompleted).toBe(true)
    expect(loaded.language).toBe("hi")
  })

  it("shows onboarding again after a deliberate reset flag", () => {
    installMemoryStorage()
    savePreferences({
      language: "en",
      textSize: "md",
      contrast: "default",
      languageChosen: true,
      onboardingCompleted: false,
      queueNotificationsEnabled: false,
      simulatedCallEnabled: false,
    })
    expect(loadPreferences().onboardingCompleted).toBe(false)
  })

  it("defaults notification and simulated-call opt-ins to off", () => {
    installMemoryStorage()
    expect(loadPreferences().queueNotificationsEnabled).toBe(false)
    expect(loadPreferences().simulatedCallEnabled).toBe(false)
  })
})
