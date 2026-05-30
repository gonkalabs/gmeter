import { useState } from "react";
import type { MeasurementLog } from "../types";
import { sortProbeLogs } from "../metrics";
import { useI18n } from "../i18n";
import { testLabel as formatTestLabel } from "../probeTest";
import { BrokerLink } from "../brokerLinks";

function formatResponse(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

interface Props {
  logs: MeasurementLog[];
  emptyMessage?: string;
  linkProviders?: boolean;
}

export function ProbeLogTable({ logs, emptyMessage, linkProviders = true }: Props) {
  const { t } = useI18n();
  const sorted = sortProbeLogs(logs);

  if (sorted.length === 0) {
    return <p className="probe-log-empty">{emptyMessage ?? t("logs.noMetric")}</p>;
  }

  return (
    <div className="probe-log-table">
      <div className="probe-log-head" role="row">
        <span>{t("logs.status")}</span>
        <span>{t("logs.provider")}</span>
        <span>{t("logs.model")}</span>
        <span>{t("logs.test")}</span>
        <span>{t("logs.summary")}</span>
        <span>{t("logs.measured")}</span>
        <span aria-hidden />
      </div>
      <div className="probe-log-body">
        {sorted.map((log) => (
          <ProbeLogRow key={log.id} log={log} linkProvider={linkProviders} />
        ))}
      </div>
    </div>
  );
}

function ProbeLogRow({
  log,
  linkProvider,
}: {
  log: MeasurementLog;
  linkProvider: boolean;
}) {
  const { t, formatDate } = useI18n();
  const [open, setOpen] = useState(false);
  const body = log.response || log.error;
  const testLabel = formatTestLabel(log.test_name, t);

  return (
    <article className={`probe-log-row ${log.ok ? "pass" : "fail"} ${open ? "open" : ""}`}>
      <div
        className="probe-log-row-btn"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") setOpen((v) => !v);
        }}
        aria-expanded={open}
      >
        <span className={`probe-log-status ${log.ok ? "pass" : "fail"}`}>
          {log.ok ? t("common.pass") : t("common.fail")}
        </span>
        {linkProvider ? (
          <BrokerLink name={log.provider} className="probe-log-provider">
            {log.provider}
          </BrokerLink>
        ) : (
          <span className="probe-log-provider">{log.provider}</span>
        )}
        <span className="probe-log-model">{log.model ?? "—"}</span>
        <span className="probe-log-test">{testLabel}</span>
        <span className="probe-log-summary">{log.summary}</span>
        <time className="probe-log-time" dateTime={log.measured_at}>
          {formatDate(log.measured_at, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
        <span className="probe-log-chevron">{open ? "−" : "+"}</span>
      </div>

      {open && (
        <div className="probe-log-detail">
          <div className="log-meta-grid">
            {log.latency_s != null && <span>{t("logs.latency", { value: log.latency_s })}</span>}
            {log.ttft_s != null && <span>TTFT {log.ttft_s}s</span>}
            {log.tps != null && <span>{log.tps} tps</span>}
            {log.stream_tps != null && <span>{t("logs.streamTps", { value: log.stream_tps })}</span>}
            <span>{t("logs.run", { id: log.run_id })}</span>
          </div>
          {body ? (
            <div className="log-response-wrap">
              <div className="log-response-label">{t("logs.apiResponse")}</div>
              <pre className="log-response">{formatResponse(body)}</pre>
            </div>
          ) : (
            <p className="probe-log-no-body">{t("logs.noBody")}</p>
          )}
        </div>
      )}
    </article>
  );
}
