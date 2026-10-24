import { describe, expect, it } from "vitest"
import { en } from "../../i18n/en.ts"
import {
  localizeQueueStatus,
  shortDepartmentName,
  speakDepartmentList,
  speakLiveTurn,
  speakRouteBrief,
} from "./spoken.ts"

const sample = {
  token_code: "GM-12",
  department_code: "general_medicine",
  department_name_en: "General Medicine",
  department_name_hi: "सामान्य चिकित्सा",
  room_en: "Room 12",
  room_hi: "कक्ष 12",
  floor_en: "Ground",
  floor_hi: "भूतल",
  status: "waiting",
  patients_ahead: 3,
  estimated_wait_minutes: 25,
  service_date: "2026-10-24",
}

describe("spoken agent answers", () => {
  it("keeps token and wait answers short and localized", () => {
    const token = speakLiveTurn({
      data: sample,
      messages: en,
      mode: "token",
    })
    expect(token).toContain("GM-12")
    expect(token).toContain("Waiting")
    expect(token).toContain("25")
    expect(token).toContain("3")
    expect(token.toLowerCase()).not.toContain("department:")

    const wait = speakLiveTurn({
      data: sample,
      messages: en,
      mode: "wait",
      displayMinutes: 18,
    })
    expect(wait).toContain("18")
    expect(wait).toContain("3")
  })

  it("uses called / done phrasing from live status", () => {
    expect(
      speakLiveTurn({
        data: { ...sample, status: "called" },
        messages: en,
        mode: "wait",
      }),
    ).toContain("called")

    expect(
      speakLiveTurn({
        data: { ...sample, status: "completed" },
        messages: en,
        mode: "token",
      }),
    ).toContain("completed")
  })

  it("shortens department lists and routes", () => {
    expect(shortDepartmentName("Pediatrics (Room 4)")).toBe("Pediatrics")
    expect(
      speakDepartmentList(en, [
        { code: "pediatrics", name: "Pediatrics (Room 4)", room: "4", floor: "G" },
      ]),
    ).toMatch(/^Departments: Pediatrics\./)

    expect(
      speakRouteBrief(en, ["Go straight.", "Turn left.", "Take the lift.", "Arrive."]),
    ).toContain(en.agentRouteMore)
  })

  it("localizes queue status enums", () => {
    expect(localizeQueueStatus("waiting", en)).toBe(en.statusWaiting)
    expect(localizeQueueStatus("called", en)).toBe(en.statusCalled)
  })
})
