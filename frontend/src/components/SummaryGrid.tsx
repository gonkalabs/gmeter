import { useEffect, useState } from "react";
import type { MetricBlock, ProviderBlock } from "../types";
import {
  displayMetricValueCompact,
  GLANCE_COLUMNS,
  glanceLabel,
  healthFromMetrics,
  healthLabel,
  metricMeta,
  metricGaugePercent,
  sortProvidersByScore,
  toneForMetric,
} from "../metrics";
import { Speedometer } from "./Speedometer";
import { useI18n } from "../i18n";
import { BrokerLink, hostFromUrl } from "../brokerLinks";

interface Props {
  providers: ProviderBlock[];
  onSelect: (metric: MetricBlock, brokerId: number) => void;
}

export function SummaryGrid({ providers, onSelect }: Props) {
  const { t, formatDate } = useI18n();
  const ranked = sortProvidersByScore(providers);
  const [summaryProvider, setSummaryProvider] = useState<ProviderBlock | null>(null);

  return (
    <>
      <div className="glance-table">
        <div className="glance-table-head" role="row">
          <span className="glance-col-rank">#</span>
          <span className="glance-col-provider">{t("logs.provider")}</span>
          {GLANCE_COLUMNS.map((key) => (
            <span className="glance-col-metric" key={key}>
              {glanceLabel(key, t)}
            </span>
          ))}
          <span className="glance-col-status">{t("logs.status")}</span>
        </div>

        <div className="glance-table-body">
          {ranked.map((provider, index) => (
            <ProviderRow
              key={provider.broker_id}
              rank={index + 1}
              provider={provider}
              onSelect={onSelect}
              onOpenSummary={() => setSummaryProvider(provider)}
              formatDate={formatDate}
              t={t}
            />
          ))}
        </div>
      </div>

      {summaryProvider?.ai_summary ? (
        <AiSummaryModal
          provider={summaryProvider}
          onClose={() => setSummaryProvider(null)}
        />
      ) : null}
    </>
  );
}

function ProviderRow({
  rank,
  provider,
  onSelect,
  onOpenSummary,
  formatDate,
  t,
}: {
  rank: number;
  provider: ProviderBlock;
  onSelect: (metric: MetricBlock, brokerId: number) => void;
  onOpenSummary: () => void;
  formatDate: ReturnType<typeof useI18n>["formatDate"];
  t: ReturnType<typeof useI18n>["t"];
}) {
  const tone = provider.latest_run_id ? healthFromMetrics(provider.metrics) : "neutral";
  const byKey = new Map(provider.metrics.map((m) => [m.key, m]));
  const host = hostFromUrl(provider.base_url);

  return (
    <div className={`glance-table-row tone-${tone}`} role="row">
      <span className="glance-col-rank">{rank}</span>

      <div className="glance-col-provider">
        <div className="glance-provider-top">
          <BrokerLink name={provider.broker_name} baseUrl={provider.base_url}>
            <strong>{provider.broker_name}</strong>
          </BrokerLink>
          {provider.ai_summary ? (
            <button
              type="button"
              className="glance-ai-btn"
              onClick={onOpenSummary}
              title={t("network.aiOpen")}
              aria-label={t("network.aiOpenFor", { provider: provider.broker_name })}
            >
              <MessageIcon />
            </button>
          ) : null}
        </div>
        <BrokerLink
          name={provider.broker_name}
          baseUrl={provider.base_url}
          className="glance-provider-host"
        >
          {host}
        </BrokerLink>
        {provider.latest_run_at && (
          <time className="glance-provider-time" dateTime={provider.latest_run_at}>
            {formatDate(provider.latest_run_at, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        )}
      </div>

      {GLANCE_COLUMNS.map((key) => {
        const metric = byKey.get(key);
        if (!metric || !provider.latest_run_id) {
          return (
            <span className="glance-col-metric glance-metric-empty" key={key}>
              <Speedometer value={0} size="sm" empty displayValue="—" />
            </span>
          );
        }
        const pct = metricGaugePercent(metric);
        const empty = pct == null;
        const meta = metricMeta(key, t);
        return (
          <div className="glance-col-metric" key={key}>
            <Speedometer
              value={pct ?? 0}
              displayValue={displayMetricValueCompact(metric)}
              tone={empty ? "neutral" : toneForMetric(metric)}
              size="sm"
              empty={empty}
              onClick={() => onSelect(metric, provider.broker_id)}
              title={meta?.help}
            />
          </div>
        );
      })}

      <span className={`glance-col-status health-badge tone-${tone}`}>{healthLabel(tone, t)}</span>
    </div>
  );
}

function AiSummaryModal({
  provider,
  onClose,
}: {
  provider: ProviderBlock;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const host = hostFromUrl(provider.base_url);

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
        aria-labelledby="ai-summary-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-header-main">
            <div className="modal-title-row">
              <h2 id="ai-summary-title">{t("network.aiBrokerTitle")}</h2>
              <span className="network-epoch-badge network-ai-badge">{t("network.aiBadge")}</span>
            </div>
            <p className="modal-subtitle">
              <BrokerLink name={provider.broker_name} baseUrl={provider.base_url} />
              {" · "}
              {host}
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
      <path
        d="M8.25 9.75h7.5M8.25 13h4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
