import { useEffect } from "react";
import type { ProbeResult, ProbeRun } from "../types";
import {
  formatProbeJson,
  probeLadderSteps,
  probeMeasurements,
  probeRequestText,
  probeResponseText,
  testLabel,
} from "../probeTest";
import { useI18n } from "../i18n";
import { BrokerLink } from "../brokerLinks";

interface Props {
  run: ProbeRun;
  result: ProbeResult;
  brokerName?: string;
  brokerBaseUrl?: string;
  modelLabel?: string;
  onClose: () => void;
}

export function TestDetailModal({
  run,
  result,
  brokerName,
  brokerBaseUrl,
  modelLabel: modelLabelProp,
  onClose,
}: Props) {
  const { t, formatDate } = useI18n();
  const measurements = probeMeasurements(result, t);
  const request = probeRequestText(result);
  const response = probeResponseText(result);
  const ladder = probeLadderSteps(result);
  const modelLabel =
    modelLabelProp ??
    (result.model === "broker" ? t("common.endpoint") : result.model.split("/").pop() ?? result.model);
  const runTypeLabel = run.run_type === "limits"
    ? t("runType.limits")
    : run.run_type === "full"
      ? t("runType.full")
      : t("runType.quick");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
        className="modal-panel test-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-header-main">
            <div className="modal-title-row">
              <h2 id="test-detail-title">{testLabel(result.test_name, t)}</h2>
              <span className={`probe-log-status ${result.ok ? "pass" : "fail"}`}>
                {result.ok ? t("common.pass") : t("common.fail")}
              </span>
            </div>
            <p className="modal-subtitle">
              {t("history.run", { id: run.id })} ·{" "}
              <BrokerLink
                name={brokerName ?? t("history.brokerFallback", { id: run.broker_id })}
                baseUrl={brokerBaseUrl}
              />{" "}
              · {modelLabel} ·{" "}
              {runTypeLabel}
            </p>
            {result.error && !result.ok && (
              <p className="modal-error-line">{result.error}</p>
            )}
            {result.gonka_limitation && (
              <p className="modal-note-line">{t("common.gonkaPlatformLimit")}</p>
            )}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t("modal.closeLabel")}>
            ×
          </button>
        </header>

        <div className="modal-body">
          <section className="modal-section">
            <h3>{t("modal.measurements")}</h3>
            {measurements.length ? (
              <div className="measurement-grid">
                {measurements.map((item) => (
                  <div className="measurement-item" key={item.label}>
                    <span className="measurement-label">{item.label}</span>
                    <span className="measurement-value">{item.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="modal-empty">{t("modal.noMeasurements")}</p>
            )}
          </section>

          <section className="modal-section">
            <h3>{t("modal.request")}</h3>
            {request ? (
              <pre className="modal-code">{request}</pre>
            ) : (
              <p className="modal-empty">{t("modal.requestMissing")}</p>
            )}
          </section>

          <section className="modal-section">
            <h3>{t("modal.response")}</h3>
            {response ? (
              <pre className="modal-code">{response}</pre>
            ) : (
              <p className="modal-empty">{t("modal.responseMissing")}</p>
            )}
          </section>

          {ladder.length > 0 && (
            <section className="modal-section">
              <h3>{t("modal.contextLadder")}</h3>
              <div className="ladder-steps">
                {ladder.map((step) => (
                  <details className="ladder-step" key={step.label} open={!step.ok}>
                    <summary className={`ladder-step-summary ${step.ok ? "pass" : "fail"}`}>
                      <span>{step.label}</span>
                      <span>{step.ok ? t("common.ok") : step.error ?? t("common.failed")}</span>
                    </summary>
                    <div className="ladder-step-body">
                      {step.ttft != null ? (
                        <div className="ladder-meta">TTFT {step.ttft}s</div>
                      ) : !step.ok ? (
                        <div className="ladder-meta">{t("modal.ttftMissing")}</div>
                      ) : null}
                      {step.request != null && (
                        <>
                          <div className="modal-code-label">{t("modal.request")}</div>
                          <pre className="modal-code compact">
                            {formatProbeJson(step.request)}
                          </pre>
                        </>
                      )}
                      {step.response && (
                        <>
                          <div className="modal-code-label">{t("modal.response")}</div>
                          <pre className="modal-code compact">
                            {formatProbeJson(step.response)}
                          </pre>
                        </>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="modal-footer">
          <time dateTime={run.started_at}>
            {formatDate(run.started_at)}
          </time>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            {t("common.close")}
          </button>
        </footer>
      </div>
    </div>
  );
}
