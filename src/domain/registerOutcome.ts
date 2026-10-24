import type { MessageCatalog } from "../i18n/types.ts"
import type { RegisterPatientResponse } from "../lib/supabase/patientApi.ts"
import { supabaseErrorMessage } from "../lib/supabase/errors.ts"

export const REGISTER_TIMEOUT_MS = 20_000

export type RegisterUiErrorKind =
  | "validation"
  | "network"
  | "server"
  | "rate_limit"
  | "queue_full"
  | "uncertain"
  | "config"

/**
 * Map register-patient failures to short patient-facing copy.
 * Never invents a token and never exposes stack traces.
 */
export function mapRegisterFailure(input: {
  invokeError: unknown
  bodyError?: string | null
  timedOut?: boolean
  messages: MessageCatalog
}): { kind: RegisterUiErrorKind; message: string } {
  const { messages } = input
  if (input.timedOut) {
    return { kind: "uncertain", message: messages.registerUncertain }
  }

  const apiError = (input.bodyError ?? "").trim().toLowerCase()
  if (apiError === "too many requests") {
    return { kind: "rate_limit", message: messages.registerRateLimited }
  }
  if (apiError === "department queue is full") {
    return { kind: "queue_full", message: messages.registerQueueFull }
  }
  if (
    apiError === "unknown or inactive department" ||
    apiError.includes("department")
  ) {
    return { kind: "validation", message: messages.registerInvalidDepartment }
  }
  if (apiError === "invalid registration input" || apiError.length > 0) {
    return {
      kind: "validation",
      message:
        apiError === "invalid registration input"
          ? messages.registerInvalidInput
          : messages.registerFailed,
    }
  }

  const raw = supabaseErrorMessage(input.invokeError, "")
  const lower = raw.toLowerCase()
  if (
    lower.includes("failed to send") ||
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("timeout") ||
    lower.includes("abort")
  ) {
    return { kind: "network", message: messages.registerNetworkError }
  }
  if (raw) {
    // Prefer generic copy over raw SDK strings for patients.
    return { kind: "server", message: messages.registerFailed }
  }
  return { kind: "server", message: messages.registerFailed }
}

export function isRegisterPatientResponse(
  value: unknown,
): value is RegisterPatientResponse {
  if (!value || typeof value !== "object") {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.token_code === "string" &&
    typeof record.access_code === "string" &&
    typeof record.department_code === "string" &&
    typeof record.service_date === "string"
  )
}

/** Race a registration invoke against a client timeout. */
export async function withRegisterTimeout<T>(
  work: Promise<T>,
  timeoutMs: number = REGISTER_TIMEOUT_MS,
): Promise<{ ok: true; value: T } | { ok: false; timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      work.then((value) => ({ ok: true as const, value })),
      new Promise<{ ok: false; timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, timedOut: true }), timeoutMs)
      }),
    ])
    return result
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}
