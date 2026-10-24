import type { MessageCatalog } from "../../i18n/types.ts"
import { formatMinutesFromSeconds } from "./directions.ts"
import type { FloorId, HospitalGraph, RouteHop, RouteResult } from "./types.ts"

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")
}

function floorLabel(messages: MessageCatalog, floor: FloorId): string {
  return floor === 0 ? messages.findFloorGround : messages.findFloorFirst
}

function placeLabel(
  messages: MessageCatalog,
  graph: HospitalGraph,
  nodeId: string,
): string {
  const node = graph.nodes[nodeId]
  if (!node) {
    return nodeId
  }
  const key = node.labelKey as keyof MessageCatalog
  const value = messages[key]
  return typeof value === "string" ? value : nodeId
}

function bearing(from: { x: number; y: number }, to: { x: number; y: number }) {
  return Math.atan2(to.y - from.y, to.x - from.x)
}

function turnBetween(
  graph: HospitalGraph,
  a: string,
  b: string,
  c: string,
): "left" | "right" | "straight" {
  const na = graph.nodes[a]
  const nb = graph.nodes[b]
  const nc = graph.nodes[c]
  if (!na || !nb || !nc) {
    return "straight"
  }
  const first = bearing(na, nb)
  const second = bearing(nb, nc)
  let delta = second - first
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  if (Math.abs(delta) < Math.PI / 5) {
    return "straight"
  }
  return delta > 0 ? "right" : "left"
}

function isNotableLandmark(nodeId: string, graph: HospitalGraph): boolean {
  const node = graph.nodes[nodeId]
  if (!node) {
    return false
  }
  if (node.departmentCode) {
    return true
  }
  return [
    "entrance",
    "reception",
    "help_desk",
    "water_station",
    "lift_g",
    "lift_1",
    "ramp_g",
    "ramp_1",
    "stairs_g",
    "stairs_1",
  ].includes(nodeId)
}

/**
 * Build natural, ordered instructions from the same RouteResult used by the map.
 * Only references nodes and edge kinds present on that path.
 */
export function buildNaturalDirections(
  messages: MessageCatalog,
  graph: HospitalGraph,
  result: RouteResult,
): string[] {
  if (result.status === "same_place") {
    return [
      fill(messages.findNaturalSamePlace, {
        place: placeLabel(messages, graph, result.nodeId),
      }),
    ]
  }
  if (result.status !== "ok") {
    return []
  }

  const lines: string[] = []
  const startId = result.path[0]!
  lines.push(
    fill(messages.findNaturalStart, {
      place: placeLabel(messages, graph, startId),
      floor: floorLabel(messages, graph.nodes[startId]!.floor),
    }),
  )

  const hops = result.hops
  let index = 0
  while (index < hops.length) {
    const hop = hops[index]!
    if (hop.kind === "lift" || hop.kind === "ramp" || hop.kind === "stairs") {
      const template =
        hop.kind === "lift"
          ? messages.findNaturalLift
          : hop.kind === "ramp"
            ? messages.findNaturalRamp
            : messages.findNaturalStairs
      lines.push(
        fill(template, {
          place: placeLabel(messages, graph, hop.to),
          floor: floorLabel(messages, graph.nodes[hop.to]!.floor),
        }),
      )
      index += 1
      continue
    }

    // Compress a corridor segment until the next notable landmark or floor connector.
    const segmentStart = hop.from
    let cursor = index
    let lastNotable = hop.to
    while (cursor < hops.length) {
      const current = hops[cursor]!
      if (current.kind !== "corridor") {
        break
      }
      lastNotable = current.to
      if (
        isNotableLandmark(current.to, graph) &&
        current.to !== segmentStart
      ) {
        cursor += 1
        break
      }
      cursor += 1
    }

    const previousId = hops[index - 1]?.from
    const viaId = hops[index]!.to
    if (
      previousId &&
      hops[index - 1]?.kind === "corridor" &&
      graph.nodes[previousId] &&
      graph.nodes[segmentStart] &&
      graph.nodes[viaId]
    ) {
      const turn = turnBetween(graph, previousId, segmentStart, viaId)
      if (turn === "left") {
        lines.push(
          fill(messages.findNaturalTurnLeft, {
            place: placeLabel(messages, graph, segmentStart),
          }),
        )
      } else if (turn === "right") {
        lines.push(
          fill(messages.findNaturalTurnRight, {
            place: placeLabel(messages, graph, segmentStart),
          }),
        )
      }
    }

    lines.push(
      fill(messages.findNaturalWalkTo, {
        place: placeLabel(messages, graph, lastNotable),
      }),
    )
    index = Math.max(cursor, index + 1)
  }

  const endId = result.path[result.path.length - 1]!
  lines.push(
    fill(messages.findNaturalArrive, {
      place: placeLabel(messages, graph, endId),
      floor: floorLabel(messages, graph.nodes[endId]!.floor),
    }),
  )

  return lines
}

export function naturalDurationLabel(
  messages: MessageCatalog,
  totalSeconds: number,
): string {
  return fill(messages.findDuration, {
    minutes: String(formatMinutesFromSeconds(totalSeconds)),
  })
}

/** Shared path identity for map + text (must stay in sync). */
export function routePathSignature(result: RouteResult): string {
  if (result.status === "ok") {
    return result.path.join(">")
  }
  if (result.status === "same_place") {
    return `same:${result.nodeId}`
  }
  return `none:${result.reason}:${result.fromId}>${result.toId}`
}

export function hopsMatchPath(hops: RouteHop[], path: string[]): boolean {
  if (path.length === 0) {
    return hops.length === 0
  }
  if (hops.length !== path.length - 1) {
    return false
  }
  return hops.every(
    (hop, index) => hop.from === path[index] && hop.to === path[index + 1],
  )
}
