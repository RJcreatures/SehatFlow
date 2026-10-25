import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { QrScanner } from "../components/QrScanner.tsx"
import {
  breakRemainingMinutes,
  simulatedNow,
  type DemoClockState,
} from "../domain/clock.ts"
import {
  countPeopleAhead,
  estimateWaitMinutes,
  formatAboutWaitMinutes,
  meanConsultationMinutes,
} from "../domain/queue.ts"
import { localizeQueueStatus } from "../domain/agent/spoken.ts"
import { localizedDepartmentName } from "../domain/departmentLabels.ts"
import { captureQrTokenFromSearch } from "../domain/qrLookup.ts"
import { staffCan } from "../domain/roles.ts"
import { supabaseErrorMessage } from "../lib/supabase/errors.ts"
import type {
  DoctorAvailability,
  QueueStatus,
  StaffRole,
} from "../lib/supabase/database.types.ts"
import { getMyTurn } from "../lib/supabase/patientApi.ts"
import {
  acknowledgeUrgent,
  callNext,
  completeToken,
  markNoShow,
  reassignToken,
  resetDemo,
  sendToEnd,
  setDemoClock,
  setDoctorStatus,
  type AppSupabase,
  type DemoClockPayload,
} from "../lib/supabase/queueApi.ts"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"
import { useStaffAuth } from "./useStaffAuth.ts"

type Department = {
  id: string
  code: string
  name_en: string
  name_hi: string
  room_en: string
  room_hi: string
  floor_en: string
  floor_hi: string
  estimated_minutes: number
  display_order: number
}

type QueueEntry = {
  id: string
  department_id: string
  token_number: number
  token_code: string
  service_date: string
  status: QueueStatus
  queued_at: string
  called_at: string | null
  completed_at: string | null
  patient_id: string
}

type Patient = {
  id: string
  display_name: string
  age: number
}

type DoctorRow = {
  department_id: string
  availability: DoctorAvailability
  delay_minutes: number
  break_ends_at: string | null
}

type UrgentFlag = {
  id: string
  department_id: string | null
  queue_entry_id: string | null
  status: string
  created_at: string
}

function toClock(payload: DemoClockPayload): DemoClockState {
  return {
    scale: payload.scale === 10 ? 10 : 1,
    realAnchor: new Date(payload.real_anchor),
    simAnchor: new Date(payload.sim_anchor),
  }
}

