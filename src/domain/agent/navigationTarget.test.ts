import { describe, expect, it } from "vitest"
import {
  extractRouteEnds,
  resolveDestinationNodeId,
  resolveStartNodeId,
  utteranceWantsCompoundWaitAndDirections,
} from "./navigationTarget.ts"

describe("agent navigation target resolution", () => {
  it("resolves cardiology and laboratory landmarks from natural text", () => {
    expect(resolveDestinationNodeId(null, "where is cardiology")).toBe(
      "dept_cardiology",
    )
    expect(resolveDestinationNodeId(null, "nearest washroom")).toBe(
      "washroom_g",
    )
    expect(resolveDestinationNodeId(null, "go to the laboratory")).toBe(
      "laboratory",
    )
  })

  it("parses from/to phrases for routing", () => {
    const ends = extractRouteEnds(
      "How do I get from registration to the laboratory?",
    )
    expect(ends.fromText).toMatch(/registration/i)
    expect(ends.toText).toMatch(/laboratory/i)
    const start = resolveStartNodeId(
      "from registration to laboratory",
      null,
      "entrance",
    )
    expect(start).toBe("registration")
    const dest = resolveDestinationNodeId(ends.toText, "")
    expect(dest).toBe("laboratory")
  })

  it("detects compound wait and directions questions", () => {
    expect(
      utteranceWantsCompoundWaitAndDirections(
        "How long until my turn and where do I go afterward?",
      ),
    ).toBe(true)
    expect(utteranceWantsCompoundWaitAndDirections("Where is ENT?")).toBe(false)
  })
})
