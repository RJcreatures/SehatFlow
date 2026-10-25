import { appConfig } from "../../config/hospital.ts"
import {
  emptyTokenLookupDraft,
  type TokenLookupDraft,
} from "./tokenLookup.ts"

export type ConversationTopic =
  | "queue"
  | "directions"
  | "register"
  | "departments"
  | "help"
  | "token_lookup"
  | null

export type ConversationMemory = {
  lastSpoken: string | null
  lastUserUtterance: string | null
  lastDestinationNodeId: string | null
  lastStartNodeId: string | null
  lastTopic: ConversationTopic
  consecutiveFailures: number
  tokenLookupDraft: TokenLookupDraft
}

const storageKey = `${appConfig.storageKey}.assistantConversation`

const emptyMemory: ConversationMemory = {
  lastSpoken: null,
  lastUserUtterance: null,
  lastDestinationNodeId: null,
  lastStartNodeId: null,
  lastTopic: null,
  consecutiveFailures: 0,
  tokenLookupDraft: emptyTokenLookupDraft(),
}

function parseTokenLookupDraft(value: unknown): TokenLookupDraft {
  if (!value || typeof value !== "object") {
    return emptyTokenLookupDraft()
  }
  const record = value as Record<string, unknown>
  return {
    tokenCode:
      typeof record.tokenCode === "string" ? record.tokenCode : null,
    accessCode:
      typeof record.accessCode === "string" ? record.accessCode : null,
    failedAttempts:
      typeof record.failedAttempts === "number" &&
      Number.isFinite(record.failedAttempts)
        ? Math.max(0, Math.min(20, Math.floor(record.failedAttempts)))
        : 0,
  }
}

export function loadConversationMemory(): ConversationMemory {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) {
      return { ...emptyMemory, tokenLookupDraft: emptyTokenLookupDraft() }
    }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") {
      return { ...emptyMemory, tokenLookupDraft: emptyTokenLookupDraft() }
    }
    const record = parsed as Record<string, unknown>
    return {
      lastSpoken:
        typeof record.lastSpoken === "string" ? record.lastSpoken : null,
      lastUserUtterance:
        typeof record.lastUserUtterance === "string"
          ? record.lastUserUtterance
          : null,
      lastDestinationNodeId:
        typeof record.lastDestinationNodeId === "string"
          ? record.lastDestinationNodeId
          : null,
      lastStartNodeId:
        typeof record.lastStartNodeId === "string"
          ? record.lastStartNodeId
          : null,
      lastTopic:
        record.lastTopic === "queue" ||
        record.lastTopic === "directions" ||
        record.lastTopic === "register" ||
        record.lastTopic === "departments" ||
        record.lastTopic === "help" ||
        record.lastTopic === "token_lookup"
          ? record.lastTopic
          : null,
      consecutiveFailures:
        typeof record.consecutiveFailures === "number" &&
        Number.isFinite(record.consecutiveFailures)
          ? Math.max(0, Math.min(10, Math.floor(record.consecutiveFailures)))
          : 0,
      tokenLookupDraft: parseTokenLookupDraft(record.tokenLookupDraft),
    }
  } catch {
    return { ...emptyMemory, tokenLookupDraft: emptyTokenLookupDraft() }
  }
}

export function saveConversationMemory(memory: ConversationMemory): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(memory))
  } catch {
    // sessionStorage may be unavailable
  }
}

export function clearConversationMemory(): void {
  try {
    sessionStorage.removeItem(storageKey)
  } catch {
    // ignore
  }
}
