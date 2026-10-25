import type { HospitalGraph, NavEdge, NavNode } from "./types.ts"

/**
 * Configured sample-hospital schematic for SehatFlow demos.
 * Not a real hospital floor plan. Only nodes listed here are routable.
 */
const nodes: NavNode[] = [
  // Ground — entrance & help
  { id: "entrance", floor: 0, x: 210, y: 230, labelKey: "navEntrance" },
  { id: "opd_entrance", floor: 0, x: 150, y: 215, labelKey: "navOpdEntrance" },
  { id: "security_desk", floor: 0, x: 270, y: 215, labelKey: "navSecurityDesk" },
  { id: "exit", floor: 0, x: 320, y: 230, labelKey: "navExit" },
  { id: "corridor_g_main", floor: 0, x: 210, y: 160, labelKey: "navCorridorGround" },
  { id: "registration", floor: 0, x: 100, y: 175, labelKey: "navRegistration" },
  { id: "opd_reception", floor: 0, x: 120, y: 135, labelKey: "navOpdReception" },
  { id: "reception", floor: 0, x: 90, y: 145, labelKey: "navReception" },
  { id: "help_desk", floor: 0, x: 300, y: 160, labelKey: "navHelpDesk" },
  { id: "waiting_area", floor: 0, x: 210, y: 120, labelKey: "navWaitingArea" },
  { id: "water_station", floor: 0, x: 260, y: 120, labelKey: "navWaterStation" },
  { id: "washroom_g", floor: 0, x: 160, y: 120, labelKey: "navWashroom" },
  { id: "lift_g", floor: 0, x: 45, y: 160, labelKey: "navLift" },
  { id: "ramp_g", floor: 0, x: 45, y: 105, labelKey: "navRamp" },
  { id: "stairs_g", floor: 0, x: 45, y: 210, labelKey: "navStairs" },
  // Ground — shared services
  { id: "corridor_g_services", floor: 0, x: 340, y: 120, labelKey: "navCorridorGround" },
  { id: "pharmacy", floor: 0, x: 340, y: 175, labelKey: "navPharmacy" },
  { id: "billing", floor: 0, x: 390, y: 175, labelKey: "navBilling" },
  { id: "laboratory", floor: 0, x: 340, y: 55, labelKey: "navLaboratory" },
  { id: "radiology", floor: 0, x: 390, y: 55, labelKey: "navRadiology" },
  { id: "blood_collection", floor: 0, x: 390, y: 100, labelKey: "navBloodCollection" },
  // Ground — clinics
  { id: "corridor_g_clinic", floor: 0, x: 300, y: 90, labelKey: "navClinicWingGround" },
  {
    id: "dept_general_medicine",
    floor: 0,
    x: 370,
    y: 40,
    labelKey: "navDeptGeneralMedicine",
    departmentCode: "general_medicine",
  },
  {
    id: "dept_pediatrics",
    floor: 0,
    x: 370,
    y: 85,
    labelKey: "navDeptPediatrics",
    departmentCode: "pediatrics",
  },
  {
    id: "dept_womens_health",
    floor: 0,
    x: 370,
    y: 130,
    labelKey: "navDeptWomensHealth",
    departmentCode: "womens_health",
  },
  // First floor connectors & corridor
  { id: "lift_1", floor: 1, x: 45, y: 370, labelKey: "navLift" },
  { id: "ramp_1", floor: 1, x: 45, y: 320, labelKey: "navRamp" },
  { id: "stairs_1", floor: 1, x: 45, y: 420, labelKey: "navStairs" },
  { id: "corridor_f_main", floor: 1, x: 210, y: 370, labelKey: "navCorridorFirst" },
  {
    id: "dept_orthopedics",
    floor: 1,
    x: 320,
    y: 310,
    labelKey: "navDeptOrthopedics",
    departmentCode: "orthopedics",
  },
  {
    id: "dept_ent",
    floor: 1,
    x: 370,
    y: 345,
    labelKey: "navDeptEnt",
    departmentCode: "ent",
  },
  {
    id: "dept_ophthalmology",
    floor: 1,
    x: 370,
    y: 390,
    labelKey: "navDeptOphthalmology",
    departmentCode: "ophthalmology",
  },
  {
    id: "dept_dermatology",
    floor: 1,
    x: 320,
    y: 430,
    labelKey: "navDeptDermatology",
    departmentCode: "dermatology",
  },
  {
    id: "dept_cardiology",
    floor: 1,
    x: 280,
    y: 320,
    labelKey: "navDeptCardiology",
    departmentCode: "cardiology",
  },
  {
    id: "dept_dental",
    floor: 1,
    x: 280,
    y: 420,
    labelKey: "navDeptDental",
    departmentCode: "dental",
  },
  {
    id: "dept_physiotherapy",
    floor: 1,
    x: 240,
    y: 305,
    labelKey: "navDeptPhysiotherapy",
    departmentCode: "physiotherapy",
  },
]

