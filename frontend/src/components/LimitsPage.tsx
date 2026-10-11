import type { LimitsDetail, ModelLimits, ProviderLimits } from "../types";
import { LIMITS_INTERVAL_MINUTES } from "../metrics";
import { limitsPath } from "../routes";
import { modelKey } from "../trendMetrics";
import { useI18n, type TFunction } from "../i18n";
import { BrokerLink, hostFromUrl } from "../brokerLinks";

const MODEL_ORDER = ["minimax", "deepseek", "glm53", "glm52", "kimi", "qwen", "glm"];

interface Props {
  limits: LimitsDetail | null;
  loading: boolean;
  probing?: boolean;
  brokerId: number | null;
  model: string | null;
}

type SideState = "pass" | "fail" | "pending";

export function LimitsPage({ limits, loading, probing, brokerId, model }: Props) {
  const { t, formatDate, formatNumber } = useI18n();

  if (loading && !limits) {
    return <div className="skeleton-panel" />;
  }

  if (!limits || limits.providers.length === 0) {
    return (
      <div className="empty-state compact">
        <h2>{t("limits.emptyTitle")}</h2>
        <p>{t("limits.emptyHint", { interval: LIMITS_INTERVAL_MINUTES })}</p>
      </div>
    );
  }

  const provider = brokerId == null ? null : limits.providers.find((item) => item.broker_id === brokerId) ?? null;
  const selected =
    provider && model
      ? provider.models.find((item) => item.model === model || modelKey(item.model) === modelKey(model)) ?? null
      : null;

  if (model) {
    if (!provider || !selected) {
      return (
        <div className="empty-state compact">
          <p>{t("limits.missing")}</p>
          <a className="page-back" href="/limits">
            ← {t("limits.back")}
          </a>
        </div>
      );
    }
    return (
      <LimitsDetailView
        provider={provider}
        model={selected}
        formatDate={formatDate}
        formatNumber={formatNumber}
      />
    );
  }

  const columns = columnsFor(limits.providers);
  const hasData = limits.providers.some((item) => item.run_id);

  return (
    <div className="dashboard-layout">
      <section className="page-section">
        <header className="section-header">
          <h2>{t("limits.title")}</h2>
          <p>
            {t("limits.hint", {
              interval: limits.limits_interval_minutes,
              tokens: formatNumber(limits.min_output_required),
            })}
          </p>
        </header>

        {!hasData && (
          <div className="banner banner-info">
            <span className={`status-dot ${probing ? "pulse" : ""}`} />
            {probing ? t("limits.firstRunning") : t("limits.waiting")}
          </div>
        )}

        <div className="limits-matrix">
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
              {limits.providers.map((item) => (
                <tr key={item.broker_id} className={item.broker_id === brokerId ? "is-current" : undefined}>
                  <th className="limits-broker" scope="row">
                    <BrokerLink name={item.broker_name} baseUrl={item.base_url}>
                      <strong>{item.broker_name}</strong>
                    </BrokerLink>
                    <span className="limits-broker-host">{hostFromUrl(item.base_url)}</span>
                    <span className="limits-broker-time">
                      {item.measured_at
                        ? formatDate(item.measured_at, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : t("common.notMeasured")}
                    </span>
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
                    return (
                      <td key={column.key}>
                        <a
                          className={`limits-cell tone-${cellTone(cell)}`}
                          href={limitsPath(item.broker_name, item.broker_id, cell.model)}
                          aria-label={t("limits.cellLabel", {
                            provider: item.broker_name,
                            model: cell.label,
                          })}
                        >
                          <LimitLine
                            label={t("limits.maxContext")}
                            value={
                              cell.max_input_k > 0 ? t("limits.kTokens", { count: cell.max_input_k }) : "—"
                            }
                            state={inputState(cell)}
                          />
                          <LimitLine
                            label={t("limits.maxOutput")}
                            value={
                              cell.max_output_tokens > 0
                                ? t("limits.tokens", { count: formatNumber(cell.max_output_tokens) })
                                : "—"
                            }
                            state={outputState(cell)}
                          />
                          {cell.gonka_limitation ? (
                            <span className="limits-tag">{t("common.platformLimit")}</span>
                          ) : null}
                        </a>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function LimitsDetailView({
  provider,
  model,
  formatDate,
  formatNumber,
}: {
  provider: ProviderLimits;
  model: ModelLimits;
  formatDate: ReturnType<typeof useI18n>["formatDate"];
  formatNumber: ReturnType<typeof useI18n>["formatNumber"];
}) {
  const { t } = useI18n();
  const maxInputError = formatLimitError(model.max_input_error, t);
  const maxOutputError = formatLimitError(model.max_output_error, t);

  return (
    <div className="dashboard-layout">
      <a className="page-back" href="/limits">
        ← {t("limits.back")}
      </a>
      <article className="limits-card">
        <header className="limits-card-head">
          <div>
            <strong>{model.label}</strong>
            <code>{model.model}</code>
            <BrokerLink name={provider.broker_name} baseUrl={provider.base_url} className="limits-detail-broker">
              {provider.broker_name}
            </BrokerLink>
            <span className="limits-broker-host">{hostFromUrl(provider.base_url)}</span>
            {provider.measured_at ? (
              <time className="limits-broker-time" dateTime={provider.measured_at}>
                {formatDate(provider.measured_at, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            ) : null}
          </div>
          {model.gonka_limitation ? <span className="limits-tag">{t("common.platformLimit")}</span> : null}
        </header>

        <div className="limits-metrics">
          <div className={`limits-metric ${inputState(model)}`}>
            <span className="limits-metric-label">{t("limits.maxContext")}</span>
            <span className="limits-metric-value">
              {model.max_input_k > 0 ? t("limits.kTokens", { count: model.max_input_k }) : "—"}
            </span>
            <span className={`status-pill ${pillClass(inputState(model))}`}>
              {stateLabel(inputState(model), t)}
            </span>
            {maxInputError && inputState(model) !== "pass" ? <p className="limits-error">{maxInputError}</p> : null}
          </div>

          <div className={`limits-metric ${outputState(model)}`}>
            <span className="limits-metric-label">{t("limits.maxOutput")}</span>
            <span className="limits-metric-value">
              {model.max_output_tokens > 0
                ? t("limits.tokens", { count: formatNumber(model.max_output_tokens) })
                : "—"}
            </span>
            <span className="limits-metric-sub">
              {t("limits.required", { count: formatNumber(model.max_output_required) })}
            </span>
            <span className={`status-pill ${pillClass(outputState(model))}`}>
              {stateLabel(outputState(model), t)}
            </span>
            {maxOutputError && outputState(model) !== "pass" ? (
              <p className="limits-error">{maxOutputError}</p>
            ) : null}
          </div>
        </div>

        {model.max_input_ladder.length > 0 ? (
          <div className="limits-ladder-block">
            <h3>
              {t("limits.ladderTitle")}
              <span>{t("limits.steps", { count: model.max_input_ladder.length })}</span>
            </h3>
            <ul className="limits-ladder">
              {model.max_input_ladder.map((step) => {
                const stepError = formatLimitError(step.error, t);
                return (
                  <li key={step.label} className={step.ok ? "pass" : "fail"}>
                    <span>{step.label}</span>
                    <span>{step.ok ? t("common.ok") : stepError || t("common.fail")}</span>
                    {step.ttft != null ? <span>{step.ttft}s TTFT</span> : <span />}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </article>
    </div>
  );
}

function LimitLine({ label, value, state }: { label: string; value: string; state: SideState }) {
  const { t } = useI18n();
  return (
    <span className={`limits-cell-line ${state}`}>
      <span className="limits-cell-label">{label}</span>
      <span className="limits-cell-value">{value}</span>
      <span className="limits-cell-state">{stateLabel(state, t)}</span>
    </span>
  );
}

function columnsFor(providers: ProviderLimits[]) {
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

function modelFor(provider: ProviderLimits, key: string) {
  return provider.models.find((model) => modelKey(model.model) === key) ?? null;
}

function modelOrder(key: string) {
  const index = MODEL_ORDER.indexOf(key);
  return index === -1 ? MODEL_ORDER.length : index;
}

function inputState(model: ModelLimits): SideState {
  return sideState(model.max_input_ok, model.max_input_error, model.max_input_k > 0 || model.max_input_ladder.length > 0);
}

function outputState(model: ModelLimits): SideState {
  return sideState(model.max_output_ok, model.max_output_error, model.max_output_tokens > 0);
}

function sideState(ok: boolean, error: string | null, hasValue: boolean): SideState {
  if ((error || "").trim().toLowerCase() === "not tested" && !hasValue) return "pending";
  if (!hasValue && !ok) return "pending";
  return ok ? "pass" : "fail";
}

function cellTone(model: ModelLimits): SideState {
  const input = inputState(model);
  const output = outputState(model);
  if (input === "fail" || output === "fail") return "fail";
  if (input === "pending" && output === "pending") return "pending";
  return "pass";
}

function pillClass(state: SideState) {
  if (state === "pass") return "completed";
  if (state === "fail") return "failed";
  return "queued";
}

function stateLabel(state: SideState, t: TFunction) {
  if (state === "pass") return t("common.pass");
  if (state === "fail") return t("common.fail");
  return t("common.notMeasured");
}

function formatLimitError(error: string | null, t: TFunction): string | null {
  if (!error) return null;

  const normalized = error.trim().toLowerCase();
  if (normalized === "not tested") {
    return t("common.notMeasured");
  }
  if (
    normalized === "the read operation timed out" ||
    normalized === "read timed out" ||
    normalized === "read timed out."
  ) {
    return t("limits.error.readTimeout");
  }

  const insufficientOutput = error.match(
    /^only\s+([\d\s,.]+)\s+tokens\s+\(need\s+≥\s*([\d\s,.]+)\)$/i
  );
  if (insufficientOutput) {
    return t("limits.error.insufficientOutput", {
      count: insufficientOutput[1].trim(),
      required: insufficientOutput[2].trim(),
    });
  }

  return error;
}
