/**
 * Server-side allowlist for agent tool proposals.
 * Mirrors src/domain/agent — model output never executes freely.
 */

export const AGENT_TOOLS = [
  "get_my_turn",
  "get_wait_estimate",
  "list_departments",
  "find_route",
  "register_patient",
  "submit_help_request",
  "open_destination",
  "app_help",
] as const

export type AgentToolName = (typeof AGENT_TOOLS)[number]

const OPEN_DESTINATIONS = new Set([
  "my_turn",
  "slip",
  "find",
  "emergency",
  "register",
  "ask",
  "home",
])

const DEPARTMENT_PATTERN = /^[a-z0-9_]{2,32}$/
const LANDMARKS = new Set([
  "entrance",
  "reception",
  "help_desk",
  "lift_g",
  "ramp_g",
  "water_station",
])

export function isAgentToolName(value: unknown): value is AgentToolName {
  return (
    typeof value === "string" &&
    (AGENT_TOOLS as readonly string[]).includes(value)
  )
}

/**
 * Validate a proposed tool call. Rejects unknown tools and invalid args.
 * Never grants SQL, arbitrary RPC, or service-role access.
 */
export function validateAgentToolProposal(
  raw: unknown,
): { ok: true; tool: AgentToolName; args: Record<string, unknown> } | {
  ok: false
  error: string
} {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "malformed tool proposal" }
  }
  const record = raw as Record<string, unknown>
  if (!isAgentToolName(record.tool)) {
    return { ok: false, error: "tool not allowlisted" }
  }
  const tool = record.tool
  const args =
    record.args && typeof record.args === "object"
      ? (record.args as Record<string, unknown>)
      : {}

  switch (tool) {
    case "get_my_turn":
    case "get_wait_estimate":
    case "list_departments":
    case "app_help":
      return { ok: true, tool, args: {} }
    case "submit_help_request": {
      const department_code =
        typeof args.department_code === "string" &&
          DEPARTMENT_PATTERN.test(args.department_code)
          ? args.department_code
          : null
      return { ok: true, tool, args: { department_code } }
    }
    case "open_destination": {
      if (
        typeof args.destination !== "string" ||
        !OPEN_DESTINATIONS.has(args.destination)
      ) {
        return { ok: false, error: "invalid destination" }
      }
      return { ok: true, tool, args: { destination: args.destination } }
    }
    case "find_route": {
      if (
        typeof args.destination_code !== "string" ||
        !DEPARTMENT_PATTERN.test(args.destination_code)
      ) {
        return { ok: false, error: "invalid destination_code" }
      }
      const start_landmark =
        typeof args.start_landmark === "string" &&
          LANDMARKS.has(args.start_landmark)
          ? args.start_landmark
          : "entrance"
      const route_mode =
        args.route_mode === "standard" ? "standard" : "assisted"
      return {
        ok: true,
        tool,
        args: {
          destination_code: args.destination_code,
          start_landmark,
          route_mode,
        },
      }
    }
    case "register_patient": {
      if (typeof args.display_name !== "string") {
        return { ok: false, error: "invalid display_name" }
      }
      const display_name = args.display_name.trim().replace(/\s+/g, " ")
      if (display_name.length < 1 || display_name.length > 80) {
        return { ok: false, error: "invalid display_name" }
      }
      if (typeof args.age !== "number" || !Number.isInteger(args.age)) {
        return { ok: false, error: "invalid age" }
      }
      if (args.age < 0 || args.age > 120) {
        return { ok: false, error: "invalid age" }
      }
      if (
        typeof args.department_code !== "string" ||
        !DEPARTMENT_PATTERN.test(args.department_code)
      ) {
        return { ok: false, error: "invalid department_code" }
      }
      if (
        typeof args.idempotency_key !== "string" ||
        args.idempotency_key.trim().length < 8
      ) {
        return { ok: false, error: "invalid idempotency_key" }
      }
      let gender: string | null = null
      if (
        args.gender === "female" ||
        args.gender === "male" ||
        args.gender === "other" ||
        args.gender === "undisclosed"
      ) {
        gender = args.gender
      } else if (args.gender != null && args.gender !== "") {
        return { ok: false, error: "invalid gender" }
      }
      return {
        ok: true,
        tool,
        args: {
          display_name,
          age: args.age,
          gender,
          department_code: args.department_code,
          idempotency_key: args.idempotency_key.trim(),
        },
      }
    }
    default:
      return { ok: false, error: "tool not allowlisted" }
  }
}
