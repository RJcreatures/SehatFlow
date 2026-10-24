import { useMemo, useState } from "react"
import { BusyDaysGuide } from "../components/BusyDaysGuide.tsx"
import {
  aggregateHorizonByHour,
  departmentName,
  filterHeldout,
  filterHorizon,
  loadForecastBundle,
} from "../domain/forecasting/loadForecast.ts"
import { PageHeading } from "../components/PageHeading.tsx"
import { useMessages } from "../preferences/usePreferences.ts"

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`
}

function BarChart(props: {
  title: string
  series: Array<{ label: string; value: number; tone?: "model" | "baseline" | "actual" }>
  max?: number
}) {
  const max =
    props.max ??
    Math.max(1, ...props.series.map((item) => item.value), 1)
  return (
    <figure className="forecast-chart" aria-label={props.title}>
      <figcaption>{props.title}</figcaption>
      <ul className="forecast-bars">
        {props.series.map((item) => (
          <li key={`${item.label}-${item.tone ?? "v"}`}>
            <span className="forecast-bar-label">{item.label}</span>
            <span className="forecast-bar-track">
              <span
                className={`forecast-bar-fill tone-${item.tone ?? "model"}`}
                style={{ width: `${Math.min(100, (item.value / max) * 100)}%` }}
              />
            </span>
            <span className="forecast-bar-value">{item.value}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

export function ForecastDashboard() {
  const messages = useMessages()
  const loaded = loadForecastBundle()
  const [department, setDepartment] = useState<string>("all")

  const bundle = loaded.ok ? loaded.bundle : null

  const horizonByDept = useMemo(() => {
    if (!bundle) {
      return []
    }
    const totals = new Map<string, number>()
    for (const row of filterHorizon(bundle, "all")) {
      totals.set(
        row.department_code,
        (totals.get(row.department_code) ?? 0) + row.model_forecast,
      )
    }
    return [...totals.entries()]
      .map(([code, value]) => ({
        label: departmentName(bundle, code),
        value,
        tone: "model" as const,
      }))
      .sort((a, b) => b.value - a.value)
  }, [bundle])

  const hourSeries = useMemo(() => {
    if (!bundle) {
      return []
    }
    return aggregateHorizonByHour(bundle, department).map((row) => ({
      label: formatHour(row.hour),
      value: row.model,
      tone: "model" as const,
    }))
  }, [bundle, department])

  const heldoutSeries = useMemo(() => {
    if (!bundle) {
      return { actual: [], model: [], baseline: [] }
    }
    const rows = filterHeldout(bundle, department, 48)
    return {
      actual: rows.map((row, index) => ({
        label: String(index + 1),
        value: row.arrivals,
        tone: "actual" as const,
      })),
      model: rows.map((row, index) => ({
        label: String(index + 1),
        value: row.model_prediction,
        tone: "model" as const,
      })),
      baseline: rows.map((row, index) => ({
        label: String(index + 1),
        value: row.baseline_prediction,
        tone: "baseline" as const,
      })),
      rows,
    }
  }, [bundle, department])

  if (!loaded.ok) {
    return (
      <PageHeading title={messages.forecastTitle}>
        <p className="form-error" role="alert">
          {loaded.reason === "missing"
            ? messages.forecastMissingArtifact
            : messages.forecastCorruptArtifact}
        </p>
        <p>{messages.forecastBody}</p>
      </PageHeading>
    )
  }

  const { metadata, evaluation, peaks } = bundle!
  const improvementPct =
    evaluation.baseline.mae > 0
      ? (evaluation.mae_improvement_vs_baseline / evaluation.baseline.mae) * 100
      : 0

  return (
    <>
      <PageHeading title={messages.forecastTitle}>
        <p className="forecast-banner" role="status">
          {messages.forecastSyntheticBanner}
        </p>
        <p>
          {messages.forecastSyntheticPeriod
            .replace("{start}", metadata.history_start)
            .replace("{end}", metadata.history_end)
            .replace("{horizon}", String(metadata.horizon_hours))}
        </p>
        <p className="privacy-note">{messages.forecastDemoPurpose}</p>
      </PageHeading>

      <BusyDaysGuide
        audience="staff"
        department={department}
        onDepartmentChange={setDepartment}
      />

      <section className="panel forecast-panel" aria-labelledby="forecast-overview">
        <h2 id="forecast-overview">{messages.forecastOverviewTitle}</h2>

        <p>
          {messages.forecastPeakLabel
            .replace(
              "{department}",
              departmentName(bundle!, peaks.overall.department_code),
            )
            .replace("{hour}", formatHour(peaks.overall.hour))
            .replace("{count}", String(peaks.overall.model_forecast))}
        </p>

        <BarChart
          title={messages.forecastByDepartment}
          series={horizonByDept}
        />
        <BarChart
          title={messages.forecastNextHours}
          series={hourSeries}
        />

        <div className="forecast-table-wrap">
          <table className="forecast-table">
            <caption>{messages.forecastSlotDetails}</caption>
            <thead>
              <tr>
                <th scope="col">{messages.forecastHour}</th>
                <th scope="col">{messages.forecastDepartment}</th>
                <th scope="col">{messages.forecastModel}</th>
                <th scope="col">{messages.forecastBaseline}</th>
              </tr>
            </thead>
            <tbody>
              {filterHorizon(bundle!, department)
                .slice(0, 48)
                .map((row) => (
                  <tr key={`${row.timestamp_utc}-${row.department_code}`}>
                    <td>{formatHour(row.hour)}</td>
                    <td>{departmentName(bundle!, row.department_code)}</td>
                    <td>{row.model_forecast}</td>
                    <td>{row.baseline_forecast}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel forecast-panel" aria-labelledby="forecast-eval">
        <h2 id="forecast-eval">{messages.forecastEvalTitle}</h2>
        <p>{messages.forecastLowerBetter}</p>
        <p>
          {messages.forecastEvalPeriod
            .replace("{start}", evaluation.holdout_start_utc.slice(0, 10))
            .replace("{end}", evaluation.holdout_end_utc.slice(0, 10))
            .replace("{n}", String(evaluation.test_rows))}
        </p>
        <dl className="facts forecast-metrics">
          <div>
            <dt>{messages.forecastModelMae}</dt>
            <dd>{evaluation.model.mae.toFixed(3)}</dd>
          </div>
          <div>
            <dt>{messages.forecastBaselineMae}</dt>
            <dd>{evaluation.baseline.mae.toFixed(3)}</dd>
          </div>
          <div>
            <dt>{messages.forecastModelRmse}</dt>
            <dd>{evaluation.model.rmse.toFixed(3)}</dd>
          </div>
          <div>
            <dt>{messages.forecastBaselineRmse}</dt>
            <dd>{evaluation.baseline.rmse.toFixed(3)}</dd>
          </div>
        </dl>
        <p>
          {evaluation.model_beats_baseline_on_mae
            ? messages.forecastModelBetter.replace(
                "{pct}",
                improvementPct.toFixed(1),
              )
            : messages.forecastBaselineBetter.replace(
                "{pct}",
                Math.abs(improvementPct).toFixed(1),
              )}
        </p>
        <div className="forecast-table-wrap">
          <table className="forecast-table">
            <caption>{messages.forecastPerDepartment}</caption>
            <thead>
              <tr>
                <th scope="col">{messages.forecastDepartment}</th>
                <th scope="col">{messages.forecastModelMae}</th>
                <th scope="col">{messages.forecastBaselineMae}</th>
                <th scope="col">n</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(evaluation.per_department).map(([code, row]) => (
                <tr key={code}>
                  <td>{departmentName(bundle!, code)}</td>
                  <td>{row.model.mae.toFixed(3)}</td>
                  <td>{row.baseline.mae.toFixed(3)}</td>
                  <td>{row.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel forecast-panel" aria-labelledby="forecast-heldout">
        <h2 id="forecast-heldout">{messages.forecastHeldoutTitle}</h2>
        <p>{messages.forecastHeldoutHint}</p>
        <div className="forecast-legend" aria-hidden="true">
          <span className="tone-swatch tone-actual" /> {messages.forecastActual}
          <span className="tone-swatch tone-model" /> {messages.forecastModel}
          <span className="tone-swatch tone-baseline" /> {messages.forecastBaseline}
        </div>
        <BarChart
          title={messages.forecastActual}
          series={heldoutSeries.actual.slice(-24)}
        />
        <BarChart
          title={messages.forecastModel}
          series={heldoutSeries.model.slice(-24)}
        />
        <BarChart
          title={messages.forecastBaseline}
          series={heldoutSeries.baseline.slice(-24)}
        />
      </section>

      <section className="panel forecast-panel" aria-labelledby="forecast-limits">
        <h2 id="forecast-limits">{messages.forecastLimitsTitle}</h2>
        <ul className="forecast-limits">
          <li>{messages.forecastLimitSynthetic}</li>
          <li>{messages.forecastLimitPatterns}</li>
          <li>{messages.forecastLimitRealData}</li>
          <li>{messages.forecastLimitNoClinical}</li>
        </ul>
        <p className="privacy-note">{messages.forecastSeedNote.replace("{seed}", String(metadata.seed))}</p>
      </section>
    </>
  )
}
