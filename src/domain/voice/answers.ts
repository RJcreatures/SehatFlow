import type { MessageCatalog } from "../../i18n/types.ts"
import { speakLiveTurn } from "../agent/spoken.ts"
import {
  departmentDestinationId,
  hospitalGraph,
} from "../navigation/hospitalGraph.ts"
import { buildNaturalDirections } from "../navigation/naturalDirections.ts"
import { findRoute } from "../navigation/pathfind.ts"
import type { RouteMode, RouteResult } from "../navigation/types.ts"
import type { VoiceIntent } from "./intents.ts"

export type TokenContext = {
  token_code: string
  department_name: string
  room: string
  floor: string
  status: string
  estimated_wait_minutes: number | null
  patients_ahead: number
}

export type DepartmentFact = {
  code: string
  name: string
  room: string
  floor: string
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")
}

export function answerForIntent(input: {
  intent: VoiceIntent
  messages: MessageCatalog
  token: TokenContext | null
  departments: DepartmentFact[]
  routeMode?: RouteMode
  startId?: string
}): { answer: string; openEmergency: boolean; needsMyTurn: boolean } {
  const { intent, messages, token, departments } = input

  if (intent.intent === "emergency") {
    return {
      answer: `${messages.emergencyImmediate} ${messages.emergencyLead} ${messages.noToken} ${messages.tellStaff}`,
      openEmergency: true,
      needsMyTurn: false,
    }
  }

  if (intent.intent === "app_help") {
    return {
      answer: messages.voiceAnswerAppHelp,
      openEmergency: false,
      needsMyTurn: false,
    }
  }

  if (intent.intent === "registration_help") {
    return {
      answer: messages.voiceAnswerRegistrationHelp,
      openEmergency: false,
      needsMyTurn: false,
    }
  }

  if (intent.intent === "current_token" || intent.intent === "wait_estimate") {
    if (!token) {
      return {
        answer: messages.voiceNeedMyTurn,
        openEmergency: false,
        needsMyTurn: true,
      }
    }
    const spoken = speakLiveTurn({
      data: {
        token_code: token.token_code,
        department_code: "",
        department_name_en: token.department_name,
        department_name_hi: token.department_name,
        room_en: token.room,
        room_hi: token.room,
        floor_en: token.floor,
        floor_hi: token.floor,
        status: token.status,
        patients_ahead: token.patients_ahead,
        estimated_wait_minutes: token.estimated_wait_minutes,
        service_date: "",
      },
      messages,
      mode: intent.intent === "wait_estimate" ? "wait" : "token",
      displayMinutes: token.estimated_wait_minutes,
    })
    return {
      answer: spoken,
      openEmergency: false,
      needsMyTurn: false,
    }
  }

  if (intent.intent === "department_info") {
    const code = intent.department_code
    const department = departments.find((item) => item.code === code)
    if (!department) {
      return {
        answer: messages.voiceUnknownDepartment,
        openEmergency: false,
        needsMyTurn: false,
      }
    }
    return {
      answer: fill(messages.voiceAnswerDepartment, {
        department: department.name,
        room: department.room,
        floor: department.floor,
      }),
      openEmergency: false,
      needsMyTurn: false,
    }
  }

  if (intent.intent === "accessible_route") {
    const destinationCode = intent.destination_code
    const destNode = destinationCode
      ? departmentDestinationId(destinationCode)
      : null
    if (!destNode) {
      return {
        answer: messages.voiceUnknownDepartment,
        openEmergency: false,
        needsMyTurn: false,
      }
    }
    const startId =
      intent.start_landmark && hospitalGraph.nodes[intent.start_landmark]
        ? intent.start_landmark
        : input.startId && hospitalGraph.nodes[input.startId]
          ? input.startId
          : "entrance"
    const mode = input.routeMode ?? "assisted"
    const route = findRoute(hospitalGraph, startId, destNode, mode)
    return answerFromRoute(messages, route)
  }

  return {
    answer: messages.voiceUnsupported,
    openEmergency: false,
    needsMyTurn: false,
  }
}

/** Deterministic spoken/text answer from a route-engine result. */
export function answerFromRoute(
  messages: MessageCatalog,
  route: RouteResult,
): { answer: string; openEmergency: boolean; needsMyTurn: boolean } {
  if (route.status === "no_route" && route.reason === "no_step_free") {
    return {
      answer: messages.findNoStepFree,
      openEmergency: false,
      needsMyTurn: false,
    }
  }
  if (route.status !== "ok" && route.status !== "same_place") {
    return {
      answer: messages.findNoRoute,
      openEmergency: false,
      needsMyTurn: false,
    }
  }
  const lines = buildNaturalDirections(messages, hospitalGraph, route)
  return {
    answer: lines.join(" "),
    openEmergency: false,
    needsMyTurn: false,
  }
}
