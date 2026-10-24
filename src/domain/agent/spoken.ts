import type { MessageCatalog } from "../../i18n/types.ts"
import type { MyTurnResponse } from "../../lib/supabase/patientApi.ts"
import { formatAboutWaitMinutes } from "../queue.ts"
import type { DepartmentFact } from "../voice/answers.ts"

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")
}

/** Localized queue status for speech — never speak raw DB enums. */
export function localizeQueueStatus(
  status: string,
  messages: MessageCatalog,
): string {
  switch (status) {
    case "waiting":
      return messages.statusWaiting
    case "called":
      return messages.statusCalled
    case "completed":
      return messages.statusCompleted
    case "no_show":
      return messages.statusNoShow
    case "skipped":
      return messages.statusSkipped
    case "cancelled":
      return messages.statusCancelled
    default:
      return status
  }
}

export function shortDepartmentName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/u, "").trim() || name
}

/**
 * Short spoken answer from a live get-my-turn payload.
 * Prefer this over long multi-clause templates.
 */
export function speakLiveTurn(input: {
  data: MyTurnResponse
  messages: MessageCatalog
  mode: "token" | "wait"
  /** Optional local countdown minutes from WaitIndicator. */
  displayMinutes?: number | null
}): string {
  const { data, messages, mode } = input
  const status = localizeQueueStatus(data.status, messages)
  const room = data.room_en || messages.notAvailable
  const minutes =
    input.displayMinutes != null && Number.isFinite(input.displayMinutes)
      ? Math.max(0, Math.round(input.displayMinutes))
      : data.estimated_wait_minutes
  const ahead = String(data.patients_ahead)

  if (data.status === "called") {
    return fill(messages.voiceAnswerTokenCalled, {
      token: data.token_code,
      room,
    })
  }

  if (data.status === "completed") {
    return fill(messages.voiceAnswerTokenDone, {
      token: data.token_code,
    })
  }

  if (
    data.status === "no_show" ||
    data.status === "skipped" ||
    data.status === "cancelled"
  ) {
    return fill(messages.voiceAnswerTokenNoWait, {
      token: data.token_code,
      status,
    })
  }

  if (mode === "wait") {
    if (minutes == null) {
      return messages.voiceWaitUnavailable
    }
    return fill(messages.voiceAnswerWait, {
      minutes: String(minutes),
      ahead,
      wait: formatAboutWaitMinutes(minutes, messages.waitAboutTemplate),
    })
  }

  if (minutes == null) {
    return fill(messages.voiceAnswerTokenNoWait, {
      token: data.token_code,
      status,
    })
  }

  return fill(messages.voiceAnswerToken, {
    token: data.token_code,
    status,
    minutes: String(minutes),
    ahead,
    department: data.department_name_en || data.department_code,
    room,
  })
}

export function speakDepartmentList(
  messages: MessageCatalog,
  departments: DepartmentFact[],
): string {
  const names = departments.map((d) => shortDepartmentName(d.name))
  return `${messages.agentDepartmentsPrefix} ${names.join(", ")}.`
}

export function speakRouteBrief(
  messages: MessageCatalog,
  steps: string[],
): string {
  const brief = steps.slice(0, 2).join(" ")
  if (steps.length <= 2) {
    return brief
  }
  return `${brief} ${messages.agentRouteMore}`
}
