import type { MessageCatalog } from "../i18n/types.ts"
import type { UiLanguage } from "../i18n/index.ts"

/**
 * Prefer localized demo navigation labels (all nine UI languages) over
 * bilingual DB fields (name_en / name_hi only). Does not invent official
 * hospital translations — catalog strings are demonstration labels that
 * still need native-speaker review for clinical use.
 */
const DEPT_MESSAGE_KEYS = {
  general_medicine: "navDeptGeneralMedicine",
  pediatrics: "navDeptPediatrics",
  womens_health: "navDeptWomensHealth",
  orthopedics: "navDeptOrthopedics",
  ent: "navDeptEnt",
  ophthalmology: "navDeptOphthalmology",
  dermatology: "navDeptDermatology",
  cardiology: "navDeptCardiology",
  dental: "navDeptDental",
  physiotherapy: "navDeptPhysiotherapy",
} as const satisfies Record<string, keyof MessageCatalog>

export type DepartmentNameFields = {
  code: string
  name_en?: string | null
  name_hi?: string | null
}

export function localizedDepartmentName(
  messages: MessageCatalog,
  language: UiLanguage,
  department: DepartmentNameFields,
): string {
  const key = DEPT_MESSAGE_KEYS[department.code as keyof typeof DEPT_MESSAGE_KEYS]
  if (key) {
    const labeled = messages[key]
    if (typeof labeled === "string" && labeled.trim()) {
      return labeled
    }
  }
  if (language === "hi" && department.name_hi?.trim()) {
    return department.name_hi
  }
  if (department.name_en?.trim()) {
    return department.name_en
  }
  if (department.name_hi?.trim()) {
    return department.name_hi
  }
  return department.code
}

export function localizedRoomFloor(
  language: UiLanguage,
  fields: {
    room_en?: string | null
    room_hi?: string | null
    floor_en?: string | null
    floor_hi?: string | null
  },
  fallback: string,
): { room: string; floor: string } {
  if (language === "hi") {
    return {
      room: fields.room_hi?.trim() || fields.room_en?.trim() || fallback,
      floor: fields.floor_hi?.trim() || fields.floor_en?.trim() || fallback,
    }
  }
  return {
    room: fields.room_en?.trim() || fields.room_hi?.trim() || fallback,
    floor: fields.floor_en?.trim() || fields.floor_hi?.trim() || fallback,
  }
}
