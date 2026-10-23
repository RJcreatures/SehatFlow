import type {
  HospitalGraph,
  RouteHop,
  RouteMode,
  RouteResult,
} from "./types.ts"

export function findRoute(
  graph: HospitalGraph,
  fromId: string,
  toId: string,
  mode: RouteMode,
): RouteResult {
  if (!graph.nodes[fromId] || !graph.nodes[toId]) {
    return {
      status: "no_route",
      mode,
      reason: "unknown_node",
      fromId,
      toId,
    }
  }

  if (fromId === toId) {
    return { status: "same_place", mode, nodeId: fromId }
  }

  const allowedEdges = graph.edges.filter((edge) => {
    if (mode === "assisted") {
      return edge.stepFree && edge.kind !== "stairs"
    }
    return true
  })

  const adjacency = new Map<string, Array<{ to: string; edgeId: string; seconds: number; kind: typeof allowedEdges[number]["kind"]; stepFree: boolean }>>()
  for (const edge of allowedEdges) {
    const list = adjacency.get(edge.from) ?? []
    list.push({
      to: edge.to,
      edgeId: edge.id,
      seconds: edge.seconds,
      kind: edge.kind,
      stepFree: edge.stepFree,
    })
    adjacency.set(edge.from, list)
  }

  const dist = new Map<string, number>()
  const prev = new Map<string, { nodeId: string; edgeId: string; kind: typeof allowedEdges[number]["kind"]; stepFree: boolean; seconds: number }>()
  const visited = new Set<string>()

  for (const nodeId of Object.keys(graph.nodes)) {
    dist.set(nodeId, Number.POSITIVE_INFINITY)
  }
  dist.set(fromId, 0)

  while (true) {
    let current: string | null = null
    let best = Number.POSITIVE_INFINITY
    for (const [nodeId, distance] of dist) {
      if (!visited.has(nodeId) && distance < best) {
        best = distance
        current = nodeId
      }
    }

    if (current === null || best === Number.POSITIVE_INFINITY) {
      break
    }
    if (current === toId) {
      break
    }

    visited.add(current)
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next.to)) {
        continue
      }
      const candidate = best + next.seconds
      if (candidate < (dist.get(next.to) ?? Number.POSITIVE_INFINITY)) {
        dist.set(next.to, candidate)
        prev.set(next.to, {
          nodeId: current,
          edgeId: next.edgeId,
          kind: next.kind,
          stepFree: next.stepFree,
          seconds: next.seconds,
        })
      }
    }
  }

  if ((dist.get(toId) ?? Number.POSITIVE_INFINITY) === Number.POSITIVE_INFINITY) {
    return {
      status: "no_route",
      mode,
      reason: mode === "assisted" ? "no_step_free" : "disconnected",
      fromId,
      toId,
    }
  }

  const path: string[] = [toId]
  const hops: RouteHop[] = []
  let cursor = toId
  while (cursor !== fromId) {
    const step = prev.get(cursor)
    if (!step) {
      return {
        status: "no_route",
        mode,
        reason: "disconnected",
        fromId,
        toId,
      }
    }
    hops.unshift({
      from: step.nodeId,
      to: cursor,
      edgeId: step.edgeId,
      kind: step.kind,
      stepFree: step.stepFree,
      seconds: step.seconds,
    })
    cursor = step.nodeId
    path.unshift(cursor)
  }

  if (mode === "assisted" && hops.some((hop) => !hop.stepFree || hop.kind === "stairs")) {
    return {
      status: "no_route",
      mode,
      reason: "no_step_free",
      fromId,
      toId,
    }
  }

  return {
    status: "ok",
    mode,
    path,
    hops,
    totalSeconds: hops.reduce((sum, hop) => sum + hop.seconds, 0),
  }
}

export function routeContainsStairs(result: RouteResult): boolean {
  return result.status === "ok" && result.hops.some((hop) => hop.kind === "stairs")
}
