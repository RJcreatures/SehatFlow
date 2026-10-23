import { useContext } from "react"
import { StaffAuthContext } from "./StaffAuthContext.ts"

export function useStaffAuth() {
  const value = useContext(StaffAuthContext)
  if (!value) {
    throw new Error("useStaffAuth requires StaffAuthProvider")
  }
  return value
}
