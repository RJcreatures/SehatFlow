import type { MessageCatalog } from "../i18n/types.ts"
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
}

const LANDMARK_IDS = [
  "entrance",
  "reception",
  "help_desk",
  "water_station",
  "lift_g",
  "ramp_g",
  "stairs_g",
  "corridor_g_main",
  "corridor_g_clinic",
  "dept_general_medicine",
  "dept_pediatrics",
  "dept_womens_health",
  "lift_1",
  "ramp_1",
  "stairs_1",
  "corridor_f_main",
  "dept_orthopedics",
  "dept_ent",
  "dept_ophthalmology",
  "dept_dermatology",
] as const

export function HospitalMap({
  graph,
  route,
  messages,
  labelFor,
  startId,
  destinationId,
  floorView,
  onFloorViewChange,
}: Props) {
  const undirected = uniqueUndirectedEdges(graph)
  const routeNodeIds = new Set(route?.status === "ok" ? route.path : [])
  const hopPairs =
    route?.status === "ok"
      ? new Set(route.hops.map((hop) => pairKey(hop.from, hop.to)))
      : new Set<string>()

  const showFloor = (floor: FloorId) => floorView === "all" || floorView === floor

  return (
    <div className="hospital-map-wrap">
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

      <svg
        className="hospital-map"
        viewBox="0 0 420 460"
        role="img"
        aria-labelledby="hospital-map-title hospital-map-desc"
      >
        <title id="hospital-map-title">{messages.findMapTitle}</title>
        <desc id="hospital-map-desc">{messages.findMapDemoNote}</desc>

        {showFloor(0) ? (
          <g>
            <rect
              x="20"
              y="20"
              width="380"
              height="200"
              className="hospital-map-floor"
              rx="12"
            />
            <text x="36" y="44" className="hospital-map-floor-label">
              {messages.findFloorGround}
            </text>
            {/* Corridor band */}
            <path
              d="M70 140 H340"
              className="hospital-map-corridor-band"
            />
            <path
              d="M300 140 V90 H360"
              className="hospital-map-corridor-band"
            />
          </g>
        ) : null}

        {showFloor(1) ? (
          <g>
            <rect
              x="20"
              y="250"
              width="380"
              height="190"
              className="hospital-map-floor"
              rx="12"
            />
            <text x="36" y="274" className="hospital-map-floor-label">
              {messages.findFloorFirst}
            </text>
            <path
              d="M70 360 H340"
              className="hospital-map-corridor-band"
            />
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
              strokeDasharray={onRoute && edge.kind === "corridor" ? undefined : pattern}
            />
          )
        })}

        {LANDMARK_IDS.map((id) => {
          const node = graph.nodes[id]
          if (!node || !showFloor(node.floor)) {
            return null
          }
          const onRoute = routeNodeIds.has(id)
          const isStart = startId === id
          const isDest = destinationId === id
          const marker = markerFor(id)
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
                  onRoute || isStart || isDest
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
              <text
                x={node.x}
                y={node.y + 22}
                textAnchor="middle"
                className="hospital-map-caption"
              >
                {shortCaption(labelFor(id), marker)}
              </text>
            </g>
          )
        })}

        {/*
          Do not print raw path indexes on the map: written directions compress
          corridor hops, so hop numbers would disagree with the numbered list.
          The highlighted path already matches route.path / pathSignature.
        */}
      </svg>
    </div>
  )
}

function markerFor(id: string): string {
  if (id === "entrance") return "E"
  if (id === "reception") return "R"
  if (id === "help_desk") return "H"
  if (id === "water_station") return "W"
  if (id.startsWith("corridor")) return "·"
  if (id.startsWith("lift")) return "L"
  if (id.startsWith("ramp")) return "A"
  if (id.startsWith("stairs")) return "S"
  if (id.includes("general")) return "GM"
  if (id.includes("pediatrics")) return "PD"
  if (id.includes("womens")) return "WH"
  if (id.includes("orthopedics")) return "OR"
  if (id.includes("ent")) return "ENT"
  if (id.includes("ophthalmology")) return "EY"
  if (id.includes("dermatology")) return "SK"
  return "•"
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

function shortCaption(label: string, marker: string): string {
  if (label.length <= 14) {
    return label
  }
  return marker
}
