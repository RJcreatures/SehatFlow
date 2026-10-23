import { describe, expect, it } from "vitest"
import {
  generateAccessCode,
  sha256Hex,
  validateMyTurnInput,
  validateRegistrationInput,
} from "./registration.ts"

describe("validateRegistrationInput", () => {
  it("accepts a complete fictional registration", () => {
    const result = validateRegistrationInput({
      displayName: "  Demo Patient 21 ",
      ageText: "45",
      gender: "undisclosed",
      departmentCode: "general_medicine",
    })
    expect(result).toEqual({
      ok: true,
      value: {
        displayName: "Demo Patient 21",
        age: 45,
        gender: "undisclosed",
        departmentCode: "general_medicine",
      },
    })
  })

  it("allows a null gender when the field is blank", () => {
    const result = validateRegistrationInput({
      displayName: "Demo Patient",
      ageText: "12",
      gender: "",
      departmentCode: "pediatrics",
    })
    expect(result.ok && result.value.gender).toBeNull()
  })

  it("rejects empty names and out-of-range ages", () => {
    expect(
      validateRegistrationInput({
        displayName: "   ",
        ageText: "45",
        gender: "",
        departmentCode: "general_medicine",
      }).ok,
    ).toBe(false)
    expect(
      validateRegistrationInput({
        displayName: "Demo",
        ageText: "121",
        gender: "",
        departmentCode: "general_medicine",
      }),
    ).toEqual({ ok: false, field: "age" })
  })
})

describe("validateMyTurnInput", () => {
  it("normalizes token and access code casing", () => {
    expect(
      validateMyTurnInput({
        tokenCode: "gm-021",
        accessCode: "abcd2345",
      }),
    ).toEqual({
      ok: true,
      tokenCode: "GM-021",
      accessCode: "ABCD2345",
    })
  })

  it("rejects malformed token or access codes without revealing matches", () => {
    expect(
      validateMyTurnInput({
        tokenCode: "bad",
        accessCode: "ABCD2345",
      }),
    ).toEqual({ ok: false, field: "token" })
    expect(
      validateMyTurnInput({
        tokenCode: "GM-021",
        accessCode: "short",
      }),
    ).toEqual({ ok: false, field: "access_code" })
  })
})

describe("access code helpers", () => {
  it("creates an 8-character code from secure bytes", () => {
    const code = generateAccessCode(new Uint8Array(8).fill(3))
    expect(code).toHaveLength(8)
    expect(code).toMatch(/^[A-Z0-9]+$/)
  })

  it("hashes access codes as lowercase hex sha-256", async () => {
    const hash = await sha256Hex("ABCD2345")
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toBe("ABCD2345")
  })
})
