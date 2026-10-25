import { hospitalGraph } from "../navigation/hospitalGraph.ts"
import { routableStartIds } from "../navigation/landmarkCatalog.ts"
import {
  AGENT_TOOLS,
  isAgentToolName,
  isOpenDestination,
  type AgentToolCall,
  type AgentToolName,
  type RegisterPatientArgs,
} from "./types.ts"
import { resolveDestinationNodeId } from "./navigationTarget.ts"

const DEPARTMENT_PATTERN = /^[a-z0-9_]{2,32}$/
const START_LANDMARKS = new Set(routableStartIds())

/**
 * Strict allowlist validation. Unknown tools/args are rejected — never executed.
 */
export function parseAgentToolCall(raw: unknown): AgentToolCall | null {
  if (!raw || typeof raw !== "object") {
    return null
  }
  const record = raw as Record<string, unknown>
  if (!isAgentToolName(record.tool)) {
    return null
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
      return { tool, args: {} }
    case "token_lookup": {
      if (
        typeof args.token_code !== "string" ||
        typeof args.access_code !== "string"
      ) {
        return null
      }
      const token_code = args.token_code.trim().toUpperCase()
      const access_code = args.access_code.trim().toUpperCase()
      if (
        !/^[A-Z0-9]{1,8}-[0-9]{1,4}$/.test(token_code) ||
        !/^[A-Z0-9]{8}$/.test(access_code)
      ) {
        return null
      }
      return { tool, args: { token_code, access_code } }
    }
    case "submit_help_request": {
      const department_code =
        typeof args.department_code === "string" &&
        DEPARTMENT_PATTERN.test(args.department_code)
          ? args.department_code
          : null
      return { tool, args: { department_code } }
    }
    case "open_destination": {
      if (!isOpenDestination(args.destination)) {
        return null
      }
      return { tool, args: { destination: args.destination } }
    }
    case "find_route": {
      if (typeof args.destination_code !== "string") {
        return null
      }
      const destinationNode = resolveDestinationNodeId(args.destination_code)
      if (!destinationNode || !hospitalGraph.nodes[destinationNode]) {
        return null
      }
      const start =
        typeof args.start_landmark === "string" &&
        START_LANDMARKS.has(args.start_landmark)
          ? args.start_landmark
          : "entrance"
      const route_mode =
        args.route_mode === "standard" ? "standard" : "assisted"
      return {
        tool,
        args: {
          destination_code: destinationNode,
          start_landmark: start,
          route_mode,
        },
      }
    }
    case "register_patient": {
      const parsed = parseRegisterArgs(args)
      if (!parsed) {
        return null
      }
      return { tool, args: parsed }
    }
    default: {
      const _exhaustive: never = tool
      void _exhaustive
      return null
    }
  }
}

function parseRegisterArgs(args: Record<string, unknown>): RegisterPatientArgs | null {
  if (typeof args.display_name !== "string") {
    return null
  }
  const display_name = args.display_name.trim().replace(/\s+/g, " ")
  if (display_name.length < 1 || display_name.length > 80) {
    return null
  }
  if (typeof args.age !== "number" || !Number.isInteger(args.age)) {
    return null
  }
  if (args.age < 0 || args.age > 120) {
    return null
  }
  if (
    typeof args.department_code !== "string" ||
    !DEPARTMENT_PATTERN.test(args.department_code)
  ) {
    return null
  }
  let gender: RegisterPatientArgs["gender"] = null
  if (args.gender === null || args.gender === undefined || args.gender === "") {
    gender = null
  } else if (
    args.gender === "female" ||
    args.gender === "male" ||
    args.gender === "other" ||
    args.gender === "undisclosed"
  ) {
    gender = args.gender
  } else {
    return null
  }
  const idempotency_key =
    typeof args.idempotency_key === "string" &&
    args.idempotency_key.trim().length >= 8
      ? args.idempotency_key.trim()
      : null
  if (!idempotency_key) {
    return null
  }
  return {
    display_name,
    age: args.age,
    gender,
    department_code: args.department_code,
    idempotency_key,
  }
}

/** Reject free-form model tool names that are not in the allowlist. */
export function assertAllowlistedTool(name: string): AgentToolName | null {
  return AGENT_TOOLS.includes(name as AgentToolName)
    ? (name as AgentToolName)
    : null
}
