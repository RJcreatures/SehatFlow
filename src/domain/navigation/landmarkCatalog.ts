import type { MessageCatalog } from "../../i18n/types.ts"
import { hospitalGraph } from "./hospitalGraph.ts"

/**
 * Structured catalogue for the configured sample hospital.
 * IDs must exist in hospitalGraph before a landmark is offered as routable.
 */
export type LandmarkCategory =
  | "entrance_help"
  | "shared"
  | "clinical"
  | "connector"

export type LandmarkEntry = {
  id: string
  labelKey: keyof MessageCatalog
  category: LandmarkCategory
  /** Shown in From picker when the node exists in the graph. */
  asStart: boolean
  /** Shown in To picker / search when the node exists in the graph. */
  asDestination: boolean
  popular?: boolean
  aliases: readonly string[]
  marker: string
}

export const LANDMARK_CATALOG: readonly LandmarkEntry[] = [
  {
    id: "entrance",
    labelKey: "navEntrance",
    category: "entrance_help",
    asStart: true,
    asDestination: true,
    popular: true,
    marker: "E",
    aliases: [
      "entrance",
      "main entrance",
      "gate",
      "front door",
      "entry",
      "प्रवेश",
      "मुख्य द्वार",
      "گیت",
      "মূল প্রবেশ",
    ],
  },
  {
    id: "opd_entrance",
    labelKey: "navOpdEntrance",
    category: "entrance_help",
    asStart: true,
    asDestination: true,
    popular: true,
    marker: "OE",
    aliases: ["opd entrance", "opd gate", "clinic entrance", "ओपीडी प्रवेश"],
  },
  {
    id: "security_desk",
    labelKey: "navSecurityDesk",
    category: "entrance_help",
    asStart: true,
    asDestination: true,
    marker: "SEC",
    aliases: ["security", "security desk", "guard", "सुरक्षा"],
  },
  {
    id: "help_desk",
    labelKey: "navHelpDesk",
    category: "entrance_help",
    asStart: true,
    asDestination: true,
    popular: true,
    marker: "H",
    aliases: [
      "help desk",
      "helpdesk",
      "information",
      "info desk",
      "हेल्प डेस्क",
      "जानकारी",
    ],
  },
  {
    id: "registration",
    labelKey: "navRegistration",
    category: "entrance_help",
    asStart: true,
    asDestination: true,
    popular: true,
    marker: "REG",
    aliases: [
      "registration",
      "token counter",
      "token",
      "register",
      "पंजीकरण",
      "टोकन काउंटर",
    ],
  },
  {
    id: "opd_reception",
    labelKey: "navOpdReception",
    category: "entrance_help",
    asStart: true,
    asDestination: true,
    popular: true,
    marker: "OR",
    aliases: [
      "opd reception",
      "reception",
      "desk",
      "रिसेप्शन",
      "ओपीडी रिसेप्शन",
    ],
  },
  {
    id: "waiting_area",
    labelKey: "navWaitingArea",
    category: "shared",
    asStart: true,
    asDestination: true,
    popular: true,
    marker: "WA",
    aliases: ["waiting", "waiting area", "waiting hall", "प्रतीक्षा", "वेटिंग"],
  },
  {
    id: "lift_g",
    labelKey: "navLift",
    category: "connector",
    asStart: true,
    asDestination: true,
    popular: true,
    marker: "L",
    aliases: ["lift", "elevator", "लिफ्ट", "elevator lobby", "lift lobby"],
  },
  {
    id: "stairs_g",
    labelKey: "navStairs",
    category: "connector",
    asStart: true,
    asDestination: true,
    marker: "S",
    aliases: ["stairs", "staircase", "सीढ़ी", "सीढ़ियाँ"],
  },
  {
    id: "ramp_g",
    labelKey: "navRamp",
    category: "connector",
    asStart: true,
    asDestination: true,
    marker: "A",
    aliases: ["ramp", "accessible ramp", "रैंप", "wheelchair ramp"],
  },
  {
    id: "washroom_g",
    labelKey: "navWashroom",
    category: "shared",
    asStart: true,
    asDestination: true,
    marker: "WC",
    aliases: [
      "washroom",
      "toilet",
      "restroom",
      "accessible washroom",
      "शौचालय",
      "टॉयलेट",
    ],
  },
  {
    id: "water_station",
    labelKey: "navWaterStation",
    category: "shared",
    asStart: true,
    asDestination: true,
    marker: "W",
    aliases: [
      "water",
      "water station",
      "drinking water",
      "cooler",
      "पानी",
      "पानी का स्थान",
    ],
  },
  {
    id: "pharmacy",
    labelKey: "navPharmacy",
    category: "shared",
    asStart: true,
    asDestination: true,
    popular: true,
    marker: "PH",
    aliases: ["pharmacy", "chemist", "medicine shop", "फार्मेसी", "दवा"],
  },
  {
    id: "billing",
    labelKey: "navBilling",
    category: "shared",
    asStart: true,
    asDestination: true,
    popular: true,
    marker: "BILL",
    aliases: ["billing", "billing counter", "cashier", "payment", "बिलिंग", "कैश"],
  },
  {
    id: "laboratory",
    labelKey: "navLaboratory",
    category: "shared",
    asStart: true,
    asDestination: true,
    popular: true,
    marker: "LAB",
    aliases: [
      "lab",
      "laboratory",
      "sample collection",
      "pathology",
      "लैब",
      "प्रयोगशाला",
    ],
  },
  {
    id: "radiology",
    labelKey: "navRadiology",
    category: "shared",
    asStart: true,
    asDestination: true,
    marker: "XRY",
    aliases: ["radiology", "x-ray", "xray", "x ray", "एक्स रे", "रेडियोलॉजी"],
  },
  {
    id: "blood_collection",
    labelKey: "navBloodCollection",
    category: "shared",
    asStart: true,
    asDestination: true,
    marker: "BLD",
    aliases: ["blood", "blood collection", "blood test", "रक्त", "ब्लड"],
  },
  {
    id: "exit",
    labelKey: "navExit",
    category: "entrance_help",
    asStart: true,
    asDestination: true,
    marker: "EXIT",
    aliases: ["exit", "way out", "निकलने का रास्ता", "बाहर"],
  },
  {
    id: "dept_general_medicine",
    labelKey: "navDeptGeneralMedicine",
    category: "clinical",
    asStart: false,
    asDestination: true,
    popular: true,
    marker: "GM",
    aliases: [
      "general medicine",
      "medicine",
      "gm",
      "doctor",
      "opd",
      "सामान्य चिकित्सा",
      "मेडिसिन",
    ],
  },
  {
    id: "dept_pediatrics",
    labelKey: "navDeptPediatrics",
    category: "clinical",
    asStart: false,
    asDestination: true,
    popular: true,
    marker: "PD",
    aliases: [
      "pediatrics",
      "paediatrics",
      "children",
      "child",
      "kids",
      "बाल",
      "बच्चे",
    ],
  },
  {
    id: "dept_womens_health",
    labelKey: "navDeptWomensHealth",
    category: "clinical",
    asStart: false,
    asDestination: true,
    popular: true,
    marker: "GYN",
    aliases: [
      "women",
      "women's health",
      "womens health",
      "gynae",
      "gynecology",
      "gynaecology",
      "महिला",
      "स्त्री",
    ],
  },
  {
    id: "dept_orthopedics",
    labelKey: "navDeptOrthopedics",
    category: "clinical",
    asStart: false,
    asDestination: true,
    popular: true,
    marker: "OR",
    aliases: [
      "orthopedics",
      "orthopaedics",
      "bones",
      "joints",
      "fracture",
      "हड्डी",
      "जोड़",
    ],
  },
  {
    id: "dept_ent",
    labelKey: "navDeptEnt",
    category: "clinical",
    asStart: false,
    asDestination: true,
    marker: "ENT",
    aliases: ["ent", "ear", "nose", "throat", "कान", "नाक", "गला"],
  },
  {
    id: "dept_ophthalmology",
    labelKey: "navDeptOphthalmology",
    category: "clinical",
    asStart: false,
    asDestination: true,
    popular: true,
    marker: "EY",
    aliases: [
      "eye",
      "eyes",
      "ophthalmology",
      "eye clinic",
      "vision",
      "नेत्र",
      "आँख",
      "आंख",
    ],
  },
  {
    id: "dept_dermatology",
    labelKey: "navDeptDermatology",
    category: "clinical",
    asStart: false,
    asDestination: true,
    marker: "SK",
    aliases: [
      "skin",
      "dermatology",
      "rash",
      "skin problems",
      "त्वचा",
      "चमड़ी",
    ],
  },
  {
    id: "dept_cardiology",
    labelKey: "navDeptCardiology",
    category: "clinical",
    asStart: false,
    asDestination: true,
    popular: true,
    marker: "CARD",
    aliases: ["cardiology", "heart", "cardiac", "हृदय", "कार्डियोलॉजी"],
  },
  {
    id: "dept_dental",
    labelKey: "navDeptDental",
    category: "clinical",
    asStart: false,
    asDestination: true,
    marker: "DEN",
    aliases: ["dental", "dentist", "teeth", "tooth", "दंत", "दांत"],
  },
  {
    id: "dept_physiotherapy",
    labelKey: "navDeptPhysiotherapy",
    category: "clinical",
    asStart: false,
    asDestination: true,
    marker: "PT",
    aliases: [
      "physiotherapy",
      "physio",
      "physical therapy",
      "फिजियो",
      "फिजियोथेरेपी",
    ],
  },
] as const

