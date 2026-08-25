import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import {
  BROKER_DIRECTORY,
  GONKA_QUICKSTART_URL,
  brokersWithHostedChat,
  findDirectoryEntryForProbe,
  youtubeEmbedUrl,
  type BrokerDirectoryEntry,
} from "../brokerDirectory";
import {
  buildModelPricingStats,
  formatMultiplier,
} from "../pricingStats";
import {
  compareProviderRank,
  displayMetricValueCompact,
  healthFromMetrics,
  healthLabel,
  providerScore,
} from "../metrics";
import type { DashboardDetail, MetricBlock, PricingComparison, ProviderBlock } from "../types";
import { CompareChrome } from "./CompareChrome";
import { useI18n } from "../i18n";
import "../compare.css";

const STEPS = [1, 2, 3, 4] as const;
const STEP_LABELS = ["start.step1Short", "start.step2Short", "start.step3Short", "start.step4Short"] as const;

const IDE_TOOLS = [
  { name: "Cursor", hintKey: "start.tools.cursor" as const },
  { name: "Cline", hintKey: "start.tools.cline" as const },
  { name: "Windsurf", hintKey: "start.tools.windsurf" as const },
  { name: "Claude Code", hintKey: "start.tools.claude" as const },
];

function metricByKey(metrics: MetricBlock[], key: string) {
  return metrics.find((item) => item.key === key);
}

interface BrokerOption {
  entry: BrokerDirectoryEntry;
  provider: ProviderBlock | null;
}

function mergeBrokers(providers: ProviderBlock[]): BrokerOption[] {
  const used = new Set<string>();
  const bestByEntry = new Map<string, BrokerOption>();

  for (const provider of providers) {
    const entry =
      findDirectoryEntryForProbe(provider.base_url, provider.broker_name) ??
      ({
        id: `probe-${provider.broker_id}`,
        name: provider.broker_name,
        siteUrl: provider.base_url.replace(/\/v1\/?$/, "/"),
        apiBaseUrl: provider.base_url.endsWith("/v1")
          ? provider.base_url
          : `${provider.base_url.replace(/\/$/, "")}/v1`,
        matchHosts: [new URL(provider.base_url).hostname],
      } satisfies BrokerDirectoryEntry);

    const existing = bestByEntry.get(entry.id);
    if (
      !existing?.provider ||
      providerScore(provider.metrics) > providerScore(existing.provider.metrics)
    ) {
      bestByEntry.set(entry.id, { entry, provider });
    }
    used.add(entry.id);
  }

  const probed = [...bestByEntry.values()].sort((a, b) => {
    const rank = compareProviderRank(a.entry.name) - compareProviderRank(b.entry.name);
    if (rank !== 0) return rank;
    if (a.provider && b.provider) {
      return providerScore(b.provider.metrics) - providerScore(a.provider.metrics);
    }
    return a.provider ? -1 : 1;
  });

  const rest = BROKER_DIRECTORY.filter((entry) => !used.has(entry.id))
    .map((entry) => ({ entry, provider: null }))
    .sort((a, b) => compareProviderRank(a.entry.name) - compareProviderRank(b.entry.name));

  return [...probed, ...rest];
}

function brokerCostLabel(metric: MetricBlock | null | undefined): string | null {
  if (!metric?.raw.pricing_available || metric.raw.real_spend_per_m == null) return null;
  return displayMetricValueCompact(metric);
}

