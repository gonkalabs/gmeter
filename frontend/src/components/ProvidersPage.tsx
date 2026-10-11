import { useEffect, useState } from "react";
import type { DashboardDetail, MeasurementLog, MetricBlock, ModelBlock, ProviderBlock } from "../types";
import { api } from "../api";
import { providerModelPath } from "../routes";
import {
  displayMetricValue,
  displayMetricValueCompact,
  GLANCE_COLUMNS,
  glanceLabel,
  healthFromMetrics,
  healthLabel,
  metricMeta,
  streamNote,
  type Tone,
  toneForMetric,
} from "../metrics";
import { useI18n, type TranslationKey } from "../i18n";
import { BrokerLink, hostFromUrl } from "../brokerLinks";
import { modelKey } from "../trendMetrics";
import { ProbeLogTable } from "./ProbeLogTable";

const MODEL_ORDER = ["minimax", "deepseek", "glm53", "glm52", "kimi", "qwen", "glm"];

function metricProbeCount(metric: MetricBlock) {
  if (metric.logs.length > 0) return metric.logs.length;
  const breakdown = metric.raw?.test_breakdown;
  if (Array.isArray(breakdown)) {
    return breakdown.reduce(
      (sum: number, row: { total?: number }) => sum + (Number(row.total) || 0),
      0
    );
  }
  const failed = metric.raw?.failed_probes;
  return typeof failed === "number" ? failed : 0;
}

interface Props {
  detail: DashboardDetail | null;
  loading: boolean;
  brokerId: number | null;
  model: string | null;
  logs: boolean;
  metricKey: string | null;
}

