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
 * My Slip opens the saved slip when one exists in this tab.
 * Otherwise send the visitor to registration — never invent token details.
 */
export function mySlipDestination(hasSlip: boolean = loadSlip() !== null): "/slip" | "/register" {
  return hasSlip ? "/slip" : "/register"
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
