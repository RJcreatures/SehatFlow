/**
 * Where the floating SehatFlow assistant may appear.
 * Staff, board, and print layouts never mount PatientLayout chrome for this.
 */
export function shouldShowGlobalAssistant(pathname: string): boolean {
  if (pathname.startsWith("/staff")) {
    return false
  }
  if (pathname === "/board") {
    return false
  }
  // Emergency keeps its own sticky action; assistant must not compete with it.
  if (pathname === "/emergency") {
    return false
  }
  // Full-page Ask AI already hosts the conversation — hide the duplicate FAB.
  if (pathname === "/ask") {
    return false
  }
  return true
}

/** Patient routes where the FAB is expected in the shared layout. */
export const GLOBAL_ASSISTANT_ROUTES = [
  "/",
  "/register",
  "/my-turn",
  "/slip",
  "/find",
  "/visit-days",
  "/settings",
] as const
