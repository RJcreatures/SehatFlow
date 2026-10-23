import { createContext } from "react"
import type { PreferencesApi } from "./types.ts"

export const PreferencesContext = createContext<PreferencesApi | null>(null)
