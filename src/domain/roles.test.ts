import { describe, expect, it } from "vitest"
import { staffCan } from "./roles.ts"

describe("staffCan", () => {
  it("allows queue managers to call next and reset", () => {
    expect(staffCan("queue_manager", "call_next")).toBe(true)
    expect(staffCan("queue_manager", "reset_demo")).toBe(true)
  })

  it("limits doctors to complete and doctor status", () => {
    expect(staffCan("doctor", "complete")).toBe(true)
    expect(staffCan("doctor", "set_doctor_status")).toBe(true)
    expect(staffCan("doctor", "call_next")).toBe(false)
    expect(staffCan("doctor", "reset_demo")).toBe(false)
  })

  it("gives registrars no mutation actions", () => {
    expect(staffCan("registrar", "call_next")).toBe(false)
    expect(staffCan("registrar", "complete")).toBe(false)
    expect(staffCan("registrar", "acknowledge_urgent")).toBe(false)
  })
})
