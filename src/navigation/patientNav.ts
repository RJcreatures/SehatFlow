import { loadSlip } from "../lib/slipStorage.ts"

/** Patient bottom-nav destinations (excluding the central My Slip action). */
export const patientNavItems = [
  { id: "home", to: "/", match: (path: string) => path === "/" },
  { id: "find", to: "/find", match: (path: string) => path === "/find" },
  {
    id: "askAi",
    to: "/ask",
    match: (path: string) => path === "/ask",
  },
  {
    id: "settings",
    to: "/settings",
    match: (path: string) => path === "/settings",
  },
] as const

export type PatientNavId = (typeof patientNavItems)[number]["id"] | "mySlip"

/**
 * My Slip is the single patient status surface (token, wait, staff QR).
 * Empty tabs still open /slip so visitors can recover with token + access code.
 */
export function mySlipDestination(_hasSlip: boolean = loadSlip() !== null): "/slip" {
  return "/slip"
}

export function shouldShowPatientBottomNav(pathname: string): boolean {
  if (pathname.startsWith("/staff")) {
    return false
  }
  if (pathname === "/board") {
    return false
  }
  return true
}

/** Extra main padding so fixed bottom nav does not cover page content. */
export const PATIENT_BOTTOM_NAV_SPACE = "5.75rem"
