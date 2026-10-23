import { describe, expect, it } from "vitest"
import { buildDirectionSteps } from "./directions.ts"
import {
  departmentDestinationId,
  hospitalGraph,
} from "./hospitalGraph.ts"
import { findRoute, routeContainsStairs } from "./pathfind.ts"
import type { HospitalGraph } from "./types.ts"

describe("findRoute standard mode", () => {
  it("selects the shortest route and prefers stairs over a longer lift", () => {
    const to = departmentDestinationId("orthopedics")
    expect(to).toBe("dept_orthopedics")
    const result = findRoute(hospitalGraph, "entrance", to!, "standard")
    expect(result.status).toBe("ok")
    if (result.status !== "ok") {
      return
    }
    expect(routeContainsStairs(result)).toBe(true)
    const viaLift = findRoute(hospitalGraph, "entrance", to!, "assisted")
    expect(viaLift.status).toBe("ok")
    if (viaLift.status === "ok") {
      expect(result.totalSeconds).toBeLessThan(viaLift.totalSeconds)
    }
  })
})

describe("findRoute assisted mode", () => {
  it("returns a step-free route with no stairs", () => {
    const to = departmentDestinationId("ent")
    const result = findRoute(hospitalGraph, "entrance", to!, "assisted")
    expect(result.status).toBe("ok")
    if (result.status !== "ok") {
      return
    }
    expect(routeContainsStairs(result)).toBe(false)
    expect(result.hops.every((hop) => hop.stepFree && hop.kind !== "stairs")).toBe(
      true,
    )
  })

  it("returns no route instead of falling back to stairs", () => {
    const stairsOnly: HospitalGraph = {
      nodes: {
        a: { id: "a", floor: 0, x: 0, y: 0, labelKey: "navEntrance" },
        b: { id: "b", floor: 1, x: 0, y: 1, labelKey: "navCorridorFirst" },
      },
      edges: [
        {
          id: "stairs_ab",
          from: "a",
          to: "b",
          seconds: 20,
          kind: "stairs",
          stepFree: false,
        },
        {
          id: "stairs_ba",
          from: "b",
          to: "a",
          seconds: 20,
          kind: "stairs",
          stepFree: false,
        },
      ],
    }

    const assisted = findRoute(stairsOnly, "a", "b", "assisted")
    expect(assisted).toEqual({
      status: "no_route",
      mode: "assisted",
      reason: "no_step_free",
      fromId: "a",
      toId: "b",
    })

    const standard = findRoute(stairsOnly, "a", "b", "standard")
    expect(standard.status).toBe("ok")
    if (standard.status === "ok") {
      expect(routeContainsStairs(standard)).toBe(true)
    }
  })
})

describe("findRoute floors and edge cases", () => {
  it("accounts for lift or ramp when changing floors", () => {
    const to = departmentDestinationId("dermatology")
    const assisted = findRoute(hospitalGraph, "entrance", to!, "assisted")
    expect(assisted.status).toBe("ok")
    if (assisted.status !== "ok") {
      return
    }
    const connector = assisted.hops.find(
      (hop) => hop.kind === "lift" || hop.kind === "ramp",
    )
    expect(connector).toBeTruthy()
    const fromFloor = hospitalGraph.nodes[connector!.from]!.floor
    const toFloor = hospitalGraph.nodes[connector!.to]!.floor
    expect(fromFloor).not.toBe(toFloor)
  })

  it("handles the same origin and destination", () => {
    const result = findRoute(hospitalGraph, "entrance", "entrance", "assisted")
    expect(result).toEqual({
      status: "same_place",
      mode: "assisted",
      nodeId: "entrance",
    })
  })

  it("handles unknown nodes, unknown departments, and disconnected graphs", () => {
    expect(departmentDestinationId("not_a_department")).toBeNull()

    const unknown = findRoute(hospitalGraph, "entrance", "missing_node", "standard")
    expect(unknown.status).toBe("no_route")
    if (unknown.status === "no_route") {
      expect(unknown.reason).toBe("unknown_node")
    }

    const disconnected: HospitalGraph = {
      nodes: {
        left: { id: "left", floor: 0, x: 0, y: 0, labelKey: "navEntrance" },
        right: { id: "right", floor: 0, x: 1, y: 0, labelKey: "navHelpDesk" },
      },
      edges: [],
    }
    const result = findRoute(disconnected, "left", "right", "standard")
    expect(result).toEqual({
      status: "no_route",
      mode: "standard",
      reason: "disconnected",
      fromId: "left",
      toId: "right",
    })
  })

  it("derives map path and written steps from the same route result", () => {
    const to = departmentDestinationId("ophthalmology")
    const result = findRoute(hospitalGraph, "reception", to!, "assisted")
    expect(result.status).toBe("ok")
    if (result.status !== "ok") {
      return
    }
    const steps = buildDirectionSteps(hospitalGraph, result)
    const walkIds = steps
      .filter((step) => step.kind !== "start" && step.kind !== "arrive")
      .filter((step) => step.kind !== "floor_change")
      .map((step) => `${step.fromId}->${step.toId}`)
    const hopIds = result.hops.map((hop) => `${hop.from}->${hop.to}`)
    expect(walkIds).toEqual(hopIds)
    expect(steps[0]?.kind).toBe("start")
    expect(steps[steps.length - 1]?.kind).toBe("arrive")
    expect(steps.some((step) => step.kind === "floor_change")).toBe(true)
  })
})
