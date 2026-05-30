import { useEffect, useState } from "react";
import type { MetricBlock } from "../types";
import { api } from "../api";
import { displayMetricValue, metricMeta, metricGaugePercent, streamNote, toneForMetric } from "../metrics";
import { ProbeLogTable } from "./ProbeLogTable";
import { Speedometer } from "./Speedometer";
import { useI18n } from "../i18n";
import { BrokerLink } from "../brokerLinks";

interface Props {
  metric: MetricBlock;
  brokerId: number;
  brokerName?: string | null;
  brokerBaseUrl?: string | null;
  onBack: () => void;
}

export function MetricLogsPage({ metric, brokerId, brokerName, brokerBaseUrl, onBack }: Props) {
  const { t } = useI18n();
  const [logs, setLogs] = useState(metric.logs);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState("");
  const meta = metricMeta(metric.key, t);
  const tone = toneForMetric(metric);
  const pct = metricGaugePercent(metric);
  const empty = pct == null;
  const note = streamNote(metric, t);

  useEffect(() => {
    let cancelled = false;
    setLogs(metric.logs);
    setLogsError("");
    setLoadingLogs(true);
    api
      .getMetricLogs(brokerId, metric.key)
      .then((items) => {
        if (!cancelled) setLogs(items);
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
  }, [brokerId, metric.key, metric.logs, t]);

  return (
    <div className="dashboard-layout metric-logs-page">
      <button type="button" className="page-back" onClick={onBack}>
        ← {t("metricPage.back")}
      </button>

      <header className={`metric-page-header tone-${tone}`}>
        <div className="metric-page-title">
          <h1>{meta?.label ?? metric.label}</h1>
          <p>
            {brokerName && (
              <>
                <BrokerLink name={brokerName} baseUrl={brokerBaseUrl ?? undefined} /> ·{" "}
              </>
            )}
            {meta?.help ?? t("metricPage.fallbackHelp")}
          </p>
        </div>
        <div className={`metric-page-gauge tone-${empty ? "neutral" : tone}`}>
          <Speedometer
            value={pct ?? 0}
            displayValue={displayMetricValue(metric)}
            tone={empty ? "neutral" : tone}
            size="lg"
            empty={empty}
          />
          {note && <span className="metric-page-value-note">{note}</span>}
        </div>
      </header>

      <section className="page-section">
        <header className="section-header section-header-row">
          <div>
            <h2>{t("logs.probeLogs")}</h2>
            <p>
              {t("metricPage.logsHint", {
                count: logs.length,
                measurements: logs.length === 1 ? t("common.measurement") : t("common.measurements"),
              })}
              {loadingLogs && <> · {t("metricPage.loadingLogs")}</>}
            </p>
          </div>
        </header>

        {logsError && (
          <div className="banner banner-error" role="alert">
            {logsError}
          </div>
        )}
        <div className="panel probe-log-panel">
          <ProbeLogTable logs={logs} />
        </div>
      </section>
    </div>
  );
}
