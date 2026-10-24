import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("patient layout spacing with wait indicator and bottom nav", () => {
  it("reserves bottom padding so find content clears fixed chrome", () => {
    const css = readFileSync(join(root, "index.css"), "utf8")
    expect(css).toMatch(
      /\.app-shell-with-bottom-nav \.main\s*\{[^}]*padding-bottom:\s*calc\(5\.75rem/,
    )
    expect(css).toMatch(
      /\.app-shell-with-wait \.main\s*\{[^}]*padding-bottom:\s*calc\(11\.5rem/,
    )
    expect(css).toContain(".wait-indicator")
    expect(css).toContain(".bottom-nav")
    expect(css).toContain(".hospital-map-wrap")
    expect(css).toContain(".global-assistant-fab")
    expect(css).toMatch(
      /\.global-assistant-fab\s*\{[^}]*bottom:\s*calc\(6\.35rem/,
    )
  })
})
