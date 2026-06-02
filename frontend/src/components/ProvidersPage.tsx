import { useEffect, useState } from "react";
import type { DashboardDetail, MeasurementLog, MetricBlock, ProviderBlock } from "../types";
import { api } from "../api";
import {
  displayMetricValue,
  healthFromMetrics,
  healthLabel,
  metricMeta,
  streamNote,
  type Tone,
  toneForMetric,
} from "../metrics";
import { useI18n, type TranslationKey } from "../i18n";
import { hostFromUrl } from "../brokerLinks";
import { ProbeLogTable } from "./ProbeLogTable";

interface Props {
  detail: DashboardDetail | null;
  loading: boolean;
}

export function ProvidersPage({ detail, loading }: Props) {
  const { t, formatDate } = useI18n();
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const activeProvider = detail?.providers.find((p) => p.broker_id === selectedProvider);

  function selectProvider(id: number) {
    setSelectedProvider((prev) => (prev === id ? null : id));
    setSelectedModel(null);
  }

  function selectModel(modelId: string) {
    setSelectedModel((prev) => (prev === modelId ? null : modelId));
  }

  if (loading && !detail) {
    return <div className="skeleton-panel" />;
  }

  if (!detail || detail.providers.length === 0) {
    return (
      <div className="empty-state compact">
        <h2>{t("providers.emptyTitle")}</h2>
        <p>{t("providers.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <section className="page-section">
        <header className="section-header">
          <h2>{t("providers.title")}</h2>
          <p>{t("providers.hint")}</p>
        </header>

        <div className="explorer">
          <div className="explorer-col">
            <div className="col-title">{t("providers.listTitle", { count: detail.providers.length })}</div>
            <ul className="entity-list">
              {detail.providers.map((provider) => (
                <ProviderListItem
                  key={provider.broker_id}
                  provider={provider}
                  active={selectedProvider === provider.broker_id}
                  onSelect={() => selectProvider(provider.broker_id)}
                  formatDate={formatDate}
                  t={t}
                />
              ))}
            </ul>
          </div>

          <div className="explorer-col">
            <div className="col-title">
              {activeProvider
                ? t("providers.modelsFor", { provider: activeProvider.broker_name })
                : t("providers.models")}
            </div>
            {!activeProvider ? (
              <p className="col-hint">← {t("providers.selectProvider")}</p>
            ) : !activeProvider.latest_run_id ? (
              <p className="col-hint">{t("providers.noMeasurements")}</p>
            ) : (
              <ul className="entity-list">
                {activeProvider.models.map((model) => (
                  <li key={model.model}>
                    <button
                      type="button"
                      className={`entity-item ${selectedModel === model.model ? "active" : ""}`}
                      onClick={() => selectModel(model.model)}
                    >
                      <span className="entity-name">{model.label}</span>
                      <span className={`health-badge tone-${healthFromMetrics(model.metrics)}`}>
                        {healthLabel(healthFromMetrics(model.metrics), t)}
                      </span>
                      <span className="entity-meta">{keyMetrics(model.metrics, "model", t)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="explorer-col explorer-detail">
            <div className="col-title">{t("providers.details")}</div>
            {!activeProvider || !selectedModel ? (
              <p className="col-hint">
                {!activeProvider
                  ? t("providers.selectProviderModel")
                  : `← ${t("providers.selectModel")}`}
              </p>
            ) : (
              <ModelDetail
                key={`${activeProvider.broker_id}:${selectedModel}`}
                provider={activeProvider}
                modelId={selectedModel}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function keyMetrics(
  metrics: import("../types").MetricBlock[],
  scope: "provider" | "model" = "model",
  t?: ReturnType<typeof useI18n>["t"]
) {
  const lat = metrics.find((m) => m.key === "latency")?.value ?? "—";
  if (scope === "provider") {
    const up = metrics.find((m) => m.key === "api_uptime")?.value ?? "—";
    return `${up} · ${lat}`;
  }
  const failed = metrics.find((m) => m.key === "failed_probes")?.value ?? "—";
  return t ? t("providers.failedMetric", { failed, latency: lat }) : `${failed} failed · ${lat}`;
}

function ProviderListItem({
  provider,
  active,
  onSelect,
  formatDate,
  t,
}: {
  provider: ProviderBlock;
  active: boolean;
  onSelect: () => void;
  formatDate: ReturnType<typeof useI18n>["formatDate"];
  t: ReturnType<typeof useI18n>["t"];
}) {
  const tone = provider.latest_run_id ? healthFromMetrics(provider.metrics) : "neutral";
  const host = hostFromUrl(provider.base_url);

  return (
    <li>
      <div
        className={`entity-item ${active ? "active" : ""}`}
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onSelect();
        }}
      >
        <span className="entity-name">{provider.broker_name}</span>
        <span className={`health-badge tone-${tone}`}>{healthLabel(tone, t)}</span>
        <span className="entity-host">{host}</span>
        {provider.latest_run_at && (
          <span className="entity-meta">
            {formatDate(provider.latest_run_at, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
    </li>
  );
}

function ModelDetail({
  provider,
  modelId,
}: {
  provider: ProviderBlock;
  modelId: string;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"summary" | "logs">("summary");
  const [selectedMetricKey, setSelectedMetricKey] = useState<string | null>(null);
  const [loadedLogs, setLoadedLogs] = useState<Record<string, MeasurementLog[]>>({});
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState("");
  const model = provider.models.find((m) => m.model === modelId);

  const selectedMetric = model
    ? model.metrics.find((metric) => metric.key === selectedMetricKey) ??
      model.metrics.find((metric) => metric.logs.length > 0) ??
      model.metrics[0]
    : null;

  useEffect(() => {
    if (tab !== "logs" || !model || !selectedMetric) return;

    let cancelled = false;
    setLoadingLogs(true);
    setLogsError("");
    api
      .getMetricLogs(provider.broker_id, selectedMetric.key, model.model)
      .then((items) => {
        if (!cancelled) {
          setLoadedLogs((prev) => ({ ...prev, [selectedMetric.key]: items }));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLogsError(err instanceof Error ? err.message : t("metricPage.logsLoadError"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingLogs(false);
      });

    return () => {
      cancelled = true;
    };
  }, [model, provider.broker_id, selectedMetric, t, tab]);

  if (!model) return null;

  const logs = selectedMetric
    ? loadedLogs[selectedMetric.key] ?? selectedMetric.logs
    : [];

  function openLogs(metric: MetricBlock) {
    setSelectedMetricKey(metric.key);
    setTab("logs");
  }

  return (
    <div className="model-detail">
      <div className="model-detail-head">
        <div className="model-detail-title">
          <strong>{model.label}</strong>
          <code>{model.model}</code>
        </div>
        <div className="model-detail-tabs" role="tablist" aria-label={t("providers.details")}>
          <button
            type="button"
            className={tab === "summary" ? "active" : ""}
            onClick={() => setTab("summary")}
            role="tab"
            aria-selected={tab === "summary"}
          >
            {t("providers.summary")}
          </button>
          <button
            type="button"
            className={tab === "logs" ? "active" : ""}
            onClick={() => setTab("logs")}
            role="tab"
            aria-selected={tab === "logs"}
          >
            {t("providers.logs")}
          </button>
        </div>
      </div>

      {tab === "summary" ? (
        <div className="model-summary-stack">
          <ModelDiagnostics metrics={model.metrics} />

          <div className="model-summary-table" role="table" aria-label={t("providers.summary")}>
            <div className="model-summary-head" role="row">
              <span>{t("providers.metric")}</span>
              <span>{t("providers.value")}</span>
              <span>{t("logs.status")}</span>
              <span>{t("providers.logs")}</span>
            </div>
            {model.metrics.map((metric) => {
              const meta = metricMeta(metric.key, t);
              const tone = toneForMetric(metric);
              const note = streamNote(metric, t);
              return (
                <button
                  type="button"
                  key={metric.key}
                  className={`model-summary-row tone-${tone}`}
                  onClick={() => openLogs(metric)}
                  title={meta?.help}
                  role="row"
                >
                  <span className="model-summary-metric" role="cell">
                    {meta?.label ?? metric.label}
                  </span>
                  <span className="model-summary-value" role="cell">
                    {displayMetricValue(metric)}
                    {note && <small>{note}</small>}
                  </span>
                  <span className={`health-badge tone-${tone}`} role="cell">
                    {healthLabel(tone, t)}
                  </span>
                  <span className="model-summary-logs" role="cell">
                    {metric.logs.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="model-logs-tab">
          <div className="model-log-picker" role="tablist" aria-label={t("logs.probeLogs")}>
            {model.metrics.map((metric) => {
              const meta = metricMeta(metric.key, t);
              const active = selectedMetric?.key === metric.key;
              return (
                <button
                  key={metric.key}
                  type="button"
                  className={active ? "active" : ""}
                  onClick={() => setSelectedMetricKey(metric.key)}
                  role="tab"
                  aria-selected={active}
                  title={meta?.help}
                >
                  <span>{meta?.label ?? metric.label}</span>
                  <strong>{metric.logs.length}</strong>
                </button>
              );
            })}
          </div>
          {(loadingLogs || logsError) && (
            <p className={`model-log-status ${logsError ? "error" : ""}`}>
              {logsError || t("metricPage.loadingLogs")}
            </p>
          )}
          {selectedMetric ? (
            <div className="model-log-table-wrap">
              <ProbeLogTable
                logs={logs}
                emptyMessage={
                  selectedMetric.key === "failed_probes"
                    ? t("logs.allPassed")
                    : t("logs.noMetric")
                }
                linkProviders={false}
              />
            </div>
          ) : (
            <p className="probe-log-empty">{t("logs.noMetric")}</p>
          )}
        </div>
      )}
    </div>
  );
}

interface Percentiles {
  p50?: number;
  p75?: number;
  p90?: number;
  p99?: number;
}

interface ErrorBucket {
  category: string;
  count: number;
  tests?: string[];
}

interface CapabilityBucket {
  capability: string;
  passed: number;
  total: number;
  pct: number;
}

function ModelDiagnostics({ metrics }: { metrics: MetricBlock[] }) {
  const { t } = useI18n();
  const raw = metrics[0]?.raw ?? {};
  const latency = raw.latency_percentiles as Percentiles | undefined;
  const ttft = raw.ttft_percentiles as Percentiles | undefined;
  const stream = raw.stream_speed_percentiles as Percentiles | undefined;
  const errors = (raw.error_breakdown ?? []) as ErrorBucket[];
  const capabilities = (raw.capability_matrix ?? []) as CapabilityBucket[];
  const streamSuccess = numberOrNull(raw.stream_success_pct);

  return (
    <div className="model-diagnostics">
      <section className="diagnostic-panel">
        <h3>{t("diagnostics.performance")}</h3>
        <div className="diagnostic-kpis">
          <DiagnosticKpi label={t("metrics.latency.label")} value={formatPair(latency, "s")} />
          <DiagnosticKpi label={t("measurements.ttft")} value={formatPair(ttft, "s")} />
          <DiagnosticKpi label={t("measurements.streamSpeed")} value={formatPair(stream, " tps")} />
          <DiagnosticKpi
            label={t("diagnostics.streamSuccess")}
            value={streamSuccess == null ? "—" : `${streamSuccess}%`}
          />
        </div>
      </section>

      <section className="diagnostic-panel">
        <h3>{t("diagnostics.errors")}</h3>
        {errors.length === 0 ? (
          <p className="diagnostic-empty">{t("diagnostics.noErrors")}</p>
        ) : (
          <div className="error-breakdown-list">
            {errors.map((item) => (
              <span className="error-breakdown-pill" key={item.category}>
                <strong>{t(errorCategoryKey(item.category))}</strong>
                <span>{item.count}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="diagnostic-panel diagnostic-panel-wide">
        <h3>{t("diagnostics.compatibility")}</h3>
        {capabilities.length === 0 ? (
          <p className="diagnostic-empty">{t("diagnostics.noCapabilities")}</p>
        ) : (
          <div className="capability-matrix">
            {capabilities.map((item) => {
              const tone = capabilityTone(item.pct);
              return (
                <div className="capability-row" key={item.capability}>
                  <span>{t(capabilityKey(item.capability))}</span>
                  <strong>{item.passed}/{item.total}</strong>
                  <span className={`health-badge tone-${tone}`}>{Math.round(item.pct)}%</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function DiagnosticKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="diagnostic-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatPair(stats: Percentiles | undefined, suffix: string): string {
  if (!stats || stats.p50 == null || stats.p90 == null) return "—";
  return `${stats.p50}${suffix} / ${stats.p90}${suffix}`;
}

function capabilityTone(pct: number): Tone {
  if (pct >= 95) return "good";
  if (pct >= 70) return "neutral";
  return "warn";
}

function capabilityKey(capability: string): TranslationKey {
  const keys: Record<string, TranslationKey> = {
    streaming: "diagnostics.cap.streaming",
    input: "diagnostics.cap.input",
    json: "diagnostics.cap.json",
    tools: "diagnostics.cap.tools",
    vision: "diagnostics.cap.vision",
  };
  return keys[capability] ?? "diagnostics.cap.unknown";
}

function errorCategoryKey(category: string): TranslationKey {
  const keys: Record<string, TranslationKey> = {
    empty_stream: "diagnostics.err.empty_stream",
    stream_error: "diagnostics.err.stream_error",
    timeout: "diagnostics.err.timeout",
    rate_limited: "diagnostics.err.rate_limited",
    auth_or_config: "diagnostics.err.auth_or_config",
    bad_request: "diagnostics.err.bad_request",
    upstream_5xx: "diagnostics.err.upstream_5xx",
    capability_mismatch: "diagnostics.err.capability_mismatch",
    other: "diagnostics.err.other",
    unknown: "diagnostics.err.unknown",
  };
  return keys[category] ?? "diagnostics.err.other";
}
