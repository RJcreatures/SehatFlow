import type { MessageCatalog } from "../../i18n/types.ts"
import type { AppSupabase } from "../../lib/supabase/queueApi.ts"
import {
  getMyTurn,
  registerPatient,
  type MyTurnResponse,
  type RegisterPatientResponse,
} from "../../lib/supabase/patientApi.ts"
import { requestUrgentHelp } from "../../lib/supabase/queueApi.ts"
import { loadSlip, saveSlip } from "../../lib/slipStorage.ts"
import {
  createHelpRequestKey,
  loadHelpRequest,
  saveHelpRequest,
} from "../helpRequest.ts"
import {
  departmentDestinationId,
  hospitalGraph,
} from "../navigation/hospitalGraph.ts"
import { findRoute } from "../navigation/pathfind.ts"
import type { RouteMode } from "../navigation/types.ts"
import {
  answerFromRoute,
  type DepartmentFact,
  type TokenContext,
} from "../voice/answers.ts"
import {
  clearRegistrationDraft,
  loadIdempotentRegistration,
  saveIdempotentRegistration,
} from "./registrationDraft.ts"
import {
  speakDepartmentList,
  speakLiveTurn,
  speakRouteBrief,
} from "./spoken.ts"
import { parseAgentToolCall } from "./validate.ts"
import type {
  AgentToolCall,
  NavigationHandoff,
  OpenDestination,
} from "./types.ts"

export type AgentExecutionResult = {
  ok: boolean
  spoken: string
  openEmergency?: boolean
  needsMyTurn?: boolean
  openRegister?: boolean
  openSlip?: boolean
  navigateTo?: string | null
  navigationHandoff?: NavigationHandoff | null
  tokenUpdate?: TokenContext | null
  registration?: RegisterPatientResponse | null
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")
}

export type LiveQueueHint = {
  token_code: string
  display_minutes: number | null
  patients_ahead: number
  status: string
}

const DESTINATION_PATH: Record<OpenDestination, string> = {
  my_turn: "/slip",
  slip: "/slip",
  find: "/find",
  emergency: "/emergency",
  register: "/register",
  ask: "/ask",
  home: "/",
}

/**
 * Execute an allowlisted tool against trusted app APIs.
 * Rejects unknown tools. Never invents tokens.
 */
export async function executeAgentTool(input: {
  call: unknown
  client: AppSupabase | null
  messages: MessageCatalog
  departments: DepartmentFact[]
  routeMode?: RouteMode
  startId?: string
  /** Live countdown from WaitIndicator when slip matches. */
  liveQueue?: LiveQueueHint | null
}): Promise<AgentExecutionResult> {
  const call = parseAgentToolCall(input.call)
  if (!call) {
    return {
      ok: false,
      spoken: input.messages.agentUnsupportedAction,
    }
  }

  switch (call.tool) {
    case "get_my_turn":
      return executeGetMyTurn(
        input.client,
        input.messages,
        false,
        input.liveQueue,
      )
    case "get_wait_estimate":
      return executeGetMyTurn(
        input.client,
        input.messages,
        true,
        input.liveQueue,
      )
    case "token_lookup":
      return executeTokenLookup(call, input.client, input.messages, input.liveQueue)
    case "list_departments":
      return executeListDepartments(input.messages, input.departments)
    case "find_route":
      return executeFindRoute(call, input.messages, input.routeMode, input.startId)
    case "register_patient":
      return executeRegister(call, input.client, input.messages)
    case "submit_help_request":
      return executeHelp(call, input.client, input.messages)
    case "open_destination":
      return executeOpen(call, input.messages)
    case "app_help":
      return {
        ok: true,
        spoken: input.messages.voiceAnswerAppHelp,
      }
    default: {
      const _exhaustive: never = call
      void _exhaustive
      return { ok: false, spoken: input.messages.agentUnsupportedAction }
    }
  }
}

