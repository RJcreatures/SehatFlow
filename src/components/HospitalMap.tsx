import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import type { MessageCatalog } from "../i18n/types.ts"
import {
  landmarkMarker,
  routableDestinationIds,
  routableStartIds,
} from "../domain/navigation/landmarkCatalog.ts"
import type { FloorId, HospitalGraph, RouteResult } from "../domain/navigation/types.ts"

type Props = {
  graph: HospitalGraph
  route: RouteResult | null
  messages: MessageCatalog
  labelFor: (nodeId: string) => string
  startId?: string | null
  destinationId?: string | null
  floorView: FloorId | "all"
  onFloorViewChange: (floor: FloorId | "all") => void
  /** Waypoints from the same RouteResult used for written steps (notable nodes). */
  stepNodeIds?: string[]
  activeStepIndex?: number
  mapRotationDegrees?: number
  showNorth?: boolean
}

const VIEW_W = 440
const VIEW_H = 480

export function HospitalMap({
  graph,
  route,
  messages,
  labelFor,
  startId,
  destinationId,
  floorView,
  onFloorViewChange,
  stepNodeIds = [],
  activeStepIndex = 0,
  mapRotationDegrees = 0,
  showNorth = true,
}: Props) {
  const undirected = uniqueUndirectedEdges(graph)
  const routeNodeIds = new Set(route?.status === "ok" ? route.path : [])
  const hopPairs =
    route?.status === "ok"
      ? new Set(route.hops.map((hop) => pairKey(hop.from, hop.to)))
      : new Set<string>()

  const landmarkIds = useMemo(() => {
    const ids = new Set([
      ...routableStartIds(graph),
      ...routableDestinationIds(graph),
      "lift_1",
      "ramp_1",
      "stairs_1",
      "corridor_g_main",
      "corridor_g_clinic",
      "corridor_g_services",
      "corridor_f_main",
    ])
    return [...ids].filter((id) => graph.nodes[id])
  }, [graph])

  const showFloor = (floor: FloorId) => floorView === "all" || floorView === floor

  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null,
  )
  const wrapRef = useRef<HTMLDivElement>(null)

  const fitRoute = () => {
    if (route?.status !== "ok" || route.path.length === 0) {
      setScale(1)
      setPan({ x: 0, y: 0 })
      return
    }
    const points = route.path
      .map((id) => graph.nodes[id])
      .filter(Boolean) as Array<{ x: number; y: number; floor: FloorId }>
    if (points.length === 0) {
      return
    }
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const minX = Math.min(...xs) - 40
    const maxX = Math.max(...xs) + 40
    const minY = Math.min(...ys) - 40
    const maxY = Math.max(...ys) + 40
    const w = Math.max(80, maxX - minX)
    const h = Math.max(80, maxY - minY)
    const nextScale = Math.min(2.4, Math.max(1, Math.min(VIEW_W / w, VIEW_H / h) * 0.9))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setScale(nextScale)
    setPan({
      x: VIEW_W / 2 - cx * nextScale,
      y: VIEW_H / 2 - cy * nextScale,
    })
  }

  useEffect(() => {
    fitRoute()
    // Recenter when the computed route identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.status === "ok" ? route.path.join(">") : route?.status])

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag.current) {
      return
    }
    setPan({
      x: drag.current.panX + (event.clientX - drag.current.x),
      y: drag.current.panY + (event.clientY - drag.current.y),
    })
  }

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    drag.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
  }

  const routePolyline =
    route?.status === "ok"
      ? route.path
          .map((id) => graph.nodes[id])
          .filter(Boolean)
          .map((node) => `${node!.x},${node!.y}`)
          .join(" ")
      : ""

  return (
    <div className="hospital-map-wrap" ref={wrapRef}>
      <div className="hospital-map-toolbar" role="group" aria-label={messages.findFloorViewLabel}>
        <button
          type="button"
          className={floorView === "all" ? "choice is-selected" : "choice"}
          onClick={() => onFloorViewChange("all")}
        >
          {messages.findFloorViewAll}
        </button>
        <button
          type="button"
          className={floorView === 0 ? "choice is-selected" : "choice"}
          onClick={() => onFloorViewChange(0)}
        >
          {messages.findFloorGround}
        </button>
        <button
          type="button"
          className={floorView === 1 ? "choice is-selected" : "choice"}
          onClick={() => onFloorViewChange(1)}
        >
          {messages.findFloorFirst}
        </button>
      </div>

      <div className="hospital-map-controls" role="group" aria-label={messages.findMapTitle}>
        <button
          type="button"
          className="choice"
          onClick={() => setScale((value) => Math.min(3, value + 0.25))}
        >
          {messages.findZoomIn}
        </button>
        <button
          type="button"
          className="choice"
          onClick={() => setScale((value) => Math.max(0.75, value - 0.25))}
        >
          {messages.findZoomOut}
        </button>
        <button type="button" className="choice" onClick={fitRoute}>
          {messages.findResetMap}
        </button>
      </div>

      <div className="hospital-map-frame">
        {showNorth ? (
          <p className="hospital-map-north" aria-hidden="true">
            ↑ {messages.findNorthIndicator}
          </p>
        ) : null}
        <svg
          className="hospital-map"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-labelledby="hospital-map-title"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <title id="hospital-map-title">{messages.findMapTitle}</title>
          <g
            transform={`translate(${pan.x} ${pan.y}) scale(${scale}) rotate(${mapRotationDegrees} ${VIEW_W / 2} ${VIEW_H / 2})`}
          >
            {showFloor(0) ? (
              <g>
                <rect
                  x="16"
                  y="16"
                  width="408"
                  height="220"
                  className="hospital-map-floor"
                  rx="14"
                />
                <text x="32" y="40" className="hospital-map-floor-label">
                  {messages.findFloorGround}
                </text>
                <path d="M60 160 H330" className="hospital-map-corridor-band" />
                <path
                  d="M260 160 V120 H340"
                  className="hospital-map-corridor-band"
                />
                <path
                  d="M300 120 H380"
                  className="hospital-map-corridor-band"
                />
              </g>
            ) : null}

            {showFloor(1) ? (
              <g>
                <rect
                  x="16"
                  y="260"
                  width="408"
                  height="200"
                  className="hospital-map-floor"
                  rx="14"
                />
                <text x="32" y="284" className="hospital-map-floor-label">
                  {messages.findFloorFirst}
                </text>
                <path d="M60 370 H340" className="hospital-map-corridor-band" />
              </g>
            ) : null}

            {undirected.map((edge) => {
              const from = graph.nodes[edge.from]
              const to = graph.nodes[edge.to]
              if (!from || !to) {
                return null
              }
              if (!showFloor(from.floor) && !showFloor(to.floor)) {
                return null
              }
              if (
                floorView !== "all" &&
                from.floor !== to.floor &&
                from.floor !== floorView &&
                to.floor !== floorView
              ) {
                return null
              }
              const onRoute = hopPairs.has(pairKey(edge.from, edge.to))
              const pattern =
                edge.kind === "stairs"
                  ? "5 4"
                  : edge.kind === "lift"
                    ? "10 4"
                    : edge.kind === "ramp"
                      ? "2 4"
                      : undefined
              return (
                <line
                  key={edge.id}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={
                    onRoute
                      ? `hospital-map-edge is-route kind-${edge.kind}`
                      : `hospital-map-edge kind-${edge.kind}`
                  }
                  strokeDasharray={
                    onRoute && edge.kind === "corridor" ? undefined : pattern
                  }
                />
              )
            })}

            {routePolyline ? (
              <polyline
                points={routePolyline}
                className="hospital-map-route-line"
                fill="none"
                markerMid="url(#route-arrow)"
                markerEnd="url(#route-arrow)"
              />
            ) : null}

            <defs>
              <marker
                id="route-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="hospital-map-arrow" />
              </marker>
            </defs>

            {landmarkIds.map((id) => {
              const node = graph.nodes[id]
              if (!node || !showFloor(node.floor)) {
                return null
              }
              const onRoute = routeNodeIds.has(id)
              const isStart = startId === id
              const isDest = destinationId === id
              const stepIndex = stepNodeIds.indexOf(id)
              const isActiveStep = stepIndex === activeStepIndex && stepIndex >= 0
              const marker = landmarkMarker(id)
              return (
                <g key={id}>
                  {isStart || isDest ? (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={16}
                      className={
                        isStart
                          ? "hospital-map-halo is-start"
                          : "hospital-map-halo is-destination"
                      }
                    />
                  ) : null}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={onRoute || isStart || isDest ? 11 : 8}
                    className={
                      isActiveStep
                        ? "hospital-map-node is-active-step"
                        : onRoute || isStart || isDest
                          ? "hospital-map-node is-route"
                          : "hospital-map-node"
                    }
                  />
                  <text
                    x={node.x}
                    y={node.y + 4}
                    textAnchor="middle"
                    className={
                      onRoute || isStart || isDest
                        ? "hospital-map-marker is-route"
                        : "hospital-map-marker"
                    }
                  >
                    {marker}
                  </text>
                  {stepIndex >= 0 ? (
                    <text
                      x={node.x + 14}
                      y={node.y - 10}
                      className="hospital-map-step-num"
                      aria-hidden="true"
                    >
                      {stepIndex + 1}
                    </text>
                  ) : null}
                  <title>{labelFor(id)}</title>
                </g>
              )
            })}
          </g>
        </svg>
      </div>
    </div>
  )
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function uniqueUndirectedEdges(graph: HospitalGraph) {
  const seen = new Set<string>()
  const edges = []
  for (const edge of graph.edges) {
    const key = pairKey(edge.from, edge.to)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    edges.push(edge)
  }
  return edges
}
