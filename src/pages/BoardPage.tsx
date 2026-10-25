import { useEffect, useState } from "react"
import { Link } from "react-router"
import { AppBrand } from "../components/AppBrand.tsx"
import { PageHeading } from "../components/PageHeading.tsx"
import { localizedDepartmentName } from "../domain/departmentLabels.ts"
import { formatAboutWaitMinutes } from "../domain/queue.ts"
import {
  getSupabaseClient,
  readSupabaseState,
} from "../lib/supabase/client.ts"
import type { BoardSnapshotRow } from "../lib/supabase/database.types.ts"
import { ensureDemoQueueOnce } from "../lib/supabase/ensureDemo.ts"
import { supabaseErrorMessage } from "../lib/supabase/errors.ts"
import { fetchBoardSnapshot } from "../lib/supabase/queueApi.ts"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"

const POLL_MS = 5000

export function BoardPage() {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const supabaseState = readSupabaseState(import.meta.env)
  const client = getSupabaseClient()
  const backendReady = supabaseState.status === "ready" && client !== null
  const [rows, setRows] = useState<BoardSnapshotRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(backendReady)

  useEffect(() => {
    if (!backendReady || !client) {
      return
    }
    const supabase = client

    let cancelled = false

    async function load() {
      await ensureDemoQueueOnce()
      const { data, error: loadError } = await fetchBoardSnapshot(supabase)
      if (cancelled) {
        return
      }
      if (loadError) {
        setError(supabaseErrorMessage(loadError, messages.boardLoadError))
        setStale(true)
        setLoading(false)
        return
      }
      setRows((data as BoardSnapshotRow[]) ?? [])
      setError(null)
      setStale(false)
      setUpdatedAt(new Date().toISOString())
      setLoading(false)
    }

    void load()
    const timer = window.setInterval(() => {
      void load()
    }, POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [backendReady, client, messages.boardLoadError])

  return (
    <div className="app-shell board-shell">
      <a className="skip-link" href="#main">
        {messages.skipToContent}
      </a>
      <header className="topbar">
        <AppBrand subtitle={messages.hospitalName} />
        <div className="topbar-actions">
          <Link className="choice" to="/">
            {messages.home}
          </Link>
        </div>
      </header>
      <main id="main" className="main board-main">
        <PageHeading title={messages.boardTitle}>
          <p>{messages.boardPrivacy}</p>
          {supabaseState.status === "unconfigured" ? (
            <p className="form-error" role="status">
              {messages.backendUnconfigured}
            </p>
          ) : null}
          {supabaseState.status === "refused" ? (
            <p className="form-error" role="alert">
              {messages.backendRefusedKey}
            </p>
          ) : null}
          {backendReady && loading ? (
            <p role="status">{messages.boardLoading}</p>
          ) : null}
          {stale ? (
            <p className="form-error" role="status">
              {messages.boardStaleBanner}
            </p>
          ) : null}
          {error && !stale ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {updatedAt ? (
            <p role="status">
              {messages.boardUpdated}: {new Date(updatedAt).toLocaleTimeString()}
            </p>
          ) : null}
        </PageHeading>

        {backendReady && !loading && rows.length === 0 ? (
          <p>{messages.boardEmpty}</p>
        ) : null}

        <div className="board-grid">
          {rows.map((row) => {
            const name = localizedDepartmentName(
              messages,
              preferences.language,
              {
                code: row.department_code,
                name_en: row.department_name_en,
                name_hi: row.department_name_hi,
              },
            )
            const room =
              preferences.language === "hi"
                ? row.room_hi || row.room_en
                : row.room_en || row.room_hi
            const floor =
              preferences.language === "hi"
                ? row.floor_hi || row.floor_en
                : row.floor_en || row.floor_hi
            const waiting = row.next_waiting_tokens ?? []
            return (
              <section
                key={row.department_code}
                className="panel board-card"
                aria-label={name}
              >
                <h2>{name}</h2>
                <p>
                  {room} · {floor}
                </p>
                <p className="board-token">
                  {row.called_token ?? messages.notAvailable}
                </p>
                <p>
                  {messages.boardNext}:{" "}
                  {waiting.length > 0 ? waiting.join(", ") : messages.notAvailable}
                </p>
                <p>
                  {messages.waitLabel}:{" "}
                  {row.estimated_wait_minutes == null
                    ? messages.notAvailable
                    : formatAboutWaitMinutes(
                        row.estimated_wait_minutes,
                        messages.waitAboutTemplate,
                      )}
                </p>
                <p>
                  {doctorNotice(row.availability, row.delay_minutes, messages)}
                </p>
                {row.clock_scale === 10 ? (
                  <p>{messages.boardClock10x}</p>
                ) : null}
              </section>
            )
          })}
        </div>
      </main>
    </div>
  )
}

function doctorNotice(
  availability: string,
  delayMinutes: number,
  messages: ReturnType<typeof useMessages>,
): string {
  if (availability === "on_break") {
    return messages.doctorBreak
  }
  if (availability === "running_late") {
    return `${messages.doctorLate}: ${delayMinutes} ${messages.minutesUnit}`
  }
  return messages.doctorAvailable
}
