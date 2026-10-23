import { useContext } from "react"
import { getCatalog } from "../i18n/index.ts"
import { PreferencesContext } from "./context.ts"

export function usePreferences() {
  const value = useContext(PreferencesContext)
  if (!value) {
    throw new Error("usePreferences must be used within PreferencesProvider")
  }
  return value
}

export function useMessages() {
  const { preferences } = usePreferences()
  return getCatalog(preferences.language)
}
