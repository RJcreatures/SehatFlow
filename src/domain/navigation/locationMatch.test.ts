import { describe, expect, it } from "vitest"
import { matchDepartmentText, matchLandmarkText } from "./locationMatch.ts"

describe("matchLandmarkText", () => {
  it("resolves a known landmark from a custom description", () => {
    const result = matchLandmarkText("I'm near reception beside the desk")
    expect(result.status).toBe("exact")
    if (result.status === "exact") {
      expect(["reception", "opd_reception"]).toContain(result.candidate.code)
    }
  })

  it("asks for confirmation when several landmarks could match", () => {
    const result = matchLandmarkText("near the desk and lift")
    expect(result.status).toBe("suggestions")
    if (result.status === "suggestions") {
      const codes = result.candidates.map((item) => item.code)
      expect(codes).toEqual(expect.arrayContaining(["lift_g"]))
      expect(
        codes.some((code) => code === "reception" || code === "opd_reception"),
      ).toBe(true)
    }
  })

  it("returns none for unmatched text instead of inventing a place", () => {
    expect(matchLandmarkText("parking lot rooftop cafe").status).toBe("none")
  })
})

describe("matchDepartmentText", () => {
  const codes = [
    "general_medicine",
    "pediatrics",
    "womens_health",
    "orthopedics",
    "ent",
    "ophthalmology",
    "dermatology",
  ]

  it("resolves department aliases only to configured codes", () => {
    const eye = matchDepartmentText("eye department", codes)
    expect(eye.status).toBe("exact")
    if (eye.status === "exact") {
      expect(eye.candidate.code).toBe("ophthalmology")
    }

    const skin = matchDepartmentText("the room for skin problems", codes)
    expect(skin.status).toBe("exact")
    if (skin.status === "exact") {
      expect(skin.candidate.code).toBe("dermatology")
    }
  })

  it("rejects departments that are not in the active list", () => {
    const result = matchDepartmentText("eye department", ["pediatrics"])
    expect(result.status).toBe("none")
  })
})
