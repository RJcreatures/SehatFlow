import { describe, expect, it } from "vitest"
import { en } from "../i18n/en.ts"
import { hi } from "../i18n/hi.ts"
import { pa } from "../i18n/pa.ts"
import { localizedDepartmentName, localizedRoomFloor } from "./departmentLabels.ts"

describe("localizedDepartmentName", () => {
  it("uses catalog labels for all UI languages, not only English/Hindi DB fields", () => {
    expect(
      localizedDepartmentName(pa, "pa", {
        code: "ophthalmology",
        name_en: "Ophthalmology",
        name_hi: "नेत्र",
      }),
    ).toBe(pa.navDeptOphthalmology)
    expect(
      localizedDepartmentName(hi, "hi", {
        code: "general_medicine",
        name_en: "General Medicine",
        name_hi: "सामान्य चिकित्सा",
      }),
    ).toBe(hi.navDeptGeneralMedicine)
    expect(
      localizedDepartmentName(en, "en", {
        code: "ent",
        name_en: "ENT",
        name_hi: "कान",
      }),
    ).toBe(en.navDeptEnt)
  })

  it("falls back to bilingual DB fields when code is unknown", () => {
    expect(
      localizedDepartmentName(en, "en", {
        code: "unknown_dept",
        name_en: "Demo Clinic",
        name_hi: "डेमो",
      }),
    ).toBe("Demo Clinic")
    expect(
      localizedDepartmentName(hi, "hi", {
        code: "unknown_dept",
        name_en: "Demo Clinic",
        name_hi: "डेमो",
      }),
    ).toBe("डेमो")
  })
})

describe("localizedRoomFloor", () => {
  it("prefers Hindi fields for hi and English otherwise", () => {
    expect(
      localizedRoomFloor(
        "hi",
        { room_en: "Room 12", room_hi: "कक्ष 12", floor_en: "G", floor_hi: "भूतल" },
        "n/a",
      ),
    ).toEqual({ room: "कक्ष 12", floor: "भूतल" })
    expect(
      localizedRoomFloor(
        "pa",
        { room_en: "Room 12", room_hi: "कक्ष 12", floor_en: "G", floor_hi: "भूतल" },
        "n/a",
      ),
    ).toEqual({ room: "Room 12", floor: "G" })
  })
})
