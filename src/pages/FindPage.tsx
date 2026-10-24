import { useEffect, useMemo, useState } from "react"
import { HospitalMap } from "../components/HospitalMap.tsx"
import { PageHeading } from "../components/PageHeading.tsx"
import type { DepartmentFact } from "../domain/voice/answers.ts"
import {
  departmentDestinationId,
  hospitalGraph,
  startPointOptions,
} from "../domain/navigation/hospitalGraph.ts"
import {
  matchDepartmentText,
  matchLandmarkText,
  SELECTABLE_START_LANDMARKS,
  type LocationMatchCandidate,
} from "../domain/navigation/locationMatch.ts"
import {
  localizedDepartmentName,
  localizedRoomFloor,
} from "../domain/departmentLabels.ts"
import {
  buildNaturalDirections,
  naturalDurationLabel,
  routePathSignature,
} from "../domain/navigation/naturalDirections.ts"
import { findRoute } from "../domain/navigation/pathfind.ts"
import type { FloorId, RouteMode } from "../domain/navigation/types.ts"
import type { MessageCatalog } from "../i18n/types.ts"
import {
  getSupabaseClient,
  readSupabaseState,
} from "../lib/supabase/client.ts"
import { supabaseErrorMessage } from "../lib/supabase/errors.ts"
import { useAssistantContext } from "../preferences/AssistantContext.tsx"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"

type DepartmentOption = {
  code: string
  name_en: string
  name_hi: string
  room_en?: string
  room_hi?: string
  floor_en?: string
  floor_hi?: string
}

type WizardStep = "start" | "destination" | "route"

const DEPARTMENT_CODES = [
  "general_medicine",
  "pediatrics",
  "womens_health",
  "orthopedics",
  "ent",
  "ophthalmology",
  "dermatology",
] as const

function fallbackDepartments(messages: MessageCatalog): DepartmentOption[] {
  const labels: Record<(typeof DEPARTMENT_CODES)[number], keyof MessageCatalog> =
    {
      general_medicine: "navDeptGeneralMedicine",
      pediatrics: "navDeptPediatrics",
      womens_health: "navDeptWomensHealth",
      orthopedics: "navDeptOrthopedics",
      ent: "navDeptEnt",
      ophthalmology: "navDeptOphthalmology",
      dermatology: "navDeptDermatology",
    }
  return DEPARTMENT_CODES.filter((code) => departmentDestinationId(code)).map(
    (code) => {
      const label = String(messages[labels[code]])
      return { code, name_en: label, name_hi: label }
    },
  )
}

