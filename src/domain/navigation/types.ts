export type FloorId = 0 | 1

export type EdgeKind = "corridor" | "ramp" | "lift" | "stairs"

export type NavNode = {
  id: string
  floor: FloorId
  x: number
  y: number
  /** Stable label key used for directions and map text. */
  labelKey: string
  departmentCode?: string
}

export type NavEdge = {
  id: string
  from: string
  to: string
  /** Walking time in seconds. */
  seconds: number
  kind: EdgeKind
  /** True only when the edge is verified step-free. */
  stepFree: boolean
}

export type HospitalGraph = {
  nodes: Record<string, NavNode>
  edges: NavEdge[]
}

export type RouteMode = "assisted" | "standard"

export type RouteHop = {
  from: string
  to: string
  edgeId: string
  kind: EdgeKind
  stepFree: boolean
  seconds: number
}

export type RouteResult =
  | {
      status: "ok"
      mode: RouteMode
      path: string[]
      hops: RouteHop[]
      totalSeconds: number
    }
  | {
      status: "same_place"
      mode: RouteMode
      nodeId: string
    }
  | {
      status: "no_route"
      mode: RouteMode
      reason: "no_step_free" | "disconnected" | "unknown_node"
      fromId: string
      toId: string
    }

export type DirectionStep = {
  kind: "start" | "walk" | "lift" | "ramp" | "stairs" | "arrive" | "floor_change"
  fromId: string
  toId: string
  edgeKind?: EdgeKind
  seconds: number
  fromFloor: FloorId
  toFloor: FloorId
}
