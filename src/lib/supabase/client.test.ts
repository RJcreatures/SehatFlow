import { describe, expect, it } from "vitest"
import { normalizeProjectUrl, readSupabaseState } from "./client.ts"

describe("normalizeProjectUrl", () => {
  it("strips a pasted /rest/v1 path", () => {
    expect(
      normalizeProjectUrl("https://example.supabase.co/rest/v1/"),
    ).toBe("https://example.supabase.co")
  })

  it("keeps a project root URL", () => {
    expect(normalizeProjectUrl("https://example.supabase.co")).toBe(
      "https://example.supabase.co",
    )
  })
})

describe("readSupabaseState", () => {
  it("accepts a /rest/v1 URL after normalization", () => {
    expect(
      readSupabaseState({
        VITE_SUPABASE_URL: "https://example.supabase.co/rest/v1/",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key_value",
      }).status,
    ).toBe("ready")
  })
})