export function FindPage() {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const {
    setRouteContext,
    setDepartments: setAssistantDepartments,
    setTokenContext,
  } = useAssistantContext()
  const supabaseState = readSupabaseState(import.meta.env)
  const client = getSupabaseClient()

  const [departments, setDepartments] = useState<DepartmentOption[]>(() =>
    fallbackDepartments(messages),
  )
  const [loadingDepartments, setLoadingDepartments] = useState(
    supabaseState.status === "ready",
  )
  const [loadError, setLoadError] = useState<string | null>(null)

  const [step, setStep] = useState<WizardStep>("start")
  const [startId, setStartId] = useState<string>("")
  const [startText, setStartText] = useState("")
  const [startSuggestions, setStartSuggestions] = useState<
    LocationMatchCandidate[]
  >([])
  const [startError, setStartError] = useState<string | null>(null)
  const [geoNote, setGeoNote] = useState<string | null>(null)

  const [destinationCode, setDestinationCode] = useState("")
  const [destinationText, setDestinationText] = useState("")
  const [destinationSuggestions, setDestinationSuggestions] = useState<
    LocationMatchCandidate[]
  >([])
  const [destinationError, setDestinationError] = useState<string | null>(null)

  const [mode, setMode] = useState<RouteMode>("assisted")
  const [floorView, setFloorView] = useState<FloorId | "all">("all")

  useEffect(() => {
    if (supabaseState.status !== "ready" || !client) {
      return
    }
    const supabase = client
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("code, name_en, name_hi, room_en, room_hi, floor_en, floor_hi")
        .eq("active", true)
        .order("display_order")
      if (cancelled) {
        return
      }
      if (error) {
        setLoadError(supabaseErrorMessage(error, messages.registerLoadError))
        setLoadingDepartments(false)
        return
      }
      const rows = (data ?? []) as DepartmentOption[]
      if (rows.length > 0) {
        setDepartments(rows)
      }
      setLoadingDepartments(false)
    })()
    return () => {
      cancelled = true
    }
  }, [client, messages.registerLoadError, supabaseState.status])

  const destinationNodeId = useMemo(() => {
    if (!destinationCode) {
      return null
    }
    return departmentDestinationId(destinationCode)
  }, [destinationCode])

  const route = useMemo(() => {
    if (step !== "route" || !startId || !destinationCode) {
      return null
    }
    if (!destinationNodeId) {
      return {
        status: "no_route" as const,
        mode,
        reason: "unknown_node" as const,
        fromId: startId,
        toId: destinationCode,
      }
    }
    return findRoute(hospitalGraph, startId, destinationNodeId, mode)
  }, [destinationCode, destinationNodeId, mode, startId, step])

  const directions = useMemo(() => {
    if (!route) {
      return []
    }
    return buildNaturalDirections(messages, hospitalGraph, route)
  }, [messages, route])

  const departmentFacts = useMemo((): DepartmentFact[] => {
    return departments.map((department) => {
      const nodeId = departmentDestinationId(department.code)
      const node = nodeId ? hospitalGraph.nodes[nodeId] : null
      const name = localizedDepartmentName(
        messages,
        preferences.language,
        department,
      )
      const places = localizedRoomFloor(
        preferences.language,
        department,
        messages.notAvailable,
      )
      return {
        code: department.code,
        name,
        room: places.room,
        floor:
          places.floor !== messages.notAvailable
            ? places.floor
            : node?.floor === 1
              ? messages.findFloorFirst
              : messages.findFloorGround,
      }
    })
  }, [departments, messages, preferences.language])

  useEffect(() => {
    setTokenContext(null)
    setAssistantDepartments(departmentFacts)
    setRouteContext({
      routeMode: mode,
      startId: startId || "entrance",
    })
    return () => {
      setRouteContext(null)
    }
  }, [
    departmentFacts,
    mode,
    startId,
    setAssistantDepartments,
    setRouteContext,
    setTokenContext,
  ])

  const pathSignature = route ? routePathSignature(route) : ""

  function labelFor(nodeId: string): string {
    const node = hospitalGraph.nodes[nodeId]
    if (!node) {
      return nodeId
    }
    const key = node.labelKey as keyof MessageCatalog
    const value = messages[key]
    return typeof value === "string" ? value : nodeId
  }

  function departmentLabel(code: string): string {
    const row = departments.find((item) => item.code === code)
    if (!row) {
      return localizedDepartmentName(messages, preferences.language, {
        code,
      })
    }
    return localizedDepartmentName(messages, preferences.language, row)
  }

  function interpretStart() {
    setStartError(null)
    setStartSuggestions([])
    const match = matchLandmarkText(startText, SELECTABLE_START_LANDMARKS)
    if (match.status === "exact") {
      setStartId(match.candidate.code)
      setStartSuggestions([])
      return
    }
    if (match.status === "suggestions") {
      setStartSuggestions(match.candidates)
      setStartError(messages.findStartConfirmNeeded)
      return
    }
    setStartError(messages.findStartUnrecognized)
  }

  function interpretDestination() {
    setDestinationError(null)
    setDestinationSuggestions([])
    const codes = departments.map((item) => item.code)
    const match = matchDepartmentText(destinationText, codes)
    if (match.status === "exact") {
      setDestinationCode(match.candidate.code)
      setDestinationSuggestions([])
      return
    }
    if (match.status === "suggestions") {
      setDestinationSuggestions(match.candidates)
      setDestinationError(messages.findDestinationConfirmNeeded)
      return
    }
    setDestinationError(messages.findDestinationUnrecognized)
  }

  function continueFromStart() {
    if (!startId || !hospitalGraph.nodes[startId]) {
      setStartError(messages.findStartRequired)
      return
    }
    setStartError(null)
    setStep("destination")
  }

  function continueFromDestination() {
    if (!destinationCode || !departmentDestinationId(destinationCode)) {
      setDestinationError(messages.findDestinationRequired)
      return
    }
    setDestinationError(null)
    setStep("route")
    const destNode = departmentDestinationId(destinationCode)
    const destFloor = destNode ? hospitalGraph.nodes[destNode]?.floor : undefined
    const startFloor = hospitalGraph.nodes[startId]?.floor
    if (startFloor !== undefined && destFloor !== undefined && startFloor !== destFloor) {
      setFloorView("all")
    } else if (startFloor !== undefined) {
      setFloorView(startFloor)
    }
  }

  function requestGeoHint() {
    setGeoNote(null)
    if (!navigator.geolocation) {
      setGeoNote(messages.findGeoUnavailable)
      return
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        // GPS cannot resolve indoor landmarks; only suggest confirming Entrance.
        setGeoNote(messages.findGeoApproximate)
        setStartSuggestions([
          {
            id: "entrance",
            kind: "landmark",
            code: "entrance",
            score: 40,
            aliasesHit: ["geolocation"],
          },
        ])
      },
      () => setGeoNote(messages.findGeoDenied),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    )
  }

  const starts = startPointOptions()

  return (
    <>
      <PageHeading title={messages.findTitle}>
        <p>{messages.findBody}</p>
      </PageHeading>

      {step === "start" ? (
        <section className="panel" aria-labelledby="find-start-heading">
          <h2 id="find-start-heading">{messages.findStartQuestion}</h2>
          <p>{messages.findStartHint}</p>

          <fieldset className="settings-group">
            <legend>{messages.findStartPickLandmark}</legend>
            <div className="choice-row find-landmark-row">
              {starts.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={startId === id ? "choice is-selected" : "choice"}
                  onClick={() => {
                    setStartId(id)
                    setStartError(null)
                    setStartSuggestions([])
                  }}
                >
                  {labelFor(id)}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="field">
            <span>{messages.findStartDescribe}</span>
            <input
              value={startText}
              onChange={(event) => setStartText(event.target.value)}
              placeholder={messages.findStartPlaceholder}
            />
          </label>
          <div className="choice-row">
            <button
              type="button"
              className="button button-secondary"
              onClick={interpretStart}
            >
              {messages.findSuggestMatches}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={requestGeoHint}
            >
              {messages.findGeoOptional}
            </button>
          </div>
          {geoNote ? <p>{geoNote}</p> : null}
          {startSuggestions.length > 0 ? (
            <div className="stack-gap" role="list">
              <p className="emphasis">{messages.findSuggestedStarts}</p>
              {startSuggestions.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    setStartId(item.code)
                    setStartSuggestions([])
                    setStartError(null)
                  }}
                >
                  {labelFor(item.code)}
                </button>
              ))}
            </div>
          ) : null}
          {startId ? (
            <p className="emphasis">
              {messages.findStartConfirmed}: {labelFor(startId)}
            </p>
          ) : null}
          {startError ? (
            <p className="form-error" role="alert">
              {startError}
            </p>
          ) : null}
          <button type="button" className="button" onClick={continueFromStart}>
            {messages.findContinue}
          </button>
        </section>
      ) : null}

      {step === "destination" ? (
        <section className="panel" aria-labelledby="find-dest-heading">
          <h2 id="find-dest-heading">{messages.findDestinationQuestion}</h2>
          <p>{messages.findDestinationHint}</p>
          <p>
            {messages.findStartConfirmed}: {labelFor(startId)}
          </p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setStep("start")}
          >
            {messages.findChangeStart}
          </button>

          <label className="field">
            <span>{messages.findDestinationLabel}</span>
            <select
              value={destinationCode}
              onChange={(event) => {
                setDestinationCode(event.target.value)
                setDestinationError(null)
                setDestinationSuggestions([])
              }}
              disabled={loadingDepartments || departments.length === 0}
            >
              <option value="">{messages.findDestinationChoose}</option>
              {departments.map((department) => (
                <option key={department.code} value={department.code}>
                  {localizedDepartmentName(
                    messages,
                    preferences.language,
                    department,
                  )}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>{messages.findDestinationDescribe}</span>
            <input
              value={destinationText}
              onChange={(event) => setDestinationText(event.target.value)}
              placeholder={messages.findDestinationPlaceholder}
            />
          </label>
          <button
            type="button"
            className="button button-secondary"
            onClick={interpretDestination}
          >
            {messages.findSuggestMatches}
          </button>
          {destinationSuggestions.length > 0 ? (
            <div className="stack-gap" role="list">
              <p className="emphasis">{messages.findSuggestedDestinations}</p>
              {destinationSuggestions.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    setDestinationCode(item.code)
                    setDestinationSuggestions([])
                    setDestinationError(null)
                  }}
                >
                  {departmentLabel(item.code)}
                </button>
              ))}
            </div>
          ) : null}
          {destinationCode ? (
            <p className="emphasis">
              {messages.findDestinationConfirmed}:{" "}
              {departmentLabel(destinationCode)}
            </p>
          ) : null}
          {destinationError ? (
            <p className="form-error" role="alert">
              {destinationError}
            </p>
          ) : null}
          {loadError ? <p className="form-error">{loadError}</p> : null}

          <fieldset className="settings-group find-mode">
            <legend>{messages.findAssistedLabel}</legend>
            <label className="radio-row">
              <input
                type="radio"
                name="nav-mode"
                checked={mode === "assisted"}
                onChange={() => setMode("assisted")}
              />
              <span>
                <span className="button-label">{messages.findAssistedLabel}</span>
                <span className="button-hint">{messages.findAssistedHint}</span>
              </span>
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="nav-mode"
                checked={mode === "standard"}
                onChange={() => setMode("standard")}
              />
              <span>{messages.findStandardLabel}</span>
            </label>
          </fieldset>

          <button
            type="button"
            className="button"
            onClick={continueFromDestination}
          >
            {messages.findShowRoute}
          </button>
        </section>
      ) : null}

      {step === "route" ? (
        <>
          <section className="panel" aria-labelledby="find-route-summary">
            <h2 id="find-route-summary">{messages.findRouteTitle}</h2>
            <p className="privacy-note">{messages.findMapDemoNote}</p>
            <p>
              {messages.findStartConfirmed}: {labelFor(startId)}
            </p>
            <p>
              {messages.findDestinationConfirmed}:{" "}
              {departmentLabel(destinationCode)}
            </p>
            <p>
              {mode === "assisted"
                ? messages.findAssistedLabel
                : messages.findStandardLabel}
            </p>
            <div className="choice-row">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setStep("start")}
              >
                {messages.findChangeStart}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setStep("destination")}
              >
                {messages.findChangeDestination}
              </button>
            </div>
          </section>

          <section className="panel" aria-labelledby="find-map-heading">
            <h2 id="find-map-heading">{messages.findMapTitle}</h2>
            <div className="hospital-map-frame">
              <HospitalMap
                graph={hospitalGraph}
                route={route}
                messages={messages}
                labelFor={labelFor}
                startId={startId}
                destinationId={destinationNodeId}
                floorView={floorView}
                onFloorViewChange={setFloorView}
              />
            </div>
            <p className="hospital-map-legend">
              E {messages.navEntrance} · R {messages.navReception} · H{" "}
              {messages.navHelpDesk} · W {messages.navWaterStation} · L{" "}
              {messages.navLift} · A {messages.navRamp} · S {messages.navStairs}
            </p>
            <p className="visually-hidden">
              {messages.findPathSignature}: {pathSignature}
            </p>
          </section>

          <section
            className="panel"
            aria-labelledby="find-route-heading"
            aria-live="polite"
          >
            <h2 id="find-route-heading">{messages.findDirectionsHeading}</h2>
            {!route ? (
              <p>{messages.findUnknownDestination}</p>
            ) : route.status === "same_place" ? (
              <p className="emphasis">{messages.findSamePlace}</p>
            ) : route.status === "no_route" ? (
              <>
                <p className="form-error">
                  {route.reason === "no_step_free"
                    ? messages.findNoStepFree
                    : destinationNodeId
                      ? messages.findNoRoute
                      : messages.findUnknownDestination}
                </p>
                <p className="emphasis">{messages.findGoHelpDesk}</p>
                {route.reason === "no_step_free" && mode === "assisted" ? (
                  <button
                    type="button"
                    className="button"
                    onClick={() => setMode("standard")}
                  >
                    {messages.findTryStandardRoute}
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <p className="emphasis">
                  {naturalDurationLabel(messages, route.totalSeconds)}
                </p>
                <ol className="find-directions">
                  {directions.map((text, index) => (
                    <li key={`${pathSignature}-${index}`}>{text}</li>
                  ))}
                </ol>
              </>
            )}
          </section>
        </>
      ) : null}
    </>
  )
}
