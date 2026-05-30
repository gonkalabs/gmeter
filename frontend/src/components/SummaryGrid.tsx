import type { MetricBlock, ProviderBlock } from "../types";
import {
  displayMetricValue,
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

  return (
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
            formatDate={formatDate}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderRow({
  rank,
  provider,
  onSelect,
  formatDate,
  t,
}: {
  rank: number;
  provider: ProviderBlock;
  onSelect: (metric: MetricBlock, brokerId: number) => void;
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
        <BrokerLink name={provider.broker_name} baseUrl={provider.base_url}>
          <strong>{provider.broker_name}</strong>
        </BrokerLink>
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
