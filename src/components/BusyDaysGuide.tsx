import { useMemo, useState } from "react"
import {
  departmentName,
  loadForecastBundle,
  simpleWeekSummary,
} from "../domain/forecasting/loadForecast.ts"
import type { MessageCatalog } from "../i18n/types.ts"
import { useMessages } from "../preferences/usePreferences.ts"

const WEEKDAY_KEYS = [
  "weekdayMonday",
  "weekdayTuesday",
  "weekdayWednesday",
  "weekdayThursday",
  "weekdayFriday",
  "weekdaySaturday",
  "weekdaySunday",
] as const

function weekdayLabel(messages: MessageCatalog, dow: number): string {
  const key = WEEKDAY_KEYS[dow]
  return key ? messages[key] : String(dow)
}

type BusyDaysGuideProps = {
  /** When true, show staff-oriented method copy; visitors get visit-planning copy. */
  audience?: "visitor" | "staff"
  /** Controlled department filter; omit to manage filter internally. */
  department?: string
  onDepartmentChange?: (code: string) => void
  showDepartmentFilter?: boolean
}

/**
 * Simple weekday averages from synthetic demonstration data.
 * Safe for public visitors — no patient records, no staff evaluation metrics.
 */
export function BusyDaysGuide({
  audience = "visitor",
  department: controlledDepartment,
  onDepartmentChange,
  showDepartmentFilter = true,
}: BusyDaysGuideProps) {
  const messages = useMessages()
  const loaded = loadForecastBundle()
  const [internalDepartment, setInternalDepartment] = useState("all")
  const department = controlledDepartment ?? internalDepartment

  function setDepartment(code: string) {
    if (onDepartmentChange) {
      onDepartmentChange(code)
    } else {
      setInternalDepartment(code)
    }
  }

  const weekGuide = useMemo(() => {
    if (!loaded.ok) {
      return null
    }
    return simpleWeekSummary(loaded.bundle, department)
  }, [loaded, department])

  const daySeries = useMemo(() => {
    if (!weekGuide) {
      return []
    }
    const max = Math.max(
      1,
      ...weekGuide.days.map((row) => row.avg_daily_arrivals),
    )
    return weekGuide.days.map((row) => {
      let tone: "model" | "busy" | "quiet" = "model"
      if (row.dow === weekGuide.busiest.dow) {
        tone = "busy"
      } else if (row.dow === weekGuide.least_busy.dow) {
        tone = "quiet"
      }
      return {
        label: weekdayLabel(messages, row.dow),
        value: Math.round(row.avg_daily_arrivals),
        tone,
        widthPct: Math.min(100, (row.avg_daily_arrivals / max) * 100),
      }
    })
  }, [weekGuide, messages])

  if (!loaded.ok) {
    return (
      <p className="form-error" role="alert">
        {loaded.reason === "missing"
          ? messages.forecastMissingArtifact
          : messages.forecastCorruptArtifact}
      </p>
    )
  }

  if (!weekGuide) {
    return (
      <p className="form-error" role="status">
        {messages.forecastCorruptArtifact}
      </p>
    )
  }

  const { metadata, simple_week_guide: guide } = loaded.bundle
  const title =
    audience === "visitor" ? messages.visitDaysTitle : messages.forecastSimpleTitle
  const hint =
    audience === "visitor" ? messages.visitDaysHint : messages.forecastSimpleHint

  return (
    <section
      className="panel forecast-panel forecast-simple"
      aria-labelledby="busy-days-heading"
    >
      <h2 id="busy-days-heading">{title}</h2>
      <p>{hint}</p>
      <p className="forecast-banner" role="status">
        {messages.forecastSyntheticBanner}
      </p>

      {showDepartmentFilter ? (
        <label className="field">
          <span>{messages.forecastDepartmentFilter}</span>
          <select
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <option value="all">{messages.forecastAllDepartments}</option>
            {metadata.departments.map((dept) => (
              <option key={dept.code} value={dept.code}>
                {dept.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {department !== "all" ? (
        <p className="privacy-note">
          {messages.visitDaysDepartmentNote.replace(
            "{department}",
            departmentName(loaded.bundle, department),
          )}
        </p>
      ) : null}

      <div className="forecast-day-highlights" role="list">
        <article className="forecast-day-card is-busy" role="listitem">
          <p className="forecast-day-card-label">{messages.forecastBusiestDay}</p>
          <p className="forecast-day-card-name">
            {weekdayLabel(messages, weekGuide.busiest.dow)}
          </p>
          <p className="forecast-day-card-meta">
            {messages.forecastAvgPerDay.replace(
              "{count}",
              String(Math.round(weekGuide.busiest.avg_daily_arrivals)),
            )}
          </p>
        </article>
        <article className="forecast-day-card is-quiet" role="listitem">
          <p className="forecast-day-card-label">{messages.forecastLeastBusyDay}</p>
          <p className="forecast-day-card-name">
            {weekdayLabel(messages, weekGuide.least_busy.dow)}
          </p>
          <p className="forecast-day-card-meta">
            {messages.forecastAvgPerDay.replace(
              "{count}",
              String(Math.round(weekGuide.least_busy.avg_daily_arrivals)),
            )}
          </p>
        </article>
      </div>

      <figure
        className="forecast-chart"
        aria-label={messages.forecastDayRankTitle}
      >
        <figcaption>{messages.forecastDayRankTitle}</figcaption>
        <ul className="forecast-bars">
          {daySeries.map((item) => (
            <li key={item.label}>
              <span className="forecast-bar-label">{item.label}</span>
              <span className="forecast-bar-track">
                <span
                  className={`forecast-bar-fill tone-${item.tone}`}
                  style={{ width: `${item.widthPct}%` }}
                />
              </span>
              <span className="forecast-bar-value">{item.value}</span>
            </li>
          ))}
        </ul>
      </figure>

      <p className="privacy-note">
        {messages.forecastSimpleMethod.replace(
          "{days}",
          String(guide.history_days),
        )}
      </p>
      {audience === "visitor" ? (
        <p className="privacy-note">{messages.visitDaysNotAdvice}</p>
      ) : null}
    </section>
  )
}
