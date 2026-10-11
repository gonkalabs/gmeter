import { useMemo } from "react";
import type { Broker, ProbeRun } from "../types";
import { PROBE_INTERVAL_MINUTES } from "../metrics";
import { trendPath } from "../routes";
import { collectTrendModels, modelLabel } from "../trendMetrics";
import { MetricsCharts } from "./MetricsCharts";
import { useI18n } from "../i18n";

interface Props {
  runs: ProbeRun[];
  brokers: Broker[];
  loading: boolean;
  model: string | null;
}

export function TrendsPage({ runs, brokers, loading, model }: Props) {
  const { t } = useI18n();
  const models = useMemo(() => collectTrendModels(brokers, runs), [brokers, runs]);
  const chartModel = model;

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
            <div className="pill-group" role="navigation" aria-label={t("trends.model")}>
              <a className={`pill ${chartModel ? "" : "active"}`} href={trendPath()} aria-current={chartModel ? undefined : "page"}>
                {t("trends.allModels")}
              </a>
              {models.map((modelId) => (
                <a
                  key={modelId}
                  className={`pill ${chartModel === modelId ? "active" : ""}`}
                  href={trendPath(modelId)}
                  title={modelId}
                  aria-current={chartModel === modelId ? "page" : undefined}
                >
                  {modelLabel(modelId, brokers)}
                </a>
              ))}
            </div>
          </div>
        )}

        <MetricsCharts runs={quickRuns} brokers={brokers} selectedModel={chartModel} />
      </section>
    </div>
  );
}
