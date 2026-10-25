import { useEffect, useState } from "react"
import { Link } from "react-router"
import { localizedDepartmentName } from "../domain/departmentLabels.ts"
import { ensureDemoQueueOnce } from "../lib/supabase/ensureDemo.ts"
import {
  getSupabaseClient,
  readSupabaseState,
} from "../lib/supabase/client.ts"
import type { BoardSnapshotRow } from "../lib/supabase/database.types.ts"
import { fetchBoardSnapshot } from "../lib/supabase/queueApi.ts"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"

const POLL_MS = 8000

export function LiveQueuesPanel() {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const supabaseState = readSupabaseState(import.meta.env)
  const client = getSupabaseClient()
  const ready = supabaseState.status === "ready" && client !== null
  const [rows, setRows] = useState<BoardSnapshotRow[]>([])
  const [loading, setLoading] = useState(ready)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!ready || !client) {
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
        setError(true)
        setLoading(false)
        return
      }
      setRows((data as BoardSnapshotRow[]) ?? [])
      setError(false)
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
  }, [ready, client])

  if (supabaseState.status === "unconfigured" || supabaseState.status === "refused") {
    return null
  }

  return (
    <section className="live-queues" aria-label={messages.liveQueuesTitle}>
      <div className="live-queues-header">
        <div>
          <h2 className="live-queues-title">{messages.liveQueuesTitle}</h2>
          <p className="live-queues-hint">{messages.liveQueuesHint}</p>
        </div>
        <Link className="choice" to="/board">
          {messages.liveQueuesOpenBoard}
        </Link>
      </div>

      {loading ? <p role="status">{messages.boardLoading}</p> : null}
      {error ? (
        <p className="form-error" role="status">
          {messages.liveQueuesLoadError}
        </p>
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <ul className="live-queues-list">
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
            const waiting = row.next_waiting_tokens ?? []
            return (
              <li key={row.department_code} className="live-queues-row">
                <span className="live-queues-dept">{name}</span>
                <span className="live-queues-status">
                  {row.called_token
                    ? messages.liveQueuesNowServing.replace(
                        "{token}",
                        row.called_token,
                      )
                    : messages.liveQueuesQuiet}
                </span>
                <span className="live-queues-wait">
                  {waiting.length > 0
                    ? messages.liveQueuesWaiting.replace(
                        "{tokens}",
                        waiting.slice(0, 2).join(", "),
                      )
                    : messages.liveQueuesNoWaiting}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