function undirected(
  id: string,
  a: string,
  b: string,
  seconds: number,
  kind: NavEdge["kind"],
  stepFree: boolean,
): NavEdge[] {
  return [
    { id: `${id}_ab`, from: a, to: b, seconds, kind, stepFree },
    { id: `${id}_ba`, from: b, to: a, seconds, kind, stepFree },
  ]
}

const edges: NavEdge[] = [
  // Entrance cluster
  ...undirected("e_entrance_main", "entrance", "corridor_g_main", 25, "corridor", true),
  ...undirected("e_entrance_opd", "entrance", "opd_entrance", 12, "corridor", true),
  ...undirected("e_entrance_sec", "entrance", "security_desk", 12, "corridor", true),
  ...undirected("e_opd_main", "opd_entrance", "corridor_g_main", 18, "corridor", true),
  ...undirected("e_sec_main", "security_desk", "corridor_g_main", 18, "corridor", true),
  ...undirected("e_sec_exit", "security_desk", "exit", 15, "corridor", true),
  ...undirected("e_exit_main", "exit", "corridor_g_main", 28, "corridor", true),
  // Registration / reception / help
  ...undirected("e_main_reg", "corridor_g_main", "registration", 18, "corridor", true),
  ...undirected("e_reg_reception", "registration", "reception", 10, "corridor", true),
  ...undirected("e_reg_opd_rec", "registration", "opd_reception", 12, "corridor", true),
  ...undirected("e_main_opd_rec", "corridor_g_main", "opd_reception", 20, "corridor", true),
  ...undirected("e_main_reception", "corridor_g_main", "reception", 22, "corridor", true),
  ...undirected("e_main_help", "corridor_g_main", "help_desk", 20, "corridor", true),
  // Waiting / amenities
  ...undirected("e_main_wait", "corridor_g_main", "waiting_area", 14, "corridor", true),
  ...undirected("e_wait_water", "waiting_area", "water_station", 10, "corridor", true),
  ...undirected("e_wait_wash", "waiting_area", "washroom_g", 12, "corridor", true),
  ...undirected("e_main_water", "corridor_g_main", "water_station", 16, "corridor", true),
  // Vertical access
  ...undirected("e_main_lift", "corridor_g_main", "lift_g", 20, "corridor", true),
  ...undirected("e_main_ramp", "corridor_g_main", "ramp_g", 35, "corridor", true),
  ...undirected("e_main_stairs", "corridor_g_main", "stairs_g", 15, "corridor", true),
  ...undirected("e_lift", "lift_g", "lift_1", 50, "lift", true),
  ...undirected("e_ramp", "ramp_g", "ramp_1", 90, "ramp", true),
  ...undirected("e_stairs", "stairs_g", "stairs_1", 35, "stairs", false),
  // Services wing
  ...undirected("e_water_services", "water_station", "corridor_g_services", 15, "corridor", true),
  ...undirected("e_help_services", "help_desk", "corridor_g_services", 18, "corridor", true),
  ...undirected("e_services_pharm", "corridor_g_services", "pharmacy", 14, "corridor", true),
  ...undirected("e_pharm_bill", "pharmacy", "billing", 12, "corridor", true),
  ...undirected("e_services_lab", "corridor_g_services", "laboratory", 16, "corridor", true),
  ...undirected("e_lab_rad", "laboratory", "radiology", 12, "corridor", true),
  ...undirected("e_services_blood", "corridor_g_services", "blood_collection", 14, "corridor", true),
  ...undirected("e_blood_rad", "blood_collection", "radiology", 10, "corridor", true),
  // Clinic wing
  ...undirected("e_services_clinic", "corridor_g_services", "corridor_g_clinic", 12, "corridor", true),
  ...undirected("e_water_clinic", "water_station", "corridor_g_clinic", 15, "corridor", true),
  ...undirected(
    "e_clinic_gm",
    "corridor_g_clinic",
    "dept_general_medicine",
    20,
    "corridor",
    true,
  ),
  ...undirected("e_clinic_pd", "corridor_g_clinic", "dept_pediatrics", 22, "corridor", true),
  ...undirected(
    "e_clinic_wh",
    "corridor_g_clinic",
    "dept_womens_health",
    26,
    "corridor",
    true,
  ),
  // First floor
  ...undirected("e_lift_f", "lift_1", "corridor_f_main", 20, "corridor", true),
  ...undirected("e_ramp_f", "ramp_1", "corridor_f_main", 30, "corridor", true),
  ...undirected("e_stairs_f", "stairs_1", "corridor_f_main", 15, "corridor", true),
  ...undirected(
    "e_f_or",
    "corridor_f_main",
    "dept_orthopedics",
    25,
    "corridor",
    true,
  ),
  ...undirected("e_f_ent", "corridor_f_main", "dept_ent", 28, "corridor", true),
  ...undirected(
    "e_f_eye",
    "corridor_f_main",
    "dept_ophthalmology",
    32,
    "corridor",
    true,
  ),
  ...undirected(
    "e_f_skin",
    "corridor_f_main",
    "dept_dermatology",
    36,
    "corridor",
    true,
  ),
  ...undirected(
    "e_f_card",
    "corridor_f_main",
    "dept_cardiology",
    22,
    "corridor",
    true,
  ),
  ...undirected("e_f_den", "corridor_f_main", "dept_dental", 30, "corridor", true),
  ...undirected(
    "e_f_pt",
    "corridor_f_main",
    "dept_physiotherapy",
    24,
    "corridor",
    true,
  ),
]

export const hospitalGraph: HospitalGraph = {
  nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
  edges,
}

export const DEFAULT_START_NODE_ID = "entrance"

export function departmentDestinationId(
  departmentCode: string,
  graph: HospitalGraph = hospitalGraph,
): string | null {
  const match = Object.values(graph.nodes).find(
    (node) => node.departmentCode === departmentCode,
  )
  return match?.id ?? null
}

const START_CANDIDATES = [
  "entrance",
  "opd_entrance",
  "security_desk",
  "help_desk",
  "registration",
  "opd_reception",
  "waiting_area",
  "lift_g",
  "ramp_g",
  "stairs_g",
  "washroom_g",
  "water_station",
  "pharmacy",
  "billing",
  "laboratory",
  "radiology",
  "blood_collection",
  "exit",
] as const

export function startPointOptions(graph: HospitalGraph = hospitalGraph) {
  return START_CANDIDATES.filter((id) => graph.nodes[id])
}

/** True when both ends exist and a path can be attempted. */
export function isRoutableNodeId(
  nodeId: string,
  graph: HospitalGraph = hospitalGraph,
): boolean {
  return Boolean(graph.nodes[nodeId])
}
