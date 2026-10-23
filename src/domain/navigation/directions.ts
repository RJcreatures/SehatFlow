import type { DirectionStep, HospitalGraph, RouteResult } from "./types.ts"

/** Build written steps from the same RouteResult used to draw the map. */
export function buildDirectionSteps(
  graph: HospitalGraph,
  result: RouteResult,
): DirectionStep[] {
  if (result.status === "same_place") {
    const node = graph.nodes[result.nodeId]
    if (!node) {
      return []
    }
    return [
      {
        kind: "arrive",
        fromId: result.nodeId,
        toId: result.nodeId,
        seconds: 0,
        fromFloor: node.floor,
        toFloor: node.floor,
      },
    ]
  }

  if (result.status !== "ok") {
    return []
  }

  const steps: DirectionStep[] = []
  const start = graph.nodes[result.path[0]!]
  if (!start) {
    return []
  }

  steps.push({
    kind: "start",
    fromId: start.id,
    toId: start.id,
    seconds: 0,
    fromFloor: start.floor,
    toFloor: start.floor,
  })

  for (const hop of result.hops) {
    const from = graph.nodes[hop.from]
    const to = graph.nodes[hop.to]
    if (!from || !to) {
      continue
    }

    if (from.floor !== to.floor) {
      steps.push({
        kind: "floor_change",
        fromId: hop.from,
        toId: hop.to,
        edgeKind: hop.kind,
        seconds: hop.seconds,
        fromFloor: from.floor,
        toFloor: to.floor,
      })
    }

    const kind =
      hop.kind === "lift"
        ? "lift"
        : hop.kind === "ramp"
          ? "ramp"
          : hop.kind === "stairs"
            ? "stairs"
            : "walk"

    steps.push({
      kind,
      fromId: hop.from,
      toId: hop.to,
      edgeKind: hop.kind,
      seconds: hop.seconds,
      fromFloor: from.floor,
      toFloor: to.floor,
    })
  }

  const endId = result.path[result.path.length - 1]!
  const end = graph.nodes[endId]
  if (end) {
    steps.push({
      kind: "arrive",
      fromId: end.id,
      toId: end.id,
      seconds: 0,
      fromFloor: end.floor,
      toFloor: end.floor,
    })
  }

  return steps
}

export function formatMinutesFromSeconds(totalSeconds: number): number {
  return Math.max(1, Math.round(totalSeconds / 60))
}
