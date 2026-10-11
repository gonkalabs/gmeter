import { useEffect, useState } from "react";
import { api } from "../api";
import { findDirectoryEntryForProbe } from "../brokerDirectory";
import { brokerWebsiteUrl, hostFromUrl } from "../brokerLinks";
import { matchGateway } from "../gatewayMatch";
import {
  displayMetricValue,
  GLANCE_COLUMNS,
  glanceLabel,
  healthFromMetrics,
  healthLabel,
} from "../metrics";
import { limitsPath, providerModelPath } from "../routes";
import type { DashboardDetail, GatewayStats, LimitsDetail, ProviderBlock } from "../types";
import { useI18n } from "../i18n";

interface Props {
  brokerId: number;
  detail: DashboardDetail | null;
  limits: LimitsDetail | null;
  loading: boolean;
}

export function BrokerPage({ brokerId, detail, limits, loading }: Props) {
  const { t, formatDate, formatNumber } = useI18n();
  const [gateways, setGateways] = useState<GatewayStats | null>(null);
  const [gatewayError, setGatewayError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getGatewayStats()
      .then((payload) => {
        if (!cancelled) setGateways(payload);
      })
      .catch(() => {
        if (!cancelled) setGatewayError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const provider = detail?.providers.find((item) => item.broker_id === brokerId) ?? null;

  if (loading && !detail) return <div className="skeleton-panel" />;

  if (!provider) {
    return (
      <div className="empty-state compact">
        <p>{t("broker.missing")}</p>
        <a className="page-back" href="/providers">
          ← {t("providers.back")}
        </a>
      </div>
    );
  }

  const tone = provider.latest_run_id ? healthFromMetrics(provider.metrics) : "neutral";
  const site = visitUrl(provider);
  const gateway = gateways?.available
    ? matchGateway(provider.broker_name, provider.base_url, gateways.rows)
    : null;
  const limitProvider = limits?.providers.find((item) => item.broker_id === brokerId) ?? null;

  return (
    <div className="broker-page">
      <div className="broker-page-toolbar">
        <span className={`health-badge tone-${tone}`}>{healthLabel(tone, t)}</span>
        <span className="broker-page-host">{hostFromUrl(provider.base_url)}</span>
        {provider.latest_run_at ? (
          <time dateTime={provider.latest_run_at}>
            {formatDate(provider.latest_run_at, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        ) : null}
        {site ? (
          <a className="broker-visit" href={site} target="_blank" rel="noreferrer">
            {t("broker.visit")}
          </a>
        ) : null}
      </div>

      <section className="broker-stat-grid" aria-label={t("broker.meterStats")}>
        {GLANCE_COLUMNS.map((key) => {
          const metric = provider.metrics.find((item) => item.key === key);
          return (
            <article key={key} className="broker-stat">
              <span>{glanceLabel(key, t)}</span>
              <strong>{metric ? displayMetricValue(metric) : "—"}</strong>
            </article>
          );
        })}
      </section>

      <section className="broker-panel-card">
        <header className="broker-panel-head">
          <h2>{t("broker.networkTitle")}</h2>
          <span>{t("broker.networkWindow", { hours: gateways?.hours ?? 24 })}</span>
        </header>
        {gatewayError || (gateways && !gateways.available) ? (
          <p className="broker-note">{t("broker.networkUnavailable")}</p>
        ) : !gateways ? (
          <p className="broker-note">{t("broker.networkLoading")}</p>
        ) : gateway?.kind === "gateway" ? (
          <>
            <p className="broker-role">{t("broker.operator")}</p>
            <p className="broker-note">{t("broker.operatorBody")}</p>
            <VolumeGrid
              inferences={gateway.row.inferences}
              confirmed={gateway.row.confirmed_inferences}
              tokens={gateway.row.tokens}
              prompt={gateway.row.prompt_tokens}
              completion={gateway.row.completion_tokens}
              share={gateway.row.token_share}
              formatNumber={formatNumber}
            />
          </>
        ) : gateway?.kind === "customer" ? (
          <>
            <p className="broker-role">{t("broker.viaOpenBroker")}</p>
            <p className="broker-note">
              {t("broker.viaOpenBrokerBody", { org: gateway.org.org_name })}
            </p>
            <VolumeGrid
              inferences={gateway.org.requests}
              confirmed={null}
              tokens={gateway.org.total_tokens}
              prompt={gateway.org.prompt_tokens}
              completion={gateway.org.completion_tokens}
              share={null}
              formatNumber={formatNumber}
            />
          </>
        ) : (
          <>
            <p className="broker-role">{t("broker.notOperator")}</p>
            <p className="broker-note">{t("broker.notOperatorBody")}</p>
            <a
              className="broker-docs"
              href="https://openbroker.gonka.gg/docs/overview"
              target="_blank"
              rel="noreferrer"
            >
              {t("broker.howItWorks")}
            </a>
          </>
        )}
        <a
          className="broker-all-stats"
          href="https://gonka.gg/network/inference?tab=inference"
          target="_blank"
          rel="noreferrer"
        >
          {t("broker.allStats")}
        </a>
      </section>

      {provider.ai_summary ? (
        <section className="broker-panel-card">
          <h2>{t("network.aiBrokerTitle")}</h2>
          <p className="broker-summary">{provider.ai_summary}</p>
        </section>
      ) : null}

      <section className="broker-panel-card">
        <h2>{t("providers.models")}</h2>
        {provider.models.length === 0 ? (
          <p className="broker-note">{t("providers.noMeasurements")}</p>
        ) : (
          <div className="limits-matrix">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t("providers.models")}</th>
                  <th scope="col">{t("logs.status")}</th>
                  <th scope="col">{glanceLabel("failed_probes", t)}</th>
                  <th scope="col">{glanceLabel("latency", t)}</th>
                  <th scope="col">{glanceLabel("output_speed", t)}</th>
                </tr>
              </thead>
              <tbody>
                {provider.models.map((model) => {
                  const modelTone = model.deprecated ? "warn" : healthFromMetrics(model.metrics);
                  const byKey = new Map(model.metrics.map((metric) => [metric.key, metric]));
                  return (
                    <tr key={model.model}>
                      <th scope="row">
                        <a href={providerModelPath(provider.broker_name, provider.broker_id, model.model)}>
                          {model.label}
                        </a>
                      </th>
                      <td>
                        <span className={`health-badge tone-${modelTone}`}>
                          {model.deprecated ? t("models.deprecated") : healthLabel(modelTone, t)}
                        </span>
                      </td>
                      <td>{byKey.get("failed_probes")?.value ?? "—"}</td>
                      <td>{byKey.get("latency")?.value ?? "—"}</td>
                      <td>{byKey.get("output_speed")?.value ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {limitProvider && limitProvider.models.length > 0 ? (
        <section className="broker-panel-card">
          <h2>{t("tabs.limits")}</h2>
          <div className="limits-matrix">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t("providers.models")}</th>
                  <th scope="col">{t("limits.maxContext")}</th>
                  <th scope="col">{t("limits.maxOutput")}</th>
                </tr>
              </thead>
              <tbody>
                {limitProvider.models.map((model) => (
                  <tr key={model.model}>
                    <th scope="row">
                      <a href={limitsPath(provider.broker_name, provider.broker_id, model.model)}>
                        {model.label}
                      </a>
                    </th>
                    <td>{model.max_input_k > 0 ? t("limits.kTokens", { count: model.max_input_k }) : "—"}</td>
                    <td>
                      {model.max_output_tokens > 0
                        ? t("limits.tokens", { count: formatNumber(model.max_output_tokens) })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function VolumeGrid({
  inferences,
  confirmed,
  tokens,
  prompt,
  completion,
  share,
  formatNumber,
}: {
  inferences: number | null;
  confirmed: number | null;
  tokens: number;
  prompt: number;
  completion: number;
  share: number | null;
  formatNumber: (value: number) => string;
}) {
  const { t } = useI18n();
  return (
    <div className="broker-stat-grid">
      {inferences != null ? (
        <article className="broker-stat">
          <span>{t("broker.inferences")}</span>
          <strong>{compactCount(inferences, formatNumber)}</strong>
        </article>
      ) : null}
      {confirmed != null ? (
        <article className="broker-stat">
          <span>{t("broker.confirmed")}</span>
          <strong>{compactCount(confirmed, formatNumber)}</strong>
        </article>
      ) : null}
      <article className="broker-stat">
        <span>{t("broker.tokens")}</span>
        <strong>{compactCount(tokens, formatNumber)}</strong>
      </article>
      <article className="broker-stat">
        <span>{t("broker.promptTokens")}</span>
        <strong>{compactCount(prompt, formatNumber)}</strong>
      </article>
      <article className="broker-stat">
        <span>{t("broker.completionTokens")}</span>
        <strong>{compactCount(completion, formatNumber)}</strong>
      </article>
      {share != null ? (
        <article className="broker-stat">
          <span>{t("broker.tokenShare")}</span>
          <strong>{percent(share)}</strong>
        </article>
      ) : null}
    </div>
  );
}

function visitUrl(provider: ProviderBlock) {
  const entry = findDirectoryEntryForProbe(provider.base_url, provider.broker_name);
  return entry?.siteUrl || brokerWebsiteUrl(provider.broker_name, provider.base_url);
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function compactCount(value: number, formatNumber: (value: number) => string) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  return formatNumber(value);
}
