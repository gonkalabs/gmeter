import { Fragment, useState } from "react";
import type { Broker, ProbeResult, ProbeRun } from "../types";
import { testLabel } from "../probeTest";
import { TestDetailModal } from "./TestDetailModal";
import { useI18n } from "../i18n";
import { modelDisplayName } from "../modelLabels";
import { BrokerLink } from "../brokerLinks";

interface Props {
  runs: ProbeRun[];
  brokers: Broker[];
  loading: boolean;
}

interface SelectedTest {
  run: ProbeRun;
  result: ProbeResult;
}

export function RunHistory({ runs, brokers, loading }: Props) {
  const { t, formatDate } = useI18n();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selected, setSelected] = useState<SelectedTest | null>(null);

  const brokerName = (brokerId: number) =>
    brokers.find((b) => b.id === brokerId)?.name;
  const brokerForRun = (brokerId: number) => brokers.find((b) => b.id === brokerId);
  const statusLabel = (status: string) => {
    if (status === "completed") return t("runStatus.completed");
    if (status === "running") return t("runStatus.running");
    if (status === "queued") return t("runStatus.queued");
    if (status === "failed") return t("runStatus.failed");
    return status;
  };
  const runTypeLabel = (runType?: string) => {
    if (runType === "limits") return t("runType.limits");
    if (runType === "full") return t("runType.full");
    return t("runType.quick");
  };

  if (loading && runs.length === 0) {
    return (
      <div className="panel">
        <div className="skeleton-line sm" style={{ width: 140 }} />
        <div className="skeleton-line lg" style={{ marginTop: 20, width: "100%" }} />
        <div className="skeleton-line lg" style={{ marginTop: 10, width: "80%" }} />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="empty-state compact">
        <h2>{t("history.emptyTitle")}</h2>
        <p>{t("history.emptyHint")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h2>{t("history.title")}</h2>
          <span className="panel-sub">{t("history.recentRuns", { count: runs.length })}</span>
        </div>

        <div className="history-list">
          {runs.map((run) => {
            const failed = run.results.filter((r) => !r.ok).length;
            const summary = run.summary as Record<string, number> | null;
            const failPct = summary?.failed_probes_pct ?? null;
            const broker = brokerForRun(run.broker_id);

            return (
              <Fragment key={run.id}>
                <div
                  className={`history-row ${expanded === run.id ? "open" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      setExpanded(expanded === run.id ? null : run.id);
                    }
                  }}
                >
                  <div className="history-main">
                    <span className="history-id">{t("history.run", { id: run.id })}</span>
                    <span className="run-type-pill">{runTypeLabel(run.run_type)}</span>
                    <span className={`status-pill ${run.status}`}>{statusLabel(run.status)}</span>
                    {broker && (
                      <BrokerLink
                        name={broker.name}
                        baseUrl={broker.base_url}
                        className="history-broker"
                      >
                        {broker.name}
                      </BrokerLink>
                    )}
                  </div>
                  <div className="history-meta">
                    <time dateTime={run.started_at}>
                      {formatDate(run.started_at)}
                    </time>
                    <span className="history-stat">
                      {failPct != null
                        ? t("history.failedPct", { value: failPct })
                        : t("history.failedCount", { count: failed })}
                    </span>
                  </div>
                  <span className="chevron">{expanded === run.id ? "−" : "+"}</span>
                </div>

                {expanded === run.id && (
                  <div className="history-detail">
                    {run.error && <div className="banner banner-error">{run.error}</div>}
                    <div className="test-list">
                      {run.results.map((r) => (
                        <button
                          type="button"
                          className="test-item test-item-btn"
                          key={r.id}
                          onClick={() => setSelected({ run, result: r })}
                        >
                          <div className="test-left">
                            <span className={`test-dot ${r.ok ? "pass" : "fail"}`} />
                            <div>
                              <div className="test-name">{testLabel(r.test_name, t)}</div>
                              <div className="test-detail">
                                {modelDisplayName(r.model, broker?.model_aliases, t("common.endpoint"))}
                                {r.latency_s != null && ` · ${r.latency_s}s`}
                                {r.stream_tps != null && ` · ${r.stream_tps} tps`}
                                {r.tps != null && ` · ${r.tps} tps`}
                                {r.gonka_limitation && ` · ${t("common.platformLimit")}`}
                              </div>
                            </div>
                          </div>
                          <span className="test-open-hint">{t("common.view")}</span>
                          <span className={r.ok ? "pass-label" : "fail-label"}>
                            {r.ok ? t("common.pass") : t("common.fail")}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {selected && (
        <TestDetailModal
          run={selected.run}
          result={selected.result}
          brokerName={brokerName(selected.run.broker_id)}
          brokerBaseUrl={brokerForRun(selected.run.broker_id)?.base_url}
          modelLabel={modelDisplayName(
            selected.result.model,
            brokerForRun(selected.run.broker_id)?.model_aliases,
            t("common.endpoint")
          )}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