export function StaffDashboard() {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const { client, profile } = useStaffAuth()
  const role = profile!.role
  const location = useLocation()
  const navigate = useNavigate()
  const qrHandled = useRef(false)
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [entries, setEntries] = useState<QueueEntry[]>([])
  const [patients, setPatients] = useState<Record<string, Patient>>({})
  const [doctors, setDoctors] = useState<Record<string, DoctorRow>>({})
  const [flags, setFlags] = useState<UrgentFlag[]>([])
  const [clock, setClock] = useState<DemoClockState | null>(null)
  const [serviceDate, setServiceDate] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reassignTarget, setReassignTarget] = useState<string>("")
  const [delayMinutes, setDelayMinutes] = useState(10)
  const [breakMinutes, setBreakMinutes] = useState(15)
  const [stale, setStale] = useState(false)
  const [wallNow, setWallNow] = useState(() => new Date())
  const [scannerOpen, setScannerOpen] = useState(false)
  const [highlightedToken, setHighlightedToken] = useState<string | null>(null)

  const selected = departments.find((department) => department.id === selectedId)

  const identifyFromQr = useCallback(
    async (qrToken: string, deptList: Department[]) => {
      if (!client) {
        return
      }
      setError(null)
      const { data, error: lookupError } = await getMyTurn(client, {
        qr_token: qrToken,
      })
      if (
        lookupError ||
        !data ||
        (typeof data === "object" && data !== null && "error" in data)
      ) {
        setError(messages.staffQrInvalid)
        setHighlightedToken(null)
        return
      }
      const match = deptList.find(
        (department) => department.code === data.department_code,
      )
      if (match) {
        setSelectedId(match.id)
      }
      setHighlightedToken(data.token_code)
      setMessage(
        messages.staffQrIdentified.replace("{token}", data.token_code),
      )
    },
    [client, messages.staffQrIdentified, messages.staffQrInvalid],
  )

  const refresh = useCallback(async () => {
    if (!client) {
      return
    }
    setError(null)
    const [
      departmentResult,
      entryResult,
      patientResult,
      doctorResult,
      flagResult,
      clockResult,
    ] = await Promise.all([
      client
        .from("departments")
        .select(
          "id, code, name_en, name_hi, room_en, room_hi, floor_en, floor_hi, estimated_minutes, display_order",
        )
        .eq("active", true)
        .order("display_order"),
      client
        .from("queue_entries")
        .select(
          "id, department_id, token_number, token_code, service_date, status, queued_at, called_at, completed_at, patient_id",
        )
        .order("token_number"),
      client.from("patients").select("id, display_name, age"),
      client
        .from("doctor_status")
        .select("department_id, availability, delay_minutes, break_ends_at"),
      client
        .from("urgent_flags")
        .select("id, department_id, queue_entry_id, status, created_at")
        .eq("status", "open")
        .order("created_at", { ascending: true }),
      client.rpc("get_demo_clock"),
    ])

    if (departmentResult.error) {
      throw departmentResult.error
    }
    if (entryResult.error) {
      throw entryResult.error
    }
    if (patientResult.error) {
      throw patientResult.error
    }
    if (doctorResult.error) {
      throw doctorResult.error
    }
    if (flagResult.error) {
      throw flagResult.error
    }
    if (clockResult.error) {
      throw clockResult.error
    }

    const nextDepartments = departmentResult.data ?? []
    setDepartments(nextDepartments)
    setSelectedId((current) => current || nextDepartments[0]?.id || "")
    setEntries((entryResult.data ?? []) as QueueEntry[])
    setPatients(
      Object.fromEntries(
        (patientResult.data ?? []).map((patient) => [patient.id, patient]),
      ),
    )
    setDoctors(
      Object.fromEntries(
        ((doctorResult.data ?? []) as DoctorRow[]).map((row) => [
          row.department_id,
          row,
        ]),
      ),
    )
    setFlags((flagResult.data ?? []) as UrgentFlag[])
    const clockPayload = clockResult.data as DemoClockPayload
    setClock(toClock(clockPayload))
    setServiceDate(clockPayload.service_date)
    setWallNow(new Date())
    setStale(false)
  }, [client])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await refresh()
      } catch (refreshError) {
        if (!cancelled) {
          setError(
            supabaseErrorMessage(refreshError, messages.staffLoadError),
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [messages.staffLoadError, refresh])

  useEffect(() => {
    if (qrHandled.current || loading || departments.length === 0) {
      return
    }
    const { qrToken, cleanedSearch } = captureQrTokenFromSearch(location.search)
    if (!qrToken) {
      return
    }
    qrHandled.current = true
    navigate({ pathname: "/staff", search: cleanedSearch }, { replace: true })
    void identifyFromQr(qrToken, departments)
  }, [
    departments,
    identifyFromQr,
    loading,
    location.search,
    navigate,
  ])

  // Keep simulated "now" fresh so break end times stay ahead of the demo clock.
  useEffect(() => {
    const tickMs = clock?.scale === 10 ? 250 : 1_000
    const timer = window.setInterval(() => {
      setWallNow(new Date())
    }, tickMs)
    return () => window.clearInterval(timer)
  }, [clock?.scale])

  useEffect(() => {
    if (!client) {
      return
    }

    const channel = client
      .channel("staff-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_entries" },
        () => {
          void refresh().catch(() => setStale(true))
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "doctor_status" },
        () => {
          void refresh().catch(() => setStale(true))
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "urgent_flags" },
        () => {
          void refresh().catch(() => setStale(true))
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "demo_clock" },
        () => {
          void refresh().catch(() => setStale(true))
        },
      )
      .subscribe((subscribeStatus) => {
        if (subscribeStatus === "CHANNEL_ERROR" || subscribeStatus === "TIMED_OUT") {
          setStale(true)
        }
      })

    return () => {
      void client.removeChannel(channel)
    }
  }, [client, refresh])

  const now = clock ? simulatedNow(clock, wallNow) : wallNow

  const departmentEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.department_id === selectedId &&
          entry.service_date === serviceDate,
      ),
    [entries, selectedId, serviceDate],
  )

  const called = departmentEntries.find((entry) => entry.status === "called")
  const waiting = departmentEntries.filter((entry) => entry.status === "waiting")
  const recoverable = departmentEntries.filter(
    (entry) => entry.status === "no_show" || entry.status === "skipped",
  )
  const selectedDepartmentLabel = selected
    ? localizedDepartmentName(messages, preferences.language, selected)
    : ""
  const selectedPlaces = selected
    ? preferences.language === "hi"
      ? {
          room: selected.room_hi || selected.room_en,
          floor: selected.floor_hi || selected.floor_en,
        }
      : {
          room: selected.room_en || selected.room_hi,
          floor: selected.floor_en || selected.floor_hi,
        }
    : { room: "", floor: "" }
  const doctor = selectedId ? doctors[selectedId] : undefined
  const completedSamples = departmentEntries
    .filter(
      (entry) =>
        entry.status === "completed" && entry.called_at && entry.completed_at,
    )
    .map((entry) => ({
      calledAt: new Date(entry.called_at!),
      completedAt: new Date(entry.completed_at!),
    }))
  const mean = meanConsultationMinutes(
    completedSamples,
    selected?.estimated_minutes ?? 10,
  )
  const late =
    doctor?.availability === "running_late" ? doctor.delay_minutes : 0
  const breakLeft =
    doctor?.availability === "on_break"
      ? breakRemainingMinutes(
          doctor.break_ends_at ? new Date(doctor.break_ends_at) : null,
          now,
        )
      : 0

  async function runAction(
    label: string,
    action: (
      supabase: AppSupabase,
    ) => Promise<{ data?: unknown; error: { message: string } | null }>,
  ) {
    if (!client || actionBusy) {
      return
    }
    setActionBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { data, error: actionError } = await action(client)
      if (actionError) {
        setError(supabaseErrorMessage(actionError, label))
        return
      }
      const tokenFromResult =
        data &&
        typeof data === "object" &&
        "token_code" in data &&
        typeof (data as { token_code: unknown }).token_code === "string"
          ? (data as { token_code: string }).token_code
          : null
      setMessage(
        tokenFromResult && label === messages.actionReassigned
          ? messages.actionReassignedDetail.replace("{token}", tokenFromResult)
          : label,
      )
      try {
        await refresh()
      } catch (refreshError) {
        setError(supabaseErrorMessage(refreshError, messages.staffLoadError))
        setStale(true)
      }
    } finally {
      setActionBusy(false)
    }
  }

  function fillConfirm(
    template: string,
    token: string,
    departmentName: string,
  ): string {
    return template
      .replace("{token}", token)
      .replace("{department}", departmentName)
  }

  if (loading) {
    return <p role="status">{messages.staffLoading}</p>
  }

  return (
    <div className="staff-dashboard">
      <p className="status-line" role="status">
        {messages.connectedBackend} · {profile!.displayName} · {roleLabel(role, messages)}
        {clock ? ` · ${messages.clockScale}: ${clock.scale}×` : ""}
        {stale ? ` · ${messages.staffStale}` : ""}
      </p>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}

      <section className="panel" aria-label={messages.staffQrScanTitle}>
        <h2>{messages.staffQrScanTitle}</h2>
        <p>{messages.staffQrScanHint}</p>
        {scannerOpen ? (
          <QrScanner
            active={scannerOpen}
            onDetected={(qrToken) => {
              setScannerOpen(false)
              void identifyFromQr(qrToken, departments)
            }}
            onCancel={() => setScannerOpen(false)}
            onUnsupported={() => {
              setScannerOpen(false)
              setError(messages.qrCameraUnsupported)
            }}
          />
        ) : (
          <button
            type="button"
            className="button"
            onClick={() => setScannerOpen(true)}
          >
            {messages.staffQrScanOpen}
          </button>
        )}
        {highlightedToken ? (
          <p className="emphasis" role="status">
            {messages.staffQrIdentified.replace("{token}", highlightedToken)}
          </p>
        ) : null}
      </section>

      <section
        className={
          flags.length > 0
            ? "panel panel-urgent-alert"
            : "panel"
        }
        aria-label={messages.urgentTitle}
        aria-live="polite"
      >
        <h2>{messages.urgentTitle}</h2>
        {flags.length > 0 ? (
          <p className="emphasis" role="status">
            {messages.staffUrgentNeedsAttention.replace(
              "{count}",
              String(flags.length),
            )}
          </p>
        ) : null}
        {flags.length === 0 ? (
          <p>{messages.urgentEmpty}</p>
        ) : (
          <ul className="flag-list">
            {flags.map((flag) => {
              const department = departments.find(
                (item) => item.id === flag.department_id,
              )
              const departmentLabel = department
                ? localizedDepartmentName(
                    messages,
                    preferences.language,
                    department,
                  )
                : messages.helpRequestGeneralDesk
              return (
                <li key={flag.id} className="flag-item is-open">
                  <div>
                    <p className="flag-status">
                      <span className="flag-badge" aria-hidden="true">
                        !
                      </span>
                      {messages.urgentOpen}
                    </p>
                    <p>
                      {messages.departmentLabel}: {departmentLabel}
                    </p>
                    <p className="button-hint" dir="ltr">
                      {flag.created_at}
                    </p>
                    <p className="privacy-note">{messages.urgentNoQueueChange}</p>
                  </div>
                  {staffCan(role, "acknowledge_urgent") ? (
                    <button
                      type="button"
                      className="button"
                      disabled={actionBusy}
                      onClick={() => {
                        if (!window.confirm(messages.confirmAcknowledge)) {
                          return
                        }
                        void runAction(messages.actionAcknowledged, (supabase) =>
                          acknowledgeUrgent(supabase, flag.id),
                        )
                      }}
                    >
                      {messages.acknowledge}
                    </button>
                  ) : (
                    <p className="button-hint">{messages.urgentAckRestricted}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <label className="field">
        <span>{messages.departmentLabel}</span>
        <select
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {localizedDepartmentName(
                messages,
                preferences.language,
                department,
              )}
            </option>
          ))}
        </select>
      </label>

      {selected ? (
        <section className="panel" aria-label={selectedDepartmentLabel}>
          <h2>{selectedDepartmentLabel}</h2>
          <p>
            {selectedPlaces.room} · {selectedPlaces.floor}
          </p>
          <dl className="facts">
            <div>
              <dt>{messages.nowServing}</dt>
              <dd>{called?.token_code ?? messages.notAvailable}</dd>
            </div>
            <div>
              <dt>{messages.waitingCount}</dt>
              <dd>{waiting.length}</dd>
            </div>
            <div>
              <dt>{messages.doctorStatus}</dt>
              <dd>{doctorLabel(doctor?.availability, messages)}</dd>
            </div>
          </dl>

          <h3>{messages.waitingList}</h3>
          {waiting.length === 0 ? (
            <p>{messages.queueEmpty}</p>
          ) : (
            <ul className="waiting-token-grid">
              {waiting.map((entry) => {
                const ahead = countPeopleAhead({
                  ownTokenNumber: entry.token_number,
                  ownStatus: "waiting",
                  peers: departmentEntries.map((peer) => ({
                    tokenNumber: peer.token_number,
                    status: peer.status,
                  })),
                })
                const wait = estimateWaitMinutes({
                  peopleAhead: ahead,
                  meanDurationMinutes: mean,
                  lateMinutes: late,
                  breakRemainingMinutes: breakLeft,
                })
                const patient = patients[entry.patient_id]
                return (
                  <li
                    key={entry.id}
                    className={
                      highlightedToken === entry.token_code
                        ? "waiting-token-card is-highlighted"
                        : "waiting-token-card"
                    }
                  >
                    <p className="waiting-token-code" dir="ltr">
                      {entry.token_code}
                    </p>
                    {patient ? (
                      <p className="waiting-token-meta">
                        {patient.display_name}
                        <span dir="ltr"> · {patient.age}</span>
                      </p>
                    ) : null}
                    <p className="waiting-token-wait">
                      {formatAboutWaitMinutes(wait, messages.waitAboutTemplate)}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="choice-row staff-actions">
            {staffCan(role, "call_next") ? (
              <button
                type="button"
                className="button"
                disabled={actionBusy}
                onClick={() => {
                  const nextToken = waiting[0]?.token_code ?? "?"
                  if (
                    !window.confirm(
                      fillConfirm(
                        messages.confirmCallNextToken,
                        nextToken,
                        selectedDepartmentLabel,
                      ),
                    )
                  ) {
                    return
                  }
                  void runAction(messages.actionCalled, (supabase) =>
                    callNext(supabase, selected.id),
                  )
                }}
              >
                {messages.callNext}
              </button>
            ) : null}
            {staffCan(role, "complete") && called ? (
              <button
                type="button"
                className="button"
                disabled={actionBusy}
                onClick={() => {
                  if (
                    !window.confirm(
                      fillConfirm(
                        messages.confirmCompleteToken,
                        called.token_code,
                        selectedDepartmentLabel,
                      ),
                    )
                  ) {
                    return
                  }
                  void runAction(messages.actionCompleted, (supabase) =>
                    completeToken(supabase, called.id),
                  )
                }}
              >
                {messages.completeToken} ({called.token_code})
              </button>
            ) : null}
            {staffCan(role, "no_show") && called ? (
              <button
                type="button"
                className="button button-secondary"
                disabled={actionBusy}
                onClick={() => {
                  if (
                    !window.confirm(
                      fillConfirm(
                        messages.confirmNoShowToken,
                        called.token_code,
                        selectedDepartmentLabel,
                      ),
                    )
                  ) {
                    return
                  }
                  void runAction(messages.actionNoShow, (supabase) =>
                    markNoShow(supabase, called.id),
                  )
                }}
              >
                {messages.markNoShow} ({called.token_code})
              </button>
            ) : null}
          </div>

          {staffCan(role, "send_to_end") && recoverable.length > 0 ? (
            <div className="stack-gap">
              <h3>{messages.sendToEnd}</h3>
              {recoverable.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="button button-secondary"
                  disabled={actionBusy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        fillConfirm(
                          messages.confirmSendToEndToken,
                          entry.token_code,
                          selectedDepartmentLabel,
                        ),
                      )
                    ) {
                      return
                    }
                    void runAction(messages.actionSentToEnd, (supabase) =>
                      sendToEnd(supabase, entry.id),
                    )
                  }}
                >
                  {entry.token_code} ·{" "}
                  {localizeQueueStatus(entry.status, messages)}
                </button>
              ))}
            </div>
          ) : null}

          {staffCan(role, "reassign") && (called || waiting[0]) ? (
            <div className="stack-gap">
              <h3>{messages.reassign}</h3>
              <label className="field">
                <span>{messages.targetDepartment}</span>
                <select
                  value={reassignTarget}
                  onChange={(event) => setReassignTarget(event.target.value)}
                >
                  <option value="">{messages.chooseDepartment}</option>
                  {departments
                    .filter((department) => department.id !== selected.id)
                    .map((department) => (
                      <option key={department.id} value={department.id}>
                        {localizedDepartmentName(
                          messages,
                          preferences.language,
                          department,
                        )}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                className="button button-secondary"
                disabled={actionBusy || !reassignTarget}
                onClick={() => {
                  const entry = called ?? waiting[0]
                  if (!entry || !reassignTarget) {
                    return
                  }
                  if (
                    !window.confirm(
                      fillConfirm(
                        messages.confirmReassignToken,
                        entry.token_code,
                        selectedDepartmentLabel,
                      ),
                    )
                  ) {
                    return
                  }
                  void runAction(messages.actionReassigned, (supabase) =>
                    reassignToken(supabase, entry.id, reassignTarget),
                  )
                }}
              >
                {messages.reassign}
                {called || waiting[0]
                  ? ` (${(called ?? waiting[0])!.token_code})`
                  : ""}
              </button>
            </div>
          ) : null}

          {staffCan(role, "set_doctor_status") ? (
            <div className="stack-gap">
              <h3>{messages.doctorStatus}</h3>
              <p className="status-line" role="status">
                {doctorLabel(doctor?.availability, messages)}
                {doctor?.availability === "on_break" && breakLeft > 0
                  ? ` · ${breakLeft} ${messages.minutesUnit}`
                  : null}
                {doctor?.availability === "running_late" && late > 0
                  ? ` · ${late} ${messages.minutesUnit}`
                  : null}
              </p>
              <label className="field staff-slider-field">
                <span>
                  {messages.breakMinutes}:{" "}
                  <strong dir="ltr">
                    {breakMinutes} {messages.minutesUnit}
                  </strong>
                </span>
                <input
                  type="range"
                  className="staff-slider"
                  min={1}
                  max={120}
                  step={1}
                  value={breakMinutes}
                  aria-valuemin={1}
                  aria-valuemax={120}
                  aria-valuenow={breakMinutes}
                  onChange={(event) =>
                    setBreakMinutes(Number(event.target.value))
                  }
                />
              </label>
              <label className="field staff-slider-field">
                <span>
                  {messages.delayMinutes}:{" "}
                  <strong dir="ltr">
                    {delayMinutes} {messages.minutesUnit}
                  </strong>
                </span>
                <input
                  type="range"
                  className="staff-slider"
                  min={1}
                  max={240}
                  step={1}
                  value={delayMinutes}
                  aria-valuemin={1}
                  aria-valuemax={240}
                  aria-valuenow={delayMinutes}
                  onChange={(event) =>
                    setDelayMinutes(Number(event.target.value))
                  }
                />
              </label>
              <div className="choice-row">
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={actionBusy}
                  onClick={() =>
                    void runAction(messages.actionDoctorUpdated, (supabase) =>
                      setDoctorStatus(supabase, selected.id, "available"),
                    )
                  }
                >
                  {messages.doctorAvailable}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={actionBusy}
                  onClick={() => {
                    if (breakMinutes < 1) {
                      setError(messages.invalidBreak)
                      return
                    }
                    // Fresh wall/sim time at click — avoids stale page clock
                    // rejecting break ends under 10× demo time.
                    const wall = new Date()
                    const sim = clock ? simulatedNow(clock, wall) : wall
                    const ends = new Date(sim.getTime() + breakMinutes * 60_000)
                    void runAction(messages.actionDoctorUpdated, (supabase) =>
                      setDoctorStatus(
                        supabase,
                        selected.id,
                        "on_break",
                        0,
                        ends.toISOString(),
                      ),
                    )
                  }}
                >
                  {messages.doctorBreak}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={actionBusy}
                  onClick={() => {
                    if (delayMinutes < 1 || delayMinutes > 240) {
                      setError(messages.invalidDelay)
                      return
                    }
                    void runAction(messages.actionDoctorUpdated, (supabase) =>
                      setDoctorStatus(
                        supabase,
                        selected.id,
                        "running_late",
                        delayMinutes,
                      ),
                    )
                  }}
                >
                  {messages.doctorLate}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {staffCan(role, "set_demo_clock") || staffCan(role, "reset_demo") ? (
        <section className="panel" aria-label={messages.demoControls}>
          <h2>{messages.demoControls}</h2>
          {staffCan(role, "set_demo_clock") ? (
            <div className="choice-row">
              <button
                type="button"
                className="button button-secondary"
                disabled={actionBusy}
                onClick={() =>
                  void runAction(messages.actionClockUpdated, (supabase) =>
                    setDemoClock(supabase, 1),
                  )
                }
              >
                {messages.clock1x}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={actionBusy}
                onClick={() =>
                  void runAction(messages.actionClockUpdated, (supabase) =>
                    setDemoClock(supabase, 10),
                  )
                }
              >
                {messages.clock10x}
              </button>
            </div>
          ) : null}
          {staffCan(role, "reset_demo") ? (
            <button
              type="button"
              className="button button-emergency"
              disabled={actionBusy}
              onClick={() => {
                if (!window.confirm(messages.confirmResetDemo)) {
                  return
                }
                void runAction(messages.actionResetDone, (supabase) =>
                  resetDemo(supabase),
                )
              }}
            >
              {messages.resetDemo}
            </button>
          ) : null}
          <p>{messages.resetDemoHint}</p>
        </section>
      ) : null}

      {role === "registrar" ? <p>{messages.registrarReadOnly}</p> : null}
    </div>
  )
}

function roleLabel(
  role: StaffRole,
  messages: ReturnType<typeof useMessages>,
): string {
  switch (role) {
    case "admin":
      return messages.roleAdmin
    case "queue_manager":
      return messages.roleQueueManager
    case "doctor":
      return messages.roleDoctor
    case "registrar":
      return messages.roleRegistrar
  }
}

function doctorLabel(
  availability: DoctorAvailability | undefined,
  messages: ReturnType<typeof useMessages>,
): string {
  switch (availability) {
    case "on_break":
      return messages.doctorBreak
    case "running_late":
      return messages.doctorLate
    case "available":
    default:
      return messages.doctorAvailable
  }
}