export function GetStartedPage() {
  const { t, formatNumber } = useI18n();
  const [detail, setDetail] = useState<DashboardDetail | null>(null);
  const [comparison, setComparison] = useState<PricingComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const stepContentRef = useRef<HTMLDivElement>(null);
  const skipStepScrollRef = useRef(true);
  const [selectedId, setSelectedId] = useState<string>(() => {
    return sessionStorage.getItem("gmeter-selected-broker") ?? "";
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getDashboardDetail(), api.getPricingComparison()])
      .then(([dashboard, pricing]) => {
        if (!cancelled) {
          setDetail(dashboard);
          setComparison(pricing);
        }
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const brokers = useMemo(() => mergeBrokers(detail?.providers ?? []), [detail]);
  const hostedChatBrokers = useMemo(() => brokersWithHostedChat(), []);

  const selected =
    brokers.find((item) => item.entry.id === selectedId) ??
    brokers.find((item) => item.provider) ??
    brokers[0];

  useEffect(() => {
    if (selected && !selectedId) {
      setSelectedId(selected.entry.id);
    }
  }, [selected, selectedId]);

  const selectBroker = (id: string) => {
    setSelectedId(id);
    sessionStorage.setItem("gmeter-selected-broker", id);
  };

  const scrollToStepContent = useCallback(() => {
    stepContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const goToStep = useCallback(
    (next: number) => {
      if (next === step) {
        scrollToStepContent();
        return;
      }
      setStep(next);
    },
    [step, scrollToStepContent]
  );

  useEffect(() => {
    if (skipStepScrollRef.current) {
      skipStepScrollRef.current = false;
      return;
    }
    scrollToStepContent();
  }, [step, scrollToStepContent]);

  const selectedEntry = selected?.entry;
  const selectedProvider = selected?.provider ?? null;
  const embedUrl = selectedEntry?.demoUrl ? youtubeEmbedUrl(selectedEntry.demoUrl) : null;
  const apiBase =
    selectedEntry?.apiBaseUrl ??
    (selectedProvider?.base_url.endsWith("/v1")
      ? selectedProvider.base_url
      : selectedProvider
        ? `${selectedProvider.base_url.replace(/\/$/, "")}/v1`
        : "");

  const exampleModel =
    selectedProvider?.models_configured[0] ??
    selectedProvider?.models[0]?.model ??
    "Qwen/Qwen3-235B-A22B-Instruct-2507-FP8";

  const aggregate = detail?.aggregate;
  const priceHighlight = useMemo(() => {
    const times = (comparison?.models ?? [])
      .map((model) =>
        buildModelPricingStats(
          model,
          detail ?? { aggregate: {} as DashboardDetail["aggregate"], providers: [] },
          formatNumber
        ).cheaperTimes
      )
      .filter((value): value is number => value != null && value > 1.05);
    if (!times.length) return "100×+";
    const avg = times.reduce((sum, value) => sum + value, 0) / times.length;
    return formatMultiplier(avg, formatNumber) ?? "100×+";
  }, [comparison, detail, formatNumber]);
  const uptimeHighlight = aggregate ? `${Math.round(aggregate.api_uptime_pct)}%` : "—";
  const heroChatUrl =
    selectedEntry?.chatUrl ?? hostedChatBrokers[0]?.chatUrl ?? "https://proxy.gonka.gg/chat";
  const heroTitleAccent = priceHighlight.includes("×")
    ? t("start.titleLine2", { times: priceHighlight })
    : t("start.titleLine2Fallback");

  return (
    <CompareChrome ctaHref="/compare">
      <main className="start-page">
        <div className="start-hero start-hero-selling">
          <p className="start-kicker">{t("start.kicker")}</p>
          <h1>
            {t("start.titleLine1")}
            <br />
            <span className="compare-hero-accent">{heroTitleAccent}</span>
          </h1>
          <p className="start-lead">{t("start.lead")}</p>
          <div className="start-hero-actions">
            <button
              type="button"
              className="compare-btn compare-btn-primary"
              onClick={() => goToStep(1)}
            >
              {t("start.step1Short")}
            </button>
            <a className="compare-btn compare-btn-ghost" href={heroChatUrl} target="_blank" rel="noreferrer">
              {t("start.heroTryChat")}
            </a>
            <a className="compare-btn compare-btn-ghost" href="/">
              {t("start.heroSeePrices")}
            </a>
          </div>
        </div>

        <div className="start-value-strip">
          <div className="start-value-card">
            <span className="start-value-icon">↓</span>
            <strong>{priceHighlight}</strong>
            <span>{t("start.valuePrice")}</span>
          </div>
          <div className="start-value-card">
            <span className="start-value-icon">◎</span>
            <strong>{uptimeHighlight}</strong>
            <span>{t("start.valueStability")}</span>
          </div>
          <div className="start-value-card">
            <span className="start-value-icon">⇄</span>
            <strong>{t("start.valueMigrationShort")}</strong>
            <span>{t("start.valueMigration")}</span>
          </div>
        </div>

        <div ref={stepContentRef} className="start-step-anchor">
        <div className="start-stepper">
          {STEPS.map((n, index) => (
            <button
              key={n}
              type="button"
              className={`start-step-pill ${step === n ? "active" : step > n ? "done" : ""}`}
              onClick={() => goToStep(n)}
            >
              <span className="start-step-num">{n}</span>
              <span>{t(STEP_LABELS[index])}</span>
            </button>
          ))}
        </div>

        <div className="start-panel">
          {step === 1 ? (
            <section className="start-section">
              <header className="start-section-head">
                <h2>{t("start.step1Title")}</h2>
                <p>{t("start.step1Sub")}</p>
              </header>
              <div className="start-callout">{t("start.step1Callout")}</div>
              {loading ? (
                <p className="start-muted">{t("compare.loading")}</p>
              ) : (
                <div className="start-broker-grid">
                  {brokers.map(({ entry, provider }) => {
                    const tone = provider ? healthFromMetrics(provider.metrics) : null;
                    const uptime = provider ? metricByKey(provider.metrics, "api_uptime") : null;
                    const latency = provider ? metricByKey(provider.metrics, "latency") : null;
                    const speed = provider ? metricByKey(provider.metrics, "output_speed") : null;
                    const cost = provider ? metricByKey(provider.metrics, "real_spend") : null;
                    const isSelected = selectedId === entry.id;

                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={`start-broker-card ${isSelected ? "selected" : ""}`}
                        onClick={() => selectBroker(entry.id)}
                      >
                        <div className="start-broker-card-top">
                          <strong>{entry.name}</strong>
                          {tone ? (
                            <span className={`compare-health ${tone}`}>{healthLabel(tone, t)}</span>
                          ) : (
                            <span className="start-broker-unprobed">{t("start.notProbed")}</span>
                          )}
                        </div>
                        {entry.chatUrl ? (
                          <span className="start-broker-badge">{t("start.hasHostedChat")}</span>
                        ) : null}
                        {provider ? (
                          <div className="start-broker-stats">
                            <span>
                              {t("glance.uptime")}:{" "}
                              {uptime ? displayMetricValueCompact(uptime) : "—"}
                            </span>
                            <span>
                              {t("glance.latency")}:{" "}
                              {latency ? displayMetricValueCompact(latency) : "—"}
                            </span>
                            <span>
                              {t("glance.output")}:{" "}
                              {speed ? displayMetricValueCompact(speed) : "—"}
                            </span>
                            {brokerCostLabel(cost) ? (
                              <span>
                                {t("glance.cost")}: {brokerCostLabel(cost)}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <p className="start-broker-note">{t("start.communityBroker")}</p>
                        )}
                        <div className="start-broker-links">
                          <a
                            href={entry.siteUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {t("start.visitSite")}
                          </a>
                          {entry.demoUrl ? (
                            <a
                              href={entry.demoUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                            >
                              ▶ {t("start.watchDemo")}
                            </a>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="start-footnote">{t("start.brokerDisclaimer")}</p>
            </section>
          ) : null}

          {step === 2 && selectedEntry ? (
            <section className="start-section">
              <header className="start-section-head">
                <h2>{t("start.step2Title")}</h2>
                <p>{t("start.step2Sub", { broker: selectedEntry.name })}</p>
              </header>
              <div className="start-callout">{t("start.step2Callout")}</div>

              <div className="start-docs-layout">
                {embedUrl ? (
                  <div className="start-video-wrap">
                    <iframe
                      src={embedUrl}
                      title={`${selectedEntry.name} demo`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : selectedEntry.demoUrl ? (
                  <a className="start-demo-link" href={selectedEntry.demoUrl} target="_blank" rel="noreferrer">
                    ▶ {t("start.openDemo")}
                  </a>
                ) : null}

                <div className="start-docs-card">
                  <h3>{t("start.quickstartTitle")}</h3>
                  <ol className="start-checklist">
                    <li>{t("start.quickstart1")}</li>
                    <li>{t("start.quickstart2")}</li>
                    <li>{t("start.quickstart3")}</li>
                  </ol>
                  <div className="start-docs-actions">
                    <a
                      className="compare-btn compare-btn-primary"
                      href={selectedEntry.docsUrl ?? selectedEntry.siteUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("start.brokerDocs", { broker: selectedEntry.name })}
                    </a>
                    <a
                      className="start-inline-link"
                      href={GONKA_QUICKSTART_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("start.openFullDocs")} →
                    </a>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {step === 3 && selectedEntry ? (
            <section className="start-section">
              <header className="start-section-head">
                <h2>{t("start.step3Title")}</h2>
                <p>{t("start.step3Sub")}</p>
              </header>
              <div className="start-callout">{t("start.step3Callout")}</div>

              <div className="start-config-grid">
                <div className="start-config-item">
                  <span>{t("start.fieldBaseUrl")}</span>
                  <code>{apiBase || selectedEntry.siteUrl}</code>
                </div>
                <div className="start-config-item">
                  <span>{t("start.fieldApiKey")}</span>
                  <code>{t("start.fieldApiKeyHint")}</code>
                </div>
                <div className="start-config-item">
                  <span>{t("start.fieldModel")}</span>
                  <code>{exampleModel}</code>
                </div>
              </div>

              <div className="start-code-block">
                <div className="start-code-head">
                  <h3>{t("start.toolsCodeTitle")}</h3>
                  <a
                    className="start-inline-link"
                    href={`${GONKA_QUICKSTART_URL}#14-send-your-first-request-on-gonka`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("start.sdkExamples")} →
                  </a>
                </div>
                <pre className="start-code">{`curl ${apiBase || "https://<broker>/v1"}/chat/completions \\
  -H "Authorization: Bearer $GONKA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${exampleModel}","messages":[{"role":"user","content":"Hello!"}]}'`}</pre>
              </div>

              <div className="start-ide-section">
                <h3>{t("start.toolsIdeTitle")}</h3>
                <p className="start-ide-lead">{t("start.toolsIdeLead")}</p>
                <div className="start-ide-grid">
                  {IDE_TOOLS.map((tool) => (
                    <div key={tool.name} className="start-ide-card">
                      <strong>{tool.name}</strong>
                      <p>{t(tool.hintKey)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="start-section">
              <header className="start-section-head">
                <h2>{t("start.step4Title")}</h2>
                <p>{t("start.step4Sub")}</p>
              </header>
              <div className="start-callout start-callout-coral">{t("start.step4Callout")}</div>

              {selectedEntry?.chatUrl ? (
                <a
                  className="start-chat-hero"
                  href={selectedEntry.chatUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="start-chat-hero-kicker">{selectedEntry.name}</span>
                  <strong>{t("start.openBrokerChat")}</strong>
                  <span>
                    {selectedEntry.chatNoteKey ? t(selectedEntry.chatNoteKey) : t("start.chatDefaultNote")}
                  </span>
                </a>
              ) : (
                <div className="start-chat-missing">
                  <p>{t("start.noChatForBroker", { broker: selectedEntry?.name ?? "broker" })}</p>
                </div>
              )}

              <div className="start-hosted-chat-section">
                <h3>{t("start.hostedChatTitle")}</h3>
                <p className="start-hosted-chat-lead">{t("start.hostedChatLead")}</p>
                <div className="start-hosted-chat-grid">
                  {hostedChatBrokers.map((entry) => {
                    const isSelected = entry.id === selectedId;
                    return (
                      <a
                        key={entry.id}
                        className={`start-hosted-chat-card ${isSelected ? "selected" : ""}`}
                        href={entry.chatUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <div className="start-hosted-chat-top">
                          <strong>{entry.name}</strong>
                          {isSelected ? <span className="start-broker-badge">{t("start.yourPick")}</span> : null}
                        </div>
                        <p>{entry.chatNoteKey ? t(entry.chatNoteKey) : t("start.chatDefaultNote")}</p>
                        <span className="start-hosted-chat-cta">{t("start.tryFreeChat")} →</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <div className="start-nav-row">
          <button
            type="button"
            className="compare-btn compare-btn-ghost"
            disabled={step <= 1}
            onClick={() => goToStep(Math.max(1, step - 1))}
          >
            {t("start.back")}
          </button>
          {step < 4 ? (
            <button
              type="button"
              className="compare-btn compare-btn-primary"
              onClick={() => goToStep(Math.min(4, step + 1))}
            >
              {t("start.next")}
            </button>
          ) : (
            <a
              className="compare-btn compare-btn-primary"
              href={selectedEntry?.chatUrl ?? selectedEntry?.siteUrl ?? GONKA_QUICKSTART_URL}
              target="_blank"
              rel="noreferrer"
            >
              {selectedEntry?.chatUrl ? t("start.tryFreeChat") : t("start.finish")}
            </a>
          )}
        </div>
        </div>
      </main>
    </CompareChrome>
  );
}
