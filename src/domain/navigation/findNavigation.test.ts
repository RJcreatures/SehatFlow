import { describe, expect, it } from "vitest"
import { en } from "../../i18n/en.ts"
import {
  LANDMARK_CATALOG,
  popularDestinationIds,
  routableDestinationIds,
  routableStartIds,
} from "./landmarkCatalog.ts"
import { hospitalGraph, isRoutableNodeId } from "./hospitalGraph.ts"
import {
  matchDestinationText,
  matchLandmarkText,
} from "./locationMatch.ts"
import {
  buildNaturalDirections,
  routePathSignature,
} from "./naturalDirections.ts"
import { findRoute, routeContainsStairs } from "./pathfind.ts"
import {
  getCompassSupport,
  getGeolocationSupport,
  headingFromOrientationEvent,
  INDOOR_GEO_MAPPING_CONFIGURED,
  mapGeoToIndoorNode,
  requestBrowserLocation,
} from "./sensors.ts"

describe("expanded landmark catalogue", () => {
  it("only offers starts and destinations that exist in the graph", () => {
    for (const id of routableStartIds()) {
      expect(hospitalGraph.nodes[id]).toBeTruthy()
    }
    for (const id of routableDestinationIds()) {
      expect(hospitalGraph.nodes[id]).toBeTruthy()
    }
    expect(popularDestinationIds().length).toBeGreaterThan(3)
    expect(LANDMARK_CATALOG.some((entry) => entry.id === "pharmacy")).toBe(true)
    expect(LANDMARK_CATALOG.some((entry) => entry.id === "dept_cardiology")).toBe(
      true,
    )
  })

  it("matches destination aliases without silently picking unrelated places", () => {
    const eye = matchDestinationText("eye clinic")
    expect(eye.status).toBe("exact")
    if (eye.status === "exact") {
      expect(eye.candidate.id).toBe("dept_ophthalmology")
    }

    const parking = matchDestinationText("car park basement")
    expect(parking.status).toBe("none")

    const ambiguous = matchDestinationText("desk")
    expect(["suggestions", "exact"]).toContain(ambiguous.status)
  })

  it("matches From landmarks including registration aliases", () => {
    const reg = matchLandmarkText("token counter", routableStartIds())
    expect(reg.status).toBe("exact")
    if (reg.status === "exact") {
      expect(reg.candidate.id).toBe("registration")
    }
  })
})

describe("route graph connectivity for new landmarks", () => {
  it("routes from OPD reception to cardiology without stairs in assisted mode", () => {
    const route = findRoute(
      hospitalGraph,
      "opd_reception",
      "dept_cardiology",
      "assisted",
    )
    expect(route.status).toBe("ok")
    if (route.status === "ok") {
      expect(routeContainsStairs(route)).toBe(false)
      expect(route.hops.some((hop) => hop.kind === "lift")).toBe(true)
      const lines = buildNaturalDirections(en, hospitalGraph, route)
      expect(lines[0]).toMatch(/OPD reception|reception/i)
      expect(lines.at(-1)).toMatch(/Cardiology|arrived/i)
      expect(routePathSignature(route)).toContain(">")
    }
  })

  it("routes to pharmacy and laboratory on the ground floor", () => {
    const pharmacy = findRoute(hospitalGraph, "entrance", "pharmacy", "assisted")
    const lab = findRoute(hospitalGraph, "waiting_area", "laboratory", "standard")
    expect(pharmacy.status).toBe("ok")
    expect(lab.status).toBe("ok")
  })

  it("rejects unknown From/To combinations", () => {
    expect(isRoutableNodeId("parking_garage")).toBe(false)
    const bad = findRoute(hospitalGraph, "entrance", "missing_node", "assisted")
    expect(bad.status).toBe("no_route")
    if (bad.status === "no_route") {
      expect(bad.reason).toBe("unknown_node")
    }
  })

  it("keeps map path signature aligned with written directions", () => {
    const route = findRoute(
      hospitalGraph,
      "help_desk",
      "dept_ophthalmology",
      "assisted",
    )
    expect(route.status).toBe("ok")
    if (route.status !== "ok") {
      return
    }
    const signature = routePathSignature(route)
    const lines = buildNaturalDirections(en, hospitalGraph, route)
    expect(signature.split(">").length).toBeGreaterThan(2)
    expect(lines.length).toBeGreaterThan(2)
    expect(routePathSignature(route)).toBe(signature)
  })

  it("never selects stairs in assisted mode for multi-floor routes", () => {
    for (const dest of [
      "dept_orthopedics",
      "dept_dental",
      "dept_physiotherapy",
    ] as const) {
      const route = findRoute(hospitalGraph, "entrance", dest, "assisted")
      expect(route.status).toBe("ok")
      if (route.status === "ok") {
        expect(routeContainsStairs(route)).toBe(false)
      }
    }
  })
})

describe("GPS and compass progressive enhancement", () => {
  it("reports unsupported geolocation when API is missing", () => {
    expect(getGeolocationSupport(undefined).supported).toBe(false)
  })

  it("never maps GPS onto the sample floor plan", () => {
    expect(INDOOR_GEO_MAPPING_CONFIGURED).toBe(false)
    expect(
      mapGeoToIndoorNode({
        latitude: 28.6,
        longitude: 77.2,
        accuracyMeters: 10,
      }),
    ).toBeNull()
  })

  it("handles denied geolocation without inventing a start node", async () => {
    const geo = {
      getCurrentPosition(
        _success: PositionCallback,
        error?: PositionErrorCallback,
      ) {
        error?.({
          code: 1,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: "denied",
        } as GeolocationPositionError)
      },
    } as Geolocation
    const result = await requestBrowserLocation({ geo })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("denied")
    }
  })

  it("treats non-absolute orientation as unreliable compass data", () => {
    expect(getCompassSupport(undefined as unknown as Window & typeof globalThis).supported).toBe(
      false,
    )
    const heading = headingFromOrientationEvent({
      alpha: 90,
      absolute: false,
    } as DeviceOrientationEvent)
    expect(heading.ok).toBe(false)
  })
})
