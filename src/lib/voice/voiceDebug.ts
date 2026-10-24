/** Dev-facing voice diagnostics. Safe: never logs API keys, tickets, or raw audio. */

export type VoiceDebugEntry = {
  at: string
  step: string
  detail?: string
}

const PREFIX = "[SehatFlow voice]"

export function voiceDebugLog(
  step: string,
  detail?: Record<string, unknown> | string,
): VoiceDebugEntry {
  const at = new Date().toISOString().slice(11, 23)
  const detailText =
    detail == null
      ? undefined
      : typeof detail === "string"
        ? detail
        : JSON.stringify(detail)
  if (detailText) {
    console.info(PREFIX, step, detail)
  } else {
    console.info(PREFIX, step)
  }
  return { at, step, detail: detailText }
}
