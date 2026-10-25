import { validateMyTurnInput } from "../registration.ts"
import type { ConversationMemory } from "./conversationContext.ts"
import type { AgentPlan } from "./types.ts"

export const MAX_TOKEN_LOOKUP_FAILURES = 5

/** Full printed token codes only (e.g. GM-024). Never bare numbers. */
const TOKEN_IN_TEXT = /\b([A-Za-z][A-Za-z0-9]{0,7}-\d{1,4})\b/
const ACCESS_LABELED =
  /\b(?:access(?:\s*code)?|code)\s*(?:is|:)?\s*([A-Za-z0-9]{8})\b/i

/** Unambiguous slip alphabet — same as registration access codes. */
const ACCESS_ALPHABET = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/

export type TokenLookupDraft = {
  tokenCode: string | null
  accessCode: string | null
  failedAttempts: number
}

export function emptyTokenLookupDraft(): TokenLookupDraft {
  return { tokenCode: null, accessCode: null, failedAttempts: 0 }
}

export function extractTokenCredentials(utterance: string): {
  tokenCode: string | null
  accessCode: string | null
} {
  const tokenMatch = utterance.match(TOKEN_IN_TEXT)
  const tokenCode = tokenMatch?.[1]
    ? tokenMatch[1].trim().toUpperCase()
    : null

  let accessCode: string | null = null
  const labeled = utterance.match(ACCESS_LABELED)
  if (labeled?.[1]) {
    const candidate = labeled[1].trim().toUpperCase()
    if (ACCESS_ALPHABET.test(candidate)) {
      accessCode = candidate
    }
  } else if (tokenCode) {
    // Only accept a bare 8-char access code when a token code is also present
    // in the same utterance — never from English words like "EXISTING".
    const withoutToken = utterance.replace(new RegExp(tokenCode, "i"), " ")
    const bare = withoutToken.toUpperCase().match(/\b([A-Z0-9]{8})\b/)
    if (bare?.[1] && ACCESS_ALPHABET.test(bare[1])) {
      accessCode = bare[1]
    }
  }

  return { tokenCode, accessCode }
}

export function mergeTokenLookupDraft(
  existing: TokenLookupDraft | null | undefined,
  utterance: string,
): TokenLookupDraft {
  const base = existing ?? emptyTokenLookupDraft()
  const extracted = extractTokenCredentials(utterance)
  return {
    tokenCode: extracted.tokenCode ?? base.tokenCode,
    accessCode: extracted.accessCode ?? base.accessCode,
    failedAttempts: base.failedAttempts,
  }
}

export function tokenLookupReady(
  draft: TokenLookupDraft,
):
  | { ok: true; tokenCode: string; accessCode: string }
  | { ok: false; missing: "token" | "access" | "both" } {
  if (!draft.tokenCode && !draft.accessCode) {
    return { ok: false, missing: "both" }
  }
  if (!draft.tokenCode) {
    return { ok: false, missing: "token" }
  }
  if (!draft.accessCode) {
    return { ok: false, missing: "access" }
  }
  const validated = validateMyTurnInput({
    tokenCode: draft.tokenCode,
    accessCode: draft.accessCode,
  })
  if (!validated.ok) {
    if (validated.field === "token") {
      return { ok: false, missing: "token" }
    }
    return { ok: false, missing: "access" }
  }
  return {
    ok: true,
    tokenCode: validated.tokenCode,
    accessCode: validated.accessCode,
  }
}

export function isTokenLookupRateLimited(
  memory: ConversationMemory | null | undefined,
): boolean {
  const failures = memory?.tokenLookupDraft?.failedAttempts ?? 0
  return failures >= MAX_TOKEN_LOOKUP_FAILURES
}

/**
 * True only for explicit retrieve / check-token phrasing.
 * Does NOT match bare token-shaped strings alone (those are credential supply).
 */
export function utteranceWantsTokenLookup(text: string): boolean {
  const lower = text.toLowerCase()
  return /\b(check (?:my )?(?:token|turn|queue)|lost (?:my )?(?:slip|token)|find my (?:turn|token)|look ?up (?:my )?(?:token|turn)|token number is|my token is|retrieve (?:my )?(?:slip|token))\b/.test(
    lower,
  )
}

export function planTokenLookupStep(
  utterance: string,
  memory: ConversationMemory | null | undefined,
): AgentPlan | null {
  if (isTokenLookupRateLimited(memory)) {
    return {
      kind: "clarify",
      messageKey: "token_lookup_rate_limited",
      tool: "token_lookup",
    }
  }
  const draft = mergeTokenLookupDraft(memory?.tokenLookupDraft, utterance)
  const ready = tokenLookupReady(draft)
  if (ready.ok) {
    return {
      kind: "tool",
      call: {
        tool: "token_lookup",
        args: {
          token_code: ready.tokenCode,
          access_code: ready.accessCode,
        },
      },
    }
  }
  if (ready.missing === "access") {
    return {
      kind: "clarify",
      messageKey: "need_access_code",
      tool: "token_lookup",
    }
  }
  if (ready.missing === "token") {
    return {
      kind: "clarify",
      messageKey: "need_token_code",
      tool: "token_lookup",
    }
  }
  return {
    kind: "clarify",
    messageKey: "need_token_and_access",
    tool: "token_lookup",
  }
}
