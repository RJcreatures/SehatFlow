/** Allowlisted agent tools — only these may be proposed or executed. */

export const AGENT_TOOLS = [
  "get_my_turn",
  "get_wait_estimate",
  "token_lookup",
  "list_departments",
  "find_route",
  "register_patient",
  "submit_help_request",
  "open_destination",
  "app_help",
] as const

export type AgentToolName = (typeof AGENT_TOOLS)[number]

export const OPEN_DESTINATIONS = [
  "my_turn",
  "slip",
  "find",
  "emergency",
  "register",
  "ask",
  "home",
] as const

export type OpenDestination = (typeof OPEN_DESTINATIONS)[number]

export type RegisterPatientArgs = {
  display_name: string
  age: number
  gender: "female" | "male" | "other" | "undisclosed" | null
  department_code: string
  idempotency_key: string
}

export type FindRouteArgs = {
  destination_code: string
  start_landmark: string
  route_mode: "assisted" | "standard"
}

export type OpenDestinationArgs = {
  destination: OpenDestination
}

export type SubmitHelpArgs = {
  department_code: string | null
}

export type TokenLookupArgs = {
  token_code: string
  access_code: string
}

/** Prefill payload for the existing /find screen. */
export type NavigationHandoff = {
  startId: string
  destinationId: string
}

export type AgentToolCall =
  | { tool: "get_my_turn"; args: Record<string, never> }
  | { tool: "get_wait_estimate"; args: Record<string, never> }
  | { tool: "token_lookup"; args: TokenLookupArgs }
  | { tool: "list_departments"; args: Record<string, never> }
  | { tool: "find_route"; args: FindRouteArgs }
  | { tool: "register_patient"; args: RegisterPatientArgs }
  | { tool: "submit_help_request"; args: SubmitHelpArgs }
  | { tool: "open_destination"; args: OpenDestinationArgs }
  | { tool: "app_help"; args: Record<string, never> }

export type AgentPlan =
  | { kind: "tool"; call: AgentToolCall }
  | AgentClarifyPlan
  | { kind: "unsupported" }
  | {
      kind: "say"
      messageKey:
        | "app_help"
        | "registration_help"
        | "emergency"
        | "repeat_last"
    }

export type AgentClarifyKey =
  | "need_name"
  | "need_age"
  | "need_department"
  | "need_destination"
  | "need_start"
  | "need_token_context"
  | "need_token_code"
  | "need_access_code"
  | "need_token_and_access"
  | "need_clarify_register"
  | "token_lookup_rate_limited"

export type AgentClarifyPlan = {
  kind: "clarify"
  messageKey: AgentClarifyKey
  tool: AgentToolName
  /** Destination waiting on a start landmark (directions). */
  pendingDestination?: string
}

export type RegistrationDraft = {
  display_name: string | null
  age: number | null
  gender: RegisterPatientArgs["gender"]
  department_code: string | null
  idempotency_key: string
}

export function isAgentToolName(value: unknown): value is AgentToolName {
  return (
    typeof value === "string" &&
    (AGENT_TOOLS as readonly string[]).includes(value)
  )
}

export function isOpenDestination(value: unknown): value is OpenDestination {
  return (
    typeof value === "string" &&
    (OPEN_DESTINATIONS as readonly string[]).includes(value)
  )
}
