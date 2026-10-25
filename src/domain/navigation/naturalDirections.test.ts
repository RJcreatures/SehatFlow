import { describe, expect, it } from "vitest"
import { en } from "../../i18n/en.ts"
import { departmentDestinationId, hospitalGraph } from "./hospitalGraph.ts"
import {
  buildNaturalDirections,
  hopsMatchPath,
  routePathSignature,
} from "./naturalDirections.ts"
import { findRoute, routeContainsStairs } from "./pathfind.ts"

describe("natural directions and shared path", () => {
  it("builds human-readable steps from a valid route", () => {
    const to = departmentDestinationId("ophthalmology")!
    const route = findRoute(hospitalGraph, "reception", to, "assisted")
    expect(route.status).toBe("ok")
    if (route.status !== "ok") {
      return
    }
    const lines = buildNaturalDirections(en, hospitalGraph, route)
    expect(lines[0]).toMatch(/Reception|reception|Registration/i)
    expect(lines.some((line) => /lift/i.test(line))).toBe(true)
    expect(lines.at(-1)).toMatch(/arrived|Eyes|ophthalmology|Room 25/i)
    expect(hopsMatchPath(route.hops, route.path)).toBe(true)
  })

  it("keeps map path and written directions on the same route object", () => {
    const to = departmentDestinationId("dermatology")!
    const route = findRoute(hospitalGraph, "entrance", to, "assisted")
    expect(route.status).toBe("ok")
    if (route.status !== "ok") {
      return
    }
    const signature = routePathSignature(route)
    const lines = buildNaturalDirections(en, hospitalGraph, route)
    expect(signature).toContain(">")
    expect(lines.length).toBeGreaterThan(2)
    expect(routePathSignature(route)).toBe(signature)
  })

  it("accounts for a lift floor change", () => {
    const to = departmentDestinationId("ent")!
    const route = findRoute(hospitalGraph, "help_desk", to, "assisted")
    expect(route.status).toBe("ok")
    if (route.status !== "ok") {
      return
    }
    expect(route.hops.some((hop) => hop.kind === "lift")).toBe(true)
    const lines = buildNaturalDirections(en, hospitalGraph, route)
    expect(lines.some((line) => /lift/i.test(line))).toBe(true)
    expect(lines.some((line) => /First floor|first floor/i.test(line))).toBe(
      true,
    )
  })

  it("keeps assisted mode step-free and refuses stairs fallback", () => {
    const to = departmentDestinationId("orthopedics")!
    const assisted = findRoute(hospitalGraph, "entrance", to, "assisted")
    expect(assisted.status).toBe("ok")
    if (assisted.status === "ok") {
      expect(routeContainsStairs(assisted)).toBe(false)
    }

    const stairsOnly = {
      nodes: {
        a: {
          id: "a",
          floor: 0 as const,
          x: 0,
          y: 0,
          labelKey: "navEntrance",
        },
        b: {
          id: "b",
          floor: 1 as const,
          x: 0,
          y: 1,
          labelKey: "navCorridorFirst",
        },
      },
      edges: [
        {
          id: "s1",
          from: "a",
          to: "b",
          seconds: 20,
          kind: "stairs" as const,
          stepFree: false,
        },
        {
          id: "s2",
          from: "b",
          to: "a",
          seconds: 20,
          kind: "stairs" as const,
          stepFree: false,
        },
      ],
    }
    expect(findRoute(stairsOnly, "a", "b", "assisted").status).toBe("no_route")
  })
})
