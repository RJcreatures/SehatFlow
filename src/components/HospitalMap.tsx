import type { MessageCatalog } from "../i18n/types.ts"
import type { HospitalGraph, RouteResult } from "../domain/navigation/types.ts"

type Props = {
  graph: HospitalGraph
  route: RouteResult | null
  messages: MessageCatalog
  labelFor: (nodeId: string) => string
}

const MAP_LABEL_IDS = [
  "entrance",
  "reception",
  "help_desk",
  "lift_g",
  "ramp_g",
  "stairs_g",
  "dept_general_medicine",
  "dept_pediatrics",
  "dept_womens_health",
  "lift_1",
  "dept_orthopedics",
  "dept_ent",
  "dept_ophthalmology",
  "dept_dermatology",
] as const

export function HospitalMap({ graph, route, messages, labelFor }: Props) {
  const undirected = uniqueUndirectedEdges(graph)
  const routeNodeIds = new Set(route?.status === "ok" ? route.path : [])
  const hopPairs =
    route?.status === "ok"
      ? new Set(route.hops.map((hop) => pairKey(hop.from, hop.to)))
      : new Set<string>()

  return (
    <svg
      className="hospital-map"
      viewBox="0 0 420 460"
      role="img"
      aria-labelledby="hospital-map-title hospital-map-desc"
    >
      <title id="hospital-map-title">{messages.findMapTitle}</title>
      <desc id="hospital-map-desc">{messages.findMapDemoNote}</desc>

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

      {undirected.map((edge) => {
        const from = graph.nodes[edge.from]
        const to = graph.nodes[edge.to]
        if (!from || !to) {
          return null
        }
        const onRoute = hopPairs.has(pairKey(edge.from, edge.to))
        const pattern =
          edge.kind === "stairs"
            ? "4 4"
            : edge.kind === "lift"
              ? "8 3"
              : edge.kind === "ramp"
                ? "2 3"
                : undefined
        return (
          <line
            key={edge.id}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            className={
              onRoute ? "hospital-map-edge is-route" : "hospital-map-edge"
            }
            strokeDasharray={onRoute ? undefined : pattern}
          />
        )
      })}

      {MAP_LABEL_IDS.map((id) => {
        const node = graph.nodes[id]
        if (!node) {
          return null
        }
        const onRoute = routeNodeIds.has(id)
        const marker =
          id === "entrance"
            ? "E"
            : id === "reception"
              ? "R"
              : id === "help_desk"
                ? "H"
                : id.startsWith("lift")
                  ? "L"
                  : id.startsWith("ramp")
                    ? "A"
                    : id.startsWith("stairs")
                      ? "S"
                      : id.includes("general")
                        ? "GM"
                        : id.includes("pediatrics")
                          ? "PD"
                          : id.includes("womens")
                            ? "WH"
                            : id.includes("orthopedics")
                              ? "OR"
                              : id.includes("ent")
                                ? "ENT"
                                : id.includes("ophthalmology")
                                  ? "EY"
                                  : id.includes("dermatology")
                                    ? "SK"
                                    : "•"
        return (
          <g key={id}>
            <circle
              cx={node.x}
              cy={node.y}
              r={onRoute ? 11 : 8}
              className={
                onRoute ? "hospital-map-node is-route" : "hospital-map-node"
              }
            />
            <text
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              className={
                onRoute
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

      {route?.status === "ok"
        ? route.path.map((nodeId, index) => {
            const node = graph.nodes[nodeId]
            if (!node || index === 0) {
              return null
            }
            return (
              <text
                key={`step-${nodeId}-${index}`}
                x={node.x + 14}
                y={node.y - 10}
                className="hospital-map-step"
              >
                {index}
              </text>
            )
          })
        : null}
    </svg>
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

function shortCaption(label: string, marker: string): string {
  if (label.length <= 14) {
    return label
  }
  return marker
}
