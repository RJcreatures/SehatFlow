import { useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router"
import { HospitalMap } from "../components/HospitalMap.tsx"
import { PageHeading } from "../components/PageHeading.tsx"
import {
  landmarkLabel,
  popularDestinationIds,
  routableDestinationIds,
  routableStartIds,
} from "../domain/navigation/landmarkCatalog.ts"
import {
  hospitalGraph,
  isRoutableNodeId,
} from "../domain/navigation/hospitalGraph.ts"
import {
  matchDestinationText,
  matchLandmarkText,
  type LocationMatchCandidate,
} from "../domain/navigation/locationMatch.ts"
import {
  buildNaturalDirections,
  naturalDurationLabel,
  routePathSignature,
} from "../domain/navigation/naturalDirections.ts"
import { findRoute } from "../domain/navigation/pathfind.ts"
import type { FloorId, RouteResult } from "../domain/navigation/types.ts"
import { useAssistantContext } from "../preferences/AssistantContext.tsx"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"

type ViewMode = "form" | "route"

/** Prefill from Ask SehatFlow / voice navigation handoff. */
export type FindLocationState = {
  fromId?: string
  toId?: string
  showRoute?: boolean
}

function notableWaypoints(result: RouteResult): string[] {
  if (result.status !== "ok") {
    return []
  }
  const notable = new Set(
    result.path.filter((id) => {
      const node = hospitalGraph.nodes[id]
      if (!node) {
        return false
      }
      if (node.departmentCode) {
        return true
      }
      return !id.startsWith("corridor")
    }),
  )
  const ordered: string[] = []
  for (const id of result.path) {
    if (notable.has(id) && !ordered.includes(id)) {
      ordered.push(id)
    }
  }
  return ordered
}

export function FindPage() {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const { setRouteContext } = useAssistantContext()
  const location = useLocation()
  const handoff = (location.state as FindLocationState | null) ?? null

  const startOptions = useMemo(() => routableStartIds(), [])
  const destinationOptions = useMemo(() => routableDestinationIds(), [])
  const popularIds = useMemo(() => popularDestinationIds(), [])

  const initialFrom =
    handoff?.fromId && isRoutableNodeId(handoff.fromId) ? handoff.fromId : ""
  const initialTo =
    handoff?.toId && isRoutableNodeId(handoff.toId) ? handoff.toId : ""

  const [view, setView] = useState<ViewMode>(() =>
    initialFrom && initialTo && handoff?.showRoute !== false ? "route" : "form",
  )
  const [fromId, setFromId] = useState(initialFrom)
  const [toId, setToId] = useState(initialTo)
  const [fromQuery, setFromQuery] = useState(() =>
    initialFrom ? landmarkLabel(messages, initialFrom) : "",
  )
  const [toQuery, setToQuery] = useState(() =>
    initialTo ? landmarkLabel(messages, initialTo) : "",
  )
  const [fromSuggestions, setFromSuggestions] = useState<LocationMatchCandidate[]>(
    [],
  )
  const [toSuggestions, setToSuggestions] = useState<LocationMatchCandidate[]>([])
  const [fromError, setFromError] = useState<string | null>(null)
  const [toError, setToError] = useState<string | null>(null)
  const [floorView, setFloorView] = useState<FloorId | "all">("all")
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    const next = (location.state as FindLocationState | null) ?? null
    if (!next?.fromId && !next?.toId) {
      return
    }
    if (next.fromId && isRoutableNodeId(next.fromId)) {
      setFromId(next.fromId)
      setFromQuery(landmarkLabel(messages, next.fromId))
      setFromError(null)
    }
    if (next.toId && isRoutableNodeId(next.toId)) {
      setToId(next.toId)
      setToQuery(landmarkLabel(messages, next.toId))
      setToError(null)
    }
    if (
      next.fromId &&
      next.toId &&
      isRoutableNodeId(next.fromId) &&
      isRoutableNodeId(next.toId) &&
      next.showRoute !== false
    ) {
      setView("route")
      setActiveStep(0)
    }
  }, [location.state, messages])

  const canShowRoute =
    Boolean(fromId) &&
    Boolean(toId) &&
    isRoutableNodeId(fromId) &&
    isRoutableNodeId(toId)

  const route: RouteResult | null = useMemo(() => {
    if (view !== "route" || !canShowRoute) {
      return null
    }
    return findRoute(hospitalGraph, fromId, toId, "assisted")
  }, [view, canShowRoute, fromId, toId])

  const directions = useMemo(() => {
    if (!route) {
      return []
    }
    return buildNaturalDirections(messages, hospitalGraph, route)
  }, [route, messages])

  const waypoints = useMemo(() => (route ? notableWaypoints(route) : []), [route])
  const pathSignature = route ? routePathSignature(route) : ""

  useEffect(() => {
    setRouteContext({
      routeMode: "assisted",
      startId: fromId || "entrance",
    })
  }, [fromId, setRouteContext])

  useEffect(() => {
    setActiveStep(0)
    if (route?.status === "ok") {
      const floors = new Set(
        route.path.map((id) => hospitalGraph.nodes[id]?.floor).filter(
          (floor): floor is FloorId => floor === 0 || floor === 1,
        ),
      )
      setFloorView(floors.size === 1 ? [...floors][0]! : "all")
    }
  }, [route])

  function labelFor(nodeId: string): string {
    return landmarkLabel(messages, nodeId)
  }

  function applyFromMatch(text: string) {
    const result = matchLandmarkText(text, startOptions)
    if (result.status === "exact") {
      setFromId(result.candidate.id)
      setFromQuery(labelFor(result.candidate.id))
      setFromSuggestions([])
      setFromError(null)
      return
    }
    if (result.status === "suggestions") {
      setFromSuggestions(result.candidates)
      setFromError(messages.findStartConfirmNeeded)
      return
    }
    setFromSuggestions([])
    setFromError(messages.findStartUnrecognized)
  }

  function applyToMatch(text: string) {
    const result = matchDestinationText(text, destinationOptions)
    if (result.status === "exact") {
      setToId(result.candidate.id)
      setToQuery(labelFor(result.candidate.id))
      setToSuggestions([])
      setToError(null)
      return
    }
    if (result.status === "suggestions") {
      setToSuggestions(result.candidates)
      setToError(messages.findDestinationConfirmNeeded)
      return
    }
    setToSuggestions([])
    setToError(messages.findDestinationUnrecognized)
  }

  function showRoute() {
    if (!fromId) {
      setFromError(messages.findStartRequired)
      return
    }
    if (!toId) {
      setToError(messages.findDestinationRequired)
      return
    }
    setView("route")
  }

  const currentLine = directions[activeStep] ?? directions[0] ?? ""

  return (
    <>
      <PageHeading title={messages.findTitle} />

      {view === "form" ? (
        <section className="panel find-form" aria-labelledby="find-form-heading">
          <h2 id="find-form-heading" className="visually-hidden">
            {messages.findWhereGoing}
          </h2>

          <div className="find-field">
            <label className="field-label" htmlFor="find-from">
              {messages.findFromLabel}
            </label>
            <input
              id="find-from"
              className="text-input find-input"
              value={fromQuery}
              placeholder={messages.findStartPlaceholder}
              autoComplete="off"
              onChange={(event) => {
                setFromQuery(event.target.value)
                setFromId("")
                setFromError(null)
              }}
              onBlur={() => {
                if (fromQuery.trim() && !fromId) {
                  applyFromMatch(fromQuery)
                }
              }}
            />
            <div className="choice-row find-chip-row" role="list">
              {startOptions.slice(0, 6).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={fromId === id ? "choice is-selected" : "choice"}
                  onClick={() => {
                    setFromId(id)
                    setFromQuery(labelFor(id))
                    setFromSuggestions([])
                    setFromError(null)
                  }}
                >
                  {labelFor(id)}
                </button>
              ))}
            </div>
            {fromSuggestions.length > 0 ? (
              <div className="choice-row" role="list">
                {fromSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="choice"
                    onClick={() => {
                      setFromId(item.id)
                      setFromQuery(labelFor(item.id))
                      setFromSuggestions([])
                      setFromError(null)
                    }}
                  >
                    {labelFor(item.id)}
                  </button>
                ))}
              </div>
            ) : null}
            {fromError ? (
              <p className="form-error" role="alert">
                {fromError}
              </p>
            ) : null}
          </div>

          <div className="find-field">
            <label className="field-label" htmlFor="find-to">
              {messages.findToLabel}
            </label>
            <input
              id="find-to"
              className="text-input find-input"
              value={toQuery}
              placeholder={messages.findDestinationPlaceholder}
              autoComplete="off"
              onChange={(event) => {
                setToQuery(event.target.value)
                setToId("")
                setToError(null)
              }}
              onBlur={() => {
                if (toQuery.trim() && !toId) {
                  applyToMatch(toQuery)
                }
              }}
            />
            <div className="choice-row find-chip-row" role="list">
              {popularIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={toId === id ? "choice is-selected" : "choice"}
                  onClick={() => {
                    setToId(id)
                    setToQuery(labelFor(id))
                    setToSuggestions([])
                    setToError(null)
                  }}
                >
                  {labelFor(id)}
                </button>
              ))}
            </div>
            {toSuggestions.length > 0 ? (
              <div className="choice-row" role="list">
                {toSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="choice"
                    onClick={() => {
                      setToId(item.id)
                      setToQuery(labelFor(item.id))
                      setToSuggestions([])
                      setToError(null)
                    }}
                  >
                    {labelFor(item.id)}
                  </button>
                ))}
              </div>
            ) : null}
            {toError ? (
              <p className="form-error" role="alert">
                {toError}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            className="button find-show-route"
            disabled={!canShowRoute}
            onClick={showRoute}
          >
            {messages.findShowRoute}
          </button>
        </section>
      ) : null}

      {view === "route" && route ? (
        <section className="find-route-view" aria-live="polite">
          <div className="panel">
            <h2 className="find-destination-title">{labelFor(toId)}</h2>
            <p className="status-line">{labelFor(fromId)}</p>
            <button type="button" className="choice" onClick={() => setView("form")}>
              {messages.findChangeRoute}
            </button>
          </div>

          {route.status === "ok" ? (
            <>
              <HospitalMap
                graph={hospitalGraph}
                route={route}
                messages={messages}
                labelFor={labelFor}
                startId={fromId}
                destinationId={toId}
                floorView={floorView}
                onFloorViewChange={setFloorView}
                stepNodeIds={waypoints}
                activeStepIndex={Math.min(activeStep, Math.max(0, waypoints.length - 1))}
                mapRotationDegrees={0}
                showNorth
              />
              <p className="emphasis">
                {naturalDurationLabel(messages, route.totalSeconds)}
              </p>
              <p className="visually-hidden">
                {messages.findPathSignature}: {pathSignature}
              </p>

              <section className="panel find-now-panel" aria-labelledby="find-now">
                <h2 id="find-now">{messages.findCurrentInstruction}</h2>
                <p className="find-now-text">
                  <span aria-hidden="true">→ </span>
                  {currentLine}
                </p>
                <p className="status-line">
                  {messages.findStepOf
                    .replace("{current}", String(activeStep + 1))
                    .replace("{total}", String(Math.max(1, directions.length)))}
                </p>
                <div className="choice-row">
                  <button
                    type="button"
                    className="choice"
                    disabled={activeStep <= 0}
                    onClick={() => setActiveStep((value) => Math.max(0, value - 1))}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="choice"
                    disabled={activeStep >= directions.length - 1}
                    onClick={() =>
                      setActiveStep((value) =>
                        Math.min(directions.length - 1, value + 1),
                      )
                    }
                  >
                    →
                  </button>
                </div>
              </section>
            </>
          ) : route.status === "same_place" ? (
            <p className="emphasis panel">{messages.findSamePlace}</p>
          ) : (
            <div className="panel">
              <p className="form-error" role="alert">
                {route.reason === "no_step_free"
                  ? messages.findNoStepFree
                  : messages.findNoRoute}
              </p>
              <p className="emphasis">{messages.findGoHelpDesk}</p>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setView("form")}
              >
                {messages.findChangeRoute}
              </button>
            </div>
          )}
        </section>
      ) : null}
      <span lang={preferences.language} className="visually-hidden">
        {preferences.language}
      </span>
    </>
  )
}
