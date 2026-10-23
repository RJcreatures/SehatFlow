import { useEffect, useMemo, useState } from "react"
import { HospitalMap } from "../components/HospitalMap.tsx"
import { PageHeading } from "../components/PageHeading.tsx"
import {
  routeDurationLabel,
  writtenDirectionsForRoute,
} from "../domain/navigation/formatDirections.ts"
import {
  DEFAULT_START_NODE_ID,
  departmentDestinationId,
  hospitalGraph,
  startPointOptions,
} from "../domain/navigation/hospitalGraph.ts"
import { findRoute } from "../domain/navigation/pathfind.ts"
import type { RouteMode } from "../domain/navigation/types.ts"
import type { MessageCatalog } from "../i18n/types.ts"
import {
  getSupabaseClient,
  readSupabaseState,
} from "../lib/supabase/client.ts"
import { supabaseErrorMessage } from "../lib/supabase/errors.ts"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"

type DepartmentOption = {
  code: string
  name_en: string
  name_hi: string
}

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
  const supabaseState = readSupabaseState(import.meta.env)
  const client = getSupabaseClient()

  const [departments, setDepartments] = useState<DepartmentOption[]>(() =>
    fallbackDepartments(messages),
  )
  const [loadingDepartments, setLoadingDepartments] = useState(
    supabaseState.status === "ready",
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [startId, setStartId] = useState(DEFAULT_START_NODE_ID)
  const [destinationCode, setDestinationCode] = useState(
    () => fallbackDepartments(messages)[0]?.code ?? "",
  )
  const [mode, setMode] = useState<RouteMode>("assisted")

  useEffect(() => {
    if (supabaseState.status !== "ready" || !client) {
      return
    }
    const supabase = client
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("code, name_en, name_hi")
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
        setDestinationCode((current) =>
          rows.some((row) => row.code === current)
            ? current
            : (rows[0]?.code ?? current),
        )
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
    if (!destinationCode) {
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
  }, [destinationCode, destinationNodeId, mode, startId])

  const directions = useMemo(() => {
    if (!route) {
      return []
    }
    return writtenDirectionsForRoute(messages, hospitalGraph, route)
  }, [messages, route])

  function labelFor(nodeId: string): string {
    const node = hospitalGraph.nodes[nodeId]
    if (!node) {
      return nodeId
    }
    const key = node.labelKey as keyof MessageCatalog
    const value = messages[key]
    return typeof value === "string" ? value : nodeId
  }

  const starts = startPointOptions()

  return (
    <>
      <PageHeading title={messages.findTitle}>
        <p>{messages.findBody}</p>
        <p className="emphasis">{messages.findMapDemoNote}</p>
      </PageHeading>

      <section className="panel" aria-labelledby="find-controls">
        <h2 id="find-controls" className="visually-hidden">
          {messages.findTitle}
        </h2>

        <label className="field">
          <span>{messages.findStartLabel}</span>
          <select
            value={startId}
            onChange={(event) => setStartId(event.target.value)}
          >
            {starts.map((id) => (
              <option key={id} value={id}>
                {labelFor(id)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{messages.findDestinationLabel}</span>
          <select
            value={destinationCode}
            onChange={(event) => setDestinationCode(event.target.value)}
            disabled={loadingDepartments || departments.length === 0}
          >
            {loadingDepartments ? (
              <option value="">{messages.findLoadingDepartments}</option>
            ) : departments.length === 0 ? (
              <option value="">{messages.registerLoadError}</option>
            ) : (
              departments.map((department) => (
                <option key={department.code} value={department.code}>
                  {preferences.language === "hi"
                    ? department.name_hi
                    : department.name_en}
                </option>
              ))
            )}
          </select>
        </label>

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
      </section>

      <section className="panel find-help" aria-labelledby="find-help-title">
        <h2 id="find-help-title">{messages.findAskHelp}</h2>
        <p className="emphasis">{messages.findGoHelpDesk}</p>
        <p>{messages.helpDesk}</p>
      </section>

      <section className="panel" aria-labelledby="find-map-heading">
        <h2 id="find-map-heading">{messages.findMapTitle}</h2>
        <div className="hospital-map-frame">
          <HospitalMap
            graph={hospitalGraph}
            route={route}
            messages={messages}
            labelFor={labelFor}
          />
        </div>
        <p className="hospital-map-legend">
          E {messages.navEntrance} · R {messages.navReception} · H{" "}
          {messages.navHelpDesk} · L {messages.navLift} · A {messages.navRamp} ·
          S {messages.navStairs}
        </p>
      </section>

      <section className="panel" aria-labelledby="find-route-heading" aria-live="polite">
        <h2 id="find-route-heading">{messages.findRouteTitle}</h2>
        {loadingDepartments ? (
          <p>{messages.findLoadingDepartments}</p>
        ) : !route ? (
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
          </>
        ) : (
          <>
            <p className="emphasis">
              {routeDurationLabel(messages, route.totalSeconds)}
            </p>
            <ol className="find-directions">
              {directions.map((text, index) => (
                <li key={`${index}-${text}`}>{text}</li>
              ))}
            </ol>
          </>
        )}
      </section>
    </>
  )
}