export function ProvidersPage({ detail, loading, brokerId, model, logs, metricKey }: Props) {
  const { t, formatDate } = useI18n();
  const [summaryProvider, setSummaryProvider] = useState<ProviderBlock | null>(null);

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

  const provider = brokerId == null ? null : detail.providers.find((item) => item.broker_id === brokerId) ?? null;
  const selected = provider && model ? findModel(provider, model) : null;

  if (model) {
    if (!provider || !selected) {
      return (
        <div className="empty-state compact">
          <p>{t("providers.missing")}</p>
          <a className="page-back" href="/providers">
            ← {t("providers.back")}
          </a>
        </div>
      );
    }
    return (
      <div className="dashboard-layout">
        <a className="page-back" href="/providers">
          ← {t("providers.back")}
        </a>
        <ModelDetail
          key={`${provider.broker_id}:${selected.model}:${logs ? "logs" : "summary"}`}
          provider={provider}
          modelId={selected.model}
          logs={logs}
          metricKey={metricKey}
        />
      </div>
    );
  }

  const columns = columnsFor(detail.providers);

  return (
    <div className="dashboard-layout">
      <section className="page-section">
        <header className="section-header">
          <h2>{t("providers.title")}</h2>
          <p>{t("providers.hint")}</p>
        </header>

        <div className="limits-matrix provider-matrix">
          <table>
            <thead>
              <tr>
                <th className="limits-broker" scope="col">
                  {t("limits.providers")}
                </th>
                {columns.map((column) => (
                  <th key={column.key} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.providers.map((item) => {
                const tone = item.latest_run_id ? healthFromMetrics(item.metrics) : "neutral";
                return (
                  <tr key={item.broker_id} className={item.broker_id === brokerId ? "is-current" : undefined}>
                    <th className="limits-broker" scope="row">
                      <div className="provider-broker-top">
                        <BrokerLink name={item.broker_name} baseUrl={item.base_url}>
                          <strong>{item.broker_name}</strong>
                        </BrokerLink>
                        {item.ai_summary ? (
                          <button
                            type="button"
                            className="glance-ai-btn"
                            onClick={() => setSummaryProvider(item)}
                            title={t("network.aiOpen")}
                            aria-label={t("network.aiOpenFor", { provider: item.broker_name })}
                          >
                            <MessageIcon />
                          </button>
                        ) : (
                          <span className="glance-ai-spacer" aria-hidden="true" />
                        )}
                      </div>
                      <span className="limits-broker-host">{hostFromUrl(item.base_url)}</span>
                      <span className="limits-broker-time">
                        {item.latest_run_at
                          ? formatDate(item.latest_run_at, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : t("common.notMeasured")}
                      </span>
                      <span className={`health-badge tone-${tone}`}>{healthLabel(tone, t)}</span>
                    </th>
                    {columns.map((column) => {
                      const cell = modelFor(item, column.key);
                      if (!cell) {
                        return (
                          <td key={column.key} className="limits-empty">
                            —
                          </td>
                        );
                      }
                      const cellTone = cell.deprecated ? "warn" : healthFromMetrics(cell.metrics);
                      const byKey = new Map(cell.metrics.map((metric) => [metric.key, metric]));
                      return (
                        <td key={column.key}>
                          <a
                            className={`provider-cell tone-${cellTone}`}
                            href={providerModelPath(item.broker_name, item.broker_id, cell.model)}
                            aria-label={t("providers.cellLabel", {
                              provider: item.broker_name,
                              model: cell.label,
                            })}
                          >
                            <span className={`health-badge tone-${cellTone}`}>
                              {cell.deprecated ? t("models.deprecated") : healthLabel(cellTone, t)}
                            </span>
                            {GLANCE_COLUMNS.map((key) => {
                              const metric = byKey.get(key);
                              return (
                                <span className="provider-cell-line" key={key}>
                                  <span>{glanceLabel(key, t)}</span>
                                  <strong>{metric ? displayMetricValueCompact(metric) : "—"}</strong>
                                </span>
                              );
                            })}
                          </a>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {summaryProvider?.ai_summary ? (
        <AiSummaryModal provider={summaryProvider} onClose={() => setSummaryProvider(null)} />
      ) : null}
    </div>
  );
}

function columnsFor(providers: ProviderBlock[]) {
  const labels = new Map<string, string>();
  for (const provider of providers) {
    for (const model of provider.models) {
      const key = modelKey(model.model);
      if (!labels.has(key)) labels.set(key, model.label);
    }
  }
  return [...labels.entries()]
    .sort((left, right) => {
      const order = modelOrder(left[0]) - modelOrder(right[0]);
      return order || left[1].localeCompare(right[1]);
    })
    .map(([key, label]) => ({ key, label }));
}

function modelFor(provider: ProviderBlock, key: string) {
  return provider.models.find((model) => modelKey(model.model) === key) ?? null;
}

function findModel(provider: ProviderBlock, modelId: string): ModelBlock | null {
  return (
    provider.models.find((model) => model.model === modelId) ??
    provider.models.find((model) => modelKey(model.model) === modelKey(modelId)) ??
    null
  );
}

function modelOrder(key: string) {
  const index = MODEL_ORDER.indexOf(key);
  return index === -1 ? MODEL_ORDER.length : index;
}

function AiSummaryModal({
  provider,
  onClose,
}: {
  provider: ProviderBlock;
  onClose: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-panel ai-summary-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="provider-ai-summary-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-header-main">
            <div className="modal-title-row">
              <h2 id="provider-ai-summary-title">{t("network.aiBrokerTitle")}</h2>
              <span className="network-epoch-badge network-ai-badge">{t("network.aiBadge")}</span>
            </div>
            <p className="modal-subtitle">
              <BrokerLink name={provider.broker_name} baseUrl={provider.base_url} />
              {" · "}
              {hostFromUrl(provider.base_url)}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t("modal.closeLabel")}>
            ×
          </button>
        </header>
        <div className="modal-body">
          <p className="ai-summary-modal-text">{provider.ai_summary}</p>
        </div>
        <footer className="modal-footer">
          <button type="button" className="modal-close-btn" onClick={onClose}>
            {t("common.close")}
          </button>
        </footer>
      </div>
    </div>
  );
}

function MessageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 6.75A2.25 2.25 0 0 1 6.75 4.5h10.5a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25H9.3L5.7 19.2a.75.75 0 0 1-1.2-.6V6.75Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M8.25 9.75h7.5M8.25 13h4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ModelDetail({
  provider,
  modelId,
  logs,
  metricKey,
}: {
  provider: ProviderBlock;
  modelId: string;
  logs: boolean;
  metricKey: string | null;
}) {
  const { t } = useI18n();
  const [selectedMetricKey, setSelectedMetricKey] = useState<string | null>(metricKey);
  const [loadedLogs, setLoadedLogs] = useState<Record<string, MeasurementLog[]>>({});
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState("");
  const model = provider.models.find((m) => m.model === modelId);

  const selectedMetric = model
    ? model.metrics.find((metric) => metric.key === selectedMetricKey) ??
      model.metrics.find((metric) => metricProbeCount(metric) > 0) ??
      model.metrics[0]
    : null;

  useEffect(() => {
    setSelectedMetricKey(metricKey);
  }, [metricKey]);

  useEffect(() => {
    if (!logs || !model || !selectedMetric) return;

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
  }, [logs, model, provider.broker_id, selectedMetric, t]);

  if (!model) return null;

  const logRows = selectedMetric
    ? loadedLogs[selectedMetric.key] ?? selectedMetric.logs
    : [];

  const summaryHref = providerModelPath(provider.broker_name, provider.broker_id, modelId);
  const logsHref = (key?: string) =>
    providerModelPath(provider.broker_name, provider.broker_id, modelId, true, key ?? metricKey);

  return (
    <div className="model-detail">
      <div className="model-detail-head">
        <div className="model-detail-title">
          <strong>{model.label}</strong>
          <code>{model.model}</code>
        </div>
        <div className="model-detail-tabs" role="tablist" aria-label={t("providers.details")}>
          <a className={logs ? "" : "active"} href={summaryHref} aria-current={logs ? undefined : "page"}>
            {t("providers.summary")}
          </a>
          <a className={logs ? "active" : ""} href={logsHref()} aria-current={logs ? "page" : undefined}>
            {t("providers.logs")}
          </a>
        </div>
      </div>

      {!logs ? (
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
                <a
                  key={metric.key}
                  className={`model-summary-row tone-${tone}`}
                  href={logsHref(metric.key)}
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
                    {metricProbeCount(metric)}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="model-logs-tab" aria-busy={loadingLogs}>
          <div className="model-log-picker" role="tablist" aria-label={t("logs.probeLogs")}>
            {model.metrics.map((metric) => {
              const meta = metricMeta(metric.key, t);
              const active = selectedMetric?.key === metric.key;
              return (
                <a
                  key={metric.key}
                  className={active ? "active" : ""}
                  href={logsHref(metric.key)}
                  aria-current={active ? "page" : undefined}
                  title={meta?.help}
                >
                  <span>{meta?.label ?? metric.label}</span>
                  <strong>{metricProbeCount(metric)}</strong>
                </a>
              );
            })}
          </div>
          {logsError && (
            <p className="model-log-status error" role="alert">
              {logsError}
            </p>
          )}
          {selectedMetric ? (
            <div className="model-log-table-wrap">
              <ProbeLogTable
                logs={logRows}
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
