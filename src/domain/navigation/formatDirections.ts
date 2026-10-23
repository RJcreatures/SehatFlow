import type { MessageCatalog } from "../../i18n/types.ts"
import { buildDirectionSteps, formatMinutesFromSeconds } from "./directions.ts"
import type { DirectionStep, FloorId, HospitalGraph, RouteResult } from "./types.ts"

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

export function formatDirectionText(
  messages: MessageCatalog,
  graph: HospitalGraph,
  step: DirectionStep,
): string {
  const place = placeLabel(messages, graph, step.toId)
  const floor = floorLabel(messages, step.toFloor)

  switch (step.kind) {
    case "start":
      return fill(messages.findStepStart, {
        place: placeLabel(messages, graph, step.fromId),
        floor: floorLabel(messages, step.fromFloor),
      })
    case "walk":
      return fill(messages.findStepWalk, { place })
    case "lift":
      return fill(messages.findStepLift, { place, floor })
    case "ramp":
      return fill(messages.findStepRamp, { place, floor })
    case "stairs":
      return fill(messages.findStepStairs, { place, floor })
    case "arrive":
      return fill(messages.findStepArrive, {
        place: placeLabel(messages, graph, step.toId),
      })
    case "floor_change":
      return fill(messages.findStepFloorChange, {
        fromFloor: floorLabel(messages, step.fromFloor),
        toFloor: floorLabel(messages, step.toFloor),
      })
  }
}

export function writtenDirectionsForRoute(
  messages: MessageCatalog,
  graph: HospitalGraph,
  result: RouteResult,
): string[] {
  return buildDirectionSteps(graph, result).map((step) =>
    formatDirectionText(messages, graph, step),
  )
}

export function routeDurationLabel(
  messages: MessageCatalog,
  totalSeconds: number,
): string {
  return fill(messages.findDuration, {
    minutes: String(formatMinutesFromSeconds(totalSeconds)),
  })
}
