import { describe, expect, it } from "vitest"
import {
  buildIntentChatBody,
  speakTextLooksLikeCredential,
} from "./providerPayload.ts"

describe("voice privacy toward Sarvam", () => {
  it("does not embed access codes, QR tokens, or token codes in chat prompts", () => {
    const body = buildIntentChatBody("Where is pediatrics?", "en")
    const serialized = JSON.stringify(body)
    expect(serialized).not.toMatch(/access_code/i)
    expect(serialized).not.toMatch(/qr_token/i)
    expect(serialized).not.toMatch(/GM-\d+/)
    expect(serialized).toContain("Where is pediatrics?")
    expect(body.messages.some((message) => message.role === "system")).toBe(
      true,
    )
  })

  it("truncates long transcripts before provider chat", () => {
    const long = "x".repeat(2000)
    const body = buildIntentChatBody(long, "hi")
    const user = body.messages.find((message) => message.role === "user")
    expect(user?.content.length).toBeLessThan(600)
  })

  it("flags credential-like TTS text", () => {
    expect(speakTextLooksLikeCredential("Your access_code is ABCD1234")).toBe(
      true,
    )
    expect(speakTextLooksLikeCredential("Scan the qr_token now")).toBe(true)
    expect(
      speakTextLooksLikeCredential("Your estimated wait is 10 minutes."),
    ).toBe(false)
  })
})