async function executeGetMyTurn(
  client: AppSupabase | null,
  messages: MessageCatalog,
  waitOnly: boolean,
  liveQueue?: LiveQueueHint | null,
): Promise<AgentExecutionResult> {
  const slip = loadSlip()
  if (!slip) {
    return {
      ok: false,
      spoken: messages.agentNeedTokenContext,
      needsMyTurn: true,
    }
  }
  if (!client) {
    return {
      ok: false,
      spoken: messages.backendUnconfigured,
      needsMyTurn: true,
    }
  }

  const body =
    slip.qr_token && slip.qr_token.length > 0
      ? { qr_token: slip.qr_token }
      : { token_code: slip.token_code, access_code: slip.access_code }

  const { data, error } = await getMyTurn(client, body)
  if (error || !data) {
    return {
      ok: false,
      spoken: messages.agentQueueUnavailable,
      needsMyTurn: true,
    }
  }

  const displayMinutes =
    liveQueue &&
    liveQueue.token_code === data.token_code &&
    liveQueue.display_minutes != null
      ? liveQueue.display_minutes
      : null

  const token = toTokenContext(data, messages, displayMinutes)
  const spoken = speakLiveTurn({
    data,
    messages,
    mode: waitOnly ? "wait" : "token",
    displayMinutes,
  })

  return {
    ok: true,
    spoken,
    tokenUpdate: token,
  }
}

async function executeTokenLookup(
  call: Extract<AgentToolCall, { tool: "token_lookup" }>,
  client: AppSupabase | null,
  messages: MessageCatalog,
  liveQueue?: LiveQueueHint | null,
): Promise<AgentExecutionResult> {
  if (!client) {
    return {
      ok: false,
      spoken: messages.backendUnconfigured,
      needsMyTurn: true,
    }
  }

  const { data, error } = await getMyTurn(client, {
    token_code: call.args.token_code,
    access_code: call.args.access_code,
  })
  if (error || !data || (typeof data === "object" && "error" in data)) {
    return {
      ok: false,
      spoken: messages.agentTokenLookupFailed,
      needsMyTurn: true,
    }
  }

  saveSlip({
    token_code: data.token_code,
    access_code: call.args.access_code,
    department_code: data.department_code,
    department_name_en: data.department_name_en,
    department_name_hi: data.department_name_hi,
    room_en: data.room_en,
    room_hi: data.room_hi,
    floor_en: data.floor_en,
    floor_hi: data.floor_hi,
    estimated_wait_minutes: data.estimated_wait_minutes ?? 0,
    service_date: data.service_date,
  })

  const displayMinutes =
    liveQueue &&
    liveQueue.token_code === data.token_code &&
    liveQueue.display_minutes != null
      ? liveQueue.display_minutes
      : null

  const token = toTokenContext(data, messages, displayMinutes)
  const spoken = speakLiveTurn({
    data,
    messages,
    mode: "token",
    displayMinutes,
  })

  return {
    ok: true,
    spoken,
    tokenUpdate: token,
    openSlip: true,
  }
}

function toTokenContext(
  data: MyTurnResponse,
  messages: MessageCatalog,
  displayMinutes?: number | null,
): TokenContext {
  return {
    token_code: data.token_code,
    department_name: data.department_name_en || data.department_code,
    room: data.room_en || messages.notAvailable,
    floor: data.floor_en || messages.notAvailable,
    status: data.status,
    estimated_wait_minutes:
      displayMinutes != null ? displayMinutes : data.estimated_wait_minutes,
    patients_ahead: data.patients_ahead,
  }
}

function executeListDepartments(
  messages: MessageCatalog,
  departments: DepartmentFact[],
): AgentExecutionResult {
  if (departments.length === 0) {
    return { ok: false, spoken: messages.voiceUnknownDepartment }
  }
  return {
    ok: true,
    spoken: speakDepartmentList(messages, departments),
  }
}

function executeFindRoute(
  call: Extract<AgentToolCall, { tool: "find_route" }>,
  messages: MessageCatalog,
  routeMode: RouteMode = "assisted",
  startId = "entrance",
): AgentExecutionResult {
  const destId =
    hospitalGraph.nodes[call.args.destination_code]
      ? call.args.destination_code
      : departmentDestinationId(call.args.destination_code)
  if (!destId || !hospitalGraph.nodes[destId]) {
    return { ok: false, spoken: messages.voiceUnknownDepartment }
  }
  const start =
    call.args.start_landmark && hospitalGraph.nodes[call.args.start_landmark]
      ? call.args.start_landmark
      : startId
  const mode: RouteMode =
    call.args.route_mode === "standard" ? "standard" : routeMode
  const route = findRoute(hospitalGraph, start, destId, mode)
  const resolved = answerFromRoute(messages, route)
  if (!resolved.answer) {
    return { ok: false, spoken: messages.findNoRoute }
  }
  const steps = resolved.answer.split(/(?<=[.!?])\s+/).filter(Boolean)
  const navigationHandoff: NavigationHandoff = {
    startId: start,
    destinationId: destId,
  }
  return {
    ok: true,
    spoken: speakRouteBrief(messages, steps),
    navigateTo: "/find",
    navigationHandoff,
  }
}

