import {
  departmentDestinationId,
  hospitalGraph,
} from "../navigation/hospitalGraph.ts"
import type { MessageCatalog } from "../../i18n/types.ts"
import type { DepartmentFact } from "./answers.ts"

const CODES = [
  "general_medicine",
  "pediatrics",
  "womens_health",
  "orthopedics",
  "ent",
  "ophthalmology",
  "dermatology",
] as const

const LABEL_KEYS = {
  general_medicine: "navDeptGeneralMedicine",
  pediatrics: "navDeptPediatrics",
  womens_health: "navDeptWomensHealth",
  orthopedics: "navDeptOrthopedics",
  ent: "navDeptEnt",
  ophthalmology: "navDeptOphthalmology",
  dermatology: "navDeptDermatology",
} as const satisfies Record<(typeof CODES)[number], keyof MessageCatalog>

/** Configured hospital departments for voice department_info answers. */
export function configuredDepartmentFacts(
  messages: MessageCatalog,
): DepartmentFact[] {
  return CODES.filter((code) => departmentDestinationId(code)).map((code) => {
    const name = String(messages[LABEL_KEYS[code]])
    const nodeId = departmentDestinationId(code)
    const node = nodeId ? hospitalGraph.nodes[nodeId] : null
    const roomMatch = name.match(/\(([^)]+)\)/)
    return {
      code,
      name,
      room: roomMatch?.[1] ?? messages.notAvailable,
      floor:
        node?.floor === 1 ? messages.findFloorFirst : messages.findFloorGround,
    }
  })
}
