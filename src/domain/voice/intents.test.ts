import { describe, expect, it } from "vitest"
import {
  parseVoiceIntent,
  transcriptSuggestsEmergency,
} from "./intents.ts"

describe("voice intent parsing", () => {
  it("accepts allowlisted intents and department codes", () => {
    expect(
      parseVoiceIntent({
        intent: "department_info",
        department_code: "pediatrics",
        destination_code: null,
        start_landmark: null,
        confidence: 0.9,
      }),
    ).toEqual({
      intent: "department_info",
      department_code: "pediatrics",
      destination_code: null,
      start_landmark: null,
      confidence: 0.9,
    })
  })

  it("rejects malformed intent names", () => {
    expect(parseVoiceIntent({ intent: "reorder_queue", confidence: 1 })).toBeNull()
    expect(parseVoiceIntent(null)).toBeNull()
    expect(parseVoiceIntent("current_token")).toBeNull()
  })

  it("keeps department_info when the code is missing so the planner can recover", () => {
    expect(
      parseVoiceIntent({
        intent: "department_info",
        department_code: null,
        confidence: 0.8,
      }),
    ).toEqual({
      intent: "department_info",
      department_code: null,
      destination_code: null,
      start_landmark: null,
      confidence: 0.8,
    })
  })

  it("keeps accessible_route and strips unknown destination codes", () => {
    expect(
      parseVoiceIntent({
        intent: "accessible_route",
        destination_code: "secret_lab",
        confidence: 0.7,
      }),
    ).toEqual({
      intent: "accessible_route",
      department_code: null,
      destination_code: null,
      start_landmark: null,
      confidence: 0.7,
    })
  })

  it("clamps confidence and strips invalid landmarks", () => {
    const parsed = parseVoiceIntent({
      intent: "current_token",
      start_landmark: "parking_lot",
      confidence: 4,
    })
    expect(parsed).toEqual({
      intent: "current_token",
      department_code: null,
      destination_code: null,
      start_landmark: null,
      confidence: 1,
    })
  })
})

describe("emergency keyword detection", () => {
  it("detects emergency without depending on Sarvam", () => {
    expect(transcriptSuggestsEmergency("I need emergency help")).toBe(true)
    expect(transcriptSuggestsEmergency("मुझे इमरजेंसी चाहिए")).toBe(true)
    expect(transcriptSuggestsEmergency("ایمرجنسی")).toBe(true)
    expect(transcriptSuggestsEmergency("what is my token")).toBe(false)
  })
})
