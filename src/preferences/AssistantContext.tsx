import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { LiveQueueHint } from "../domain/agent/execute.ts"
import type { DepartmentFact, TokenContext } from "../domain/voice/answers.ts"
import type { RouteMode } from "../domain/navigation/types.ts"

export type AssistantRouteContext = {
  routeMode: RouteMode
  startId: string
}

type AssistantContextValue = {
  token: TokenContext | null
  liveQueue: LiveQueueHint | null
  departments: DepartmentFact[]
  route: AssistantRouteContext | null
  setTokenContext: (token: TokenContext | null) => void
  setLiveQueue: (live: LiveQueueHint | null) => void
  setDepartments: (departments: DepartmentFact[]) => void
  setRouteContext: (route: AssistantRouteContext | null) => void
}

const AssistantContext = createContext<AssistantContextValue | null>(null)

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<TokenContext | null>(null)
  const [liveQueue, setLiveQueueState] = useState<LiveQueueHint | null>(null)
  const [departments, setDepartmentsState] = useState<DepartmentFact[]>([])
  const [route, setRoute] = useState<AssistantRouteContext | null>(null)

  const setTokenContext = useCallback((next: TokenContext | null) => {
    setToken(next)
  }, [])

  const setLiveQueue = useCallback((next: LiveQueueHint | null) => {
    setLiveQueueState(next)
  }, [])

  const setDepartments = useCallback((next: DepartmentFact[]) => {
    setDepartmentsState(next)
  }, [])

  const setRouteContext = useCallback((next: AssistantRouteContext | null) => {
    setRoute(next)
  }, [])

  const value = useMemo(
    () => ({
      token,
      liveQueue,
      departments,
      route,
      setTokenContext,
      setLiveQueue,
      setDepartments,
      setRouteContext,
    }),
    [
      token,
      liveQueue,
      departments,
      route,
      setTokenContext,
      setLiveQueue,
      setDepartments,
      setRouteContext,
    ],
  )

  return (
    <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
  )
}

export function useAssistantContext(): AssistantContextValue {
  const value = useContext(AssistantContext)
  if (!value) {
    throw new Error("useAssistantContext requires AssistantProvider")
  }
  return value
}
