import { describe, expect, it } from "vitest"
import { en } from "../../i18n/en.ts"
import { ur } from "../../i18n/ur.ts"
import { answerForIntent, answerFromRoute } from "./answers.ts"
import { configuredDepartmentFacts } from "./departmentFacts.ts"

const token = {
  token_code: "GM-12",
  department_name: "General Medicine",
  room: "Room 12",
  floor: "Ground floor",
  status: "waiting",
  estimated_wait_minutes: 25,
  patients_ahead: 3,
}

describe("voice answers grounded in app data", () => {
  it("requires verified token context for current_token and wait", () => {
    const needToken = answerForIntent({
      intent: {
        intent: "current_token",
        department_code: null,
        destination_code: null,
        start_landmark: null,
        confidence: 1,
      },
      messages: en,
      token: null,
      departments: [],
    })
    expect(needToken.needsMyTurn).toBe(true)
    expect(needToken.answer).toBe(en.voiceNeedMyTurn)

    const withToken = answerForIntent({
      intent: {
        intent: "wait_estimate",
        department_code: null,
        destination_code: null,
        start_landmark: null,
        confidence: 1,
      },
      messages: en,
      token,
      departments: [],
    })
    expect(withToken.answer).toContain("25")
    expect(withToken.answer).toContain("3")
    expect(withToken.needsMyTurn).toBe(false)
  })

  it("answers department_info from configured departments only", () => {
    const departments = configuredDepartmentFacts(en)
    const known = answerForIntent({
      intent: {
        intent: "department_info",
        department_code: "pediatrics",
        destination_code: null,
        start_landmark: null,
        confidence: 1,
      },
      messages: en,
      token: null,
      departments,
    })
    expect(known.answer.toLowerCase()).toContain("pediatr")

    const unknown = answerForIntent({
      intent: {
        intent: "department_info",
        department_code: "pediatrics",
        destination_code: null,
        start_landmark: null,
        confidence: 1,
      },
      messages: en,
      token: null,
      departments: [],
    })
    expect(unknown.answer).toBe(en.voiceUnknownDepartment)
  })

  it("uses the route engine for directions and step-free failure", () => {
    const ok = answerForIntent({
      intent: {
        intent: "accessible_route",
        department_code: null,
        destination_code: "general_medicine",
        start_landmark: "entrance",
        confidence: 1,
      },
      messages: en,
      token: null,
      departments: [],
      routeMode: "assisted",
      startId: "entrance",
    })
    expect(ok.answer.length).toBeGreaterThan(10)
    expect(ok.answer).not.toMatch(/invented|secret lab/i)

    const stepFreeFail = answerFromRoute(en, {
      status: "no_route",
      mode: "assisted",
      reason: "no_step_free",
      fromId: "entrance",
      toId: "dept_orthopedics",
    })
    expect(stepFreeFail.answer).toBe(en.findNoStepFree)

    const missing = answerForIntent({
      intent: {
        intent: "accessible_route",
        department_code: null,
        destination_code: null,
        start_landmark: null,
        confidence: 1,
      },
      messages: en,
      token: null,
      departments: [],
    })
    expect(missing.answer).toBe(en.voiceUnknownDepartment)
  })

  it("returns emergency guidance independently of token context", () => {
    const emergency = answerForIntent({
      intent: {
        intent: "emergency",
        department_code: null,
        destination_code: null,
        start_landmark: null,
        confidence: 1,
      },
      messages: en,
      token: null,
      departments: [],
    })
    expect(emergency.openEmergency).toBe(true)
    expect(emergency.answer).toContain(en.emergencyImmediate)
  })

  it("answers app and registration help without a verified token", () => {
    const appHelp = answerForIntent({
      intent: {
        intent: "app_help",
        department_code: null,
        destination_code: null,
        start_landmark: null,
        confidence: 1,
      },
      messages: en,
      token: null,
      departments: [],
    })
    expect(appHelp.answer).toBe(en.voiceAnswerAppHelp)
    expect(appHelp.needsMyTurn).toBe(false)

    const registerHelp = answerForIntent({
      intent: {
        intent: "registration_help",
        department_code: null,
        destination_code: null,
        start_landmark: null,
        confidence: 1,
      },
      messages: en,
      token: null,
      departments: [],
    })
    expect(registerHelp.answer).toBe(en.voiceAnswerRegistrationHelp)
  })

  it("keeps unsupported questions in the selected language (Urdu RTL catalog)", () => {
    const unknown = answerForIntent({
      intent: {
        intent: "unknown",
        department_code: null,
        destination_code: null,
        start_landmark: null,
        confidence: 0,
      },
      messages: ur,
      token: null,
      departments: [],
    })
    expect(unknown.answer).toBe(ur.voiceUnsupported)
  })
})
