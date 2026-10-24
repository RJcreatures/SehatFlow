import type { HospitalGraph, NavEdge, NavNode } from "./types.ts"

/**
 * Fictional demo map for Nagar Civil Hospital in this hackathon.
 * It is a schematic for testing accessible routes, not a real hospital layout.
 */
const nodes: NavNode[] = [
  { id: "entrance", floor: 0, x: 200, y: 210, labelKey: "navEntrance" },
  { id: "reception", floor: 0, x: 120, y: 170, labelKey: "navReception" },
  { id: "help_desk", floor: 0, x: 280, y: 170, labelKey: "navHelpDesk" },
  { id: "corridor_g_main", floor: 0, x: 200, y: 140, labelKey: "navCorridorGround" },
  { id: "water_station", floor: 0, x: 250, y: 115, labelKey: "navWaterStation" },
  { id: "corridor_g_clinic", floor: 0, x: 300, y: 90, labelKey: "navClinicWingGround" },
  { id: "lift_g", floor: 0, x: 60, y: 140, labelKey: "navLift" },
  { id: "ramp_g", floor: 0, x: 60, y: 90, labelKey: "navRamp" },
  { id: "stairs_g", floor: 0, x: 60, y: 190, labelKey: "navStairs" },
  {
    id: "dept_general_medicine",
    floor: 0,
    x: 360,
    y: 50,
    labelKey: "navDeptGeneralMedicine",
    departmentCode: "general_medicine",
  },
  {
    id: "dept_pediatrics",
    floor: 0,
    x: 360,
    y: 100,
    labelKey: "navDeptPediatrics",
    departmentCode: "pediatrics",
  },
  {
    id: "dept_womens_health",
    floor: 0,
    x: 360,
    y: 150,
    labelKey: "navDeptWomensHealth",
    departmentCode: "womens_health",
  },
  { id: "lift_1", floor: 1, x: 60, y: 360, labelKey: "navLift" },
  { id: "ramp_1", floor: 1, x: 60, y: 310, labelKey: "navRamp" },
  { id: "stairs_1", floor: 1, x: 60, y: 410, labelKey: "navStairs" },
  { id: "corridor_f_main", floor: 1, x: 200, y: 360, labelKey: "navCorridorFirst" },
  {
    id: "dept_orthopedics",
    floor: 1,
    x: 320,
    y: 300,
    labelKey: "navDeptOrthopedics",
    departmentCode: "orthopedics",
  },
  {
    id: "dept_ent",
    floor: 1,
    x: 360,
    y: 340,
    labelKey: "navDeptEnt",
    departmentCode: "ent",
  },
  {
    id: "dept_ophthalmology",
    floor: 1,
    x: 360,
    y: 380,
    labelKey: "navDeptOphthalmology",
    departmentCode: "ophthalmology",
  },
  {
    id: "dept_dermatology",
    floor: 1,
    x: 320,
    y: 420,
    labelKey: "navDeptDermatology",
    departmentCode: "dermatology",
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
  ...undirected("e_entrance_main", "entrance", "corridor_g_main", 25, "corridor", true),
  ...undirected("e_main_reception", "corridor_g_main", "reception", 20, "corridor", true),
  ...undirected("e_main_help", "corridor_g_main", "help_desk", 20, "corridor", true),
  ...undirected(
    "e_main_water",
    "corridor_g_main",
    "water_station",
    15,
    "corridor",
    true,
  ),
  ...undirected(
    "e_water_clinic",
    "water_station",
    "corridor_g_clinic",
    15,
    "corridor",
    true,
  ),
  ...undirected(
    "e_clinic_gm",
    "corridor_g_clinic",
    "dept_general_medicine",
    20,
    "corridor",
    true,
  ),
  ...undirected("e_clinic_pd", "corridor_g_clinic", "dept_pediatrics", 25, "corridor", true),
  ...undirected(
    "e_clinic_wh",
    "corridor_g_clinic",
    "dept_womens_health",
    30,
    "corridor",
    true,
  ),
  ...undirected("e_main_lift", "corridor_g_main", "lift_g", 20, "corridor", true),
  ...undirected("e_main_ramp", "corridor_g_main", "ramp_g", 35, "corridor", true),
  ...undirected("e_main_stairs", "corridor_g_main", "stairs_g", 15, "corridor", true),
  // Floor connectors
  ...undirected("e_lift", "lift_g", "lift_1", 50, "lift", true),
  ...undirected("e_ramp", "ramp_g", "ramp_1", 90, "ramp", true),
  ...undirected("e_stairs", "stairs_g", "stairs_1", 35, "stairs", false),
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
  ...undirected("e_f_ent", "corridor_f_main", "dept_ent", 30, "corridor", true),
  ...undirected(
    "e_f_eye",
    "corridor_f_main",
    "dept_ophthalmology",
    35,
    "corridor",
    true,
  ),
  ...undirected(
    "e_f_skin",
    "corridor_f_main",
    "dept_dermatology",
    40,
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

export function startPointOptions(graph: HospitalGraph = hospitalGraph) {
  return [
    "entrance",
    "reception",
    "help_desk",
    "lift_g",
    "ramp_g",
    "water_station",
  ].filter((id) => graph.nodes[id])
}