async function executeRegister(
  call: Extract<AgentToolCall, { tool: "register_patient" }>,
  client: AppSupabase | null,
  messages: MessageCatalog,
): Promise<AgentExecutionResult> {
  const cached = loadIdempotentRegistration(call.args.idempotency_key)
  if (cached) {
    return successRegistration(cached.response, messages)
  }
  if (!client) {
    return { ok: false, spoken: messages.backendUnconfigured, openRegister: true }
  }

  const { data, error } = await registerPatient(client, {
    display_name: call.args.display_name,
    age: call.args.age,
    gender: call.args.gender,
    department_code: call.args.department_code,
  })

  if (error || !data?.token_code) {
    return {
      ok: false,
      spoken: messages.agentRegisterFailed,
      openRegister: true,
    }
  }

  saveIdempotentRegistration(call.args.idempotency_key, data)
  clearRegistrationDraft()
  saveSlip({
    token_code: data.token_code,
    access_code: data.access_code,
    qr_token: data.qr_token,
    department_code: data.department_code,
    department_name_en: data.department_name_en,
    department_name_hi: data.department_name_hi,
    room_en: data.room_en,
    room_hi: data.room_hi,
    floor_en: data.floor_en,
    floor_hi: data.floor_hi,
    estimated_wait_minutes: data.estimated_wait_minutes,
    service_date: data.service_date,
  })

  return successRegistration(data, messages)
}

function successRegistration(
  data: RegisterPatientResponse,
  messages: MessageCatalog,
): AgentExecutionResult {
  return {
    ok: true,
    spoken: fill(messages.agentRegistered, { token: data.token_code }),
    openSlip: true,
    navigateTo: "/slip",
    registration: data,
    tokenUpdate: {
      token_code: data.token_code,
      department_name: data.department_name_en,
      room: data.room_en,
      floor: data.floor_en,
      status: "waiting",
      estimated_wait_minutes: data.estimated_wait_minutes,
      patients_ahead: 0,
    },
  }
}

async function executeHelp(
  call: Extract<AgentToolCall, { tool: "submit_help_request" }>,
  client: AppSupabase | null,
  messages: MessageCatalog,
): Promise<AgentExecutionResult> {
  if (!client) {
    return { ok: false, spoken: messages.helpRequestUnavailable }
  }
  const existing = loadHelpRequest()
  const requestKey = existing?.requestKey ?? createHelpRequestKey()
  const { data, error } = await requestUrgentHelp(
    client,
    requestKey,
    call.args.department_code,
  )
  if (error || !data) {
    return { ok: false, spoken: messages.helpRequestError }
  }
  saveHelpRequest({
    requestKey,
    flagId: data.id,
    status: data.status === "acknowledged" ? "acknowledged" : "open",
    createdAt: data.created_at,
    acknowledgedAt: data.acknowledged_at,
  })
  const spoken =
    data.status === "acknowledged"
      ? messages.helpRequestAcknowledged
      : messages.helpRequestPending
  return { ok: true, spoken }
}

function executeOpen(
  call: Extract<AgentToolCall, { tool: "open_destination" }>,
  messages: MessageCatalog,
): AgentExecutionResult {
  const path = DESTINATION_PATH[call.args.destination]
  return {
    ok: true,
    spoken: fill(messages.agentNavigated, { place: call.args.destination }),
    navigateTo: path,
    openEmergency: call.args.destination === "emergency",
    needsMyTurn: call.args.destination === "my_turn",
    openRegister: call.args.destination === "register",
    openSlip: call.args.destination === "slip",
  }
}

/** True when this browser tab has a verified slip that can authorize get-my-turn. */
export function hasVerifiedSlipContext(): boolean {
  return loadSlip() !== null
}