export function catalogEntry(id: string): LandmarkEntry | undefined {
  return LANDMARK_CATALOG.find((entry) => entry.id === id)
}

/** Landmarks that exist in the graph and may be chosen as From. */
export function routableStartIds(
  graph = hospitalGraph,
): string[] {
  return LANDMARK_CATALOG.filter(
    (entry) => entry.asStart && Boolean(graph.nodes[entry.id]),
  ).map((entry) => entry.id)
}

/** Landmarks/departments that exist in the graph and may be chosen as To. */
export function routableDestinationIds(
  graph = hospitalGraph,
): string[] {
  return LANDMARK_CATALOG.filter(
    (entry) => entry.asDestination && Boolean(graph.nodes[entry.id]),
  ).map((entry) => entry.id)
}

export function popularDestinationIds(graph = hospitalGraph): string[] {
  return LANDMARK_CATALOG.filter(
    (entry) =>
      entry.popular &&
      entry.asDestination &&
      Boolean(graph.nodes[entry.id]),
  ).map((entry) => entry.id)
}

export function destinationsByCategory(
  category: LandmarkCategory,
  graph = hospitalGraph,
): LandmarkEntry[] {
  return LANDMARK_CATALOG.filter(
    (entry) =>
      entry.category === category &&
      entry.asDestination &&
      Boolean(graph.nodes[entry.id]),
  )
}

export function landmarkLabel(
  messages: MessageCatalog,
  id: string,
): string {
  const entry = catalogEntry(id)
  const key = (entry?.labelKey ?? graphLabelKey(id)) as keyof MessageCatalog
  const value = messages[key]
  if (typeof value === "string" && value.trim()) {
    return value
  }
  return id
}

function graphLabelKey(id: string): string {
  return hospitalGraph.nodes[id]?.labelKey ?? id
}

/** Notable stops for compressing written directions. */
export function isNotableNavLandmark(nodeId: string): boolean {
  if (catalogEntry(nodeId)) {
    return true
  }
  const node = hospitalGraph.nodes[nodeId]
  return Boolean(node?.departmentCode)
}

export function landmarkMarker(id: string): string {
  return catalogEntry(id)?.marker ?? "•"
}
