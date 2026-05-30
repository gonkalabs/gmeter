import { useMemo, useState } from "react";
import type { Broker, ProbeRun } from "../types";
import { PROBE_INTERVAL_MINUTES } from "../metrics";
import { collectTrendModels, modelLabel } from "../trendMetrics";
import { MetricsCharts } from "./MetricsCharts";
import { useI18n } from "../i18n";

interface Props {
  runs: ProbeRun[];
  brokers: Broker[];
  loading: boolean;
}

type ModelFilter = { kind: "all" } | { kind: "model"; id: string };

export function TrendsPage({ runs, brokers, loading }: Props) {
  const { t } = useI18n();
  const models = useMemo(() => collectTrendModels(brokers, runs), [brokers, runs]);
  const [filter, setFilter] = useState<ModelFilter>({ kind: "all" });

  const chartModel = filter.kind === "all" ? null : filter.id;

  const quickRuns = runs.filter(
    (r) =>
      (!r.run_type || r.run_type === "quick") &&
      r.status === "completed" &&
      r.summary &&
      r.finished_at
  );
  const limitsCount = runs.filter(
    (r) => r.run_type === "limits" && r.status === "completed"
  ).length;

  if (loading && quickRuns.length === 0) {
    return <div className="skeleton-panel" />;
  }

  if (quickRuns.length === 0) {
    return (
      <div className="empty-state compact">
        <h2>{t("trends.emptyTitle")}</h2>
        <p>
          {t("trends.emptyHint", { interval: PROBE_INTERVAL_MINUTES })}
          {limitsCount > 0 &&
            t("trends.limitsExcludedEmpty", {
              count: limitsCount,
              runs: limitsCount === 1 ? t("common.run") : t("common.runs"),
            })}
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <section className="page-section">
        <header className="section-header trends-header">
          <div>
            <h2>{t("trends.title")}</h2>
            <p>
              {chartModel
                  ? t("trends.modelHint", {
                    model: modelLabel(chartModel, brokers),
                    interval: PROBE_INTERVAL_MINUTES,
                  })
                : t("trends.aggregateHint", { interval: PROBE_INTERVAL_MINUTES })}
              {" · "}
              {quickRuns.length}{" "}
              {quickRuns.length === 1 ? t("common.dataPoint") : t("common.dataPoints")}
              {limitsCount > 0 &&
                ` · ${t("trends.excluded", {
                  count: limitsCount,
                  runs: limitsCount === 1 ? t("common.run") : t("common.runs"),
                })}`}
            </p>
          </div>
        </header>

        {models.length > 0 && (
          <div className="trends-model-filter">
            <span className="filter-label">{t("trends.model")}</span>
            <div className="pill-group" role="tablist" aria-label={t("trends.model")}>
              <button
                type="button"
                role="tab"
                className={`pill ${filter.kind === "all" ? "active" : ""}`}
                onClick={() => setFilter({ kind: "all" })}
              >
                {t("trends.allModels")}
              </button>
              {models.map((modelId) => (
                <button
                  type="button"
                  role="tab"
                  key={modelId}
                  className={`pill ${filter.kind === "model" && filter.id === modelId ? "active" : ""}`}
                  onClick={() => setFilter({ kind: "model", id: modelId })}
                  title={modelId}
                >
                  {modelLabel(modelId, brokers)}
                </button>
              ))}
            </div>
          </div>
        )}

        <MetricsCharts runs={quickRuns} brokers={brokers} selectedModel={chartModel} />
      </section>
    </div>
  );
}
