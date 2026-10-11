import { matchGateway } from "../src/gatewayMatch";
import type { GatewayStatsRow } from "../src/types";

const API = "https://gmeter-production.up.railway.app";
const TTL_MS = 5 * 60 * 1000;

export interface ShareStat {
  label: string;
  value: string;
}

export interface ShareCard {
  path: string;
  title: string;
  description: string;
  kicker: string;
  kickerColor: string;
  headline: string;
  sub: string;
  stats: ShareStat[];
  foot: string;
}

interface SlimProvider {
  id: number;
  name: string;
  host: string;
  baseUrl: string;
  uptime: string;
  failed: string;
  latency: string;
  output: string;
  uptimePct: number | null;
  failedPct: number | null;
  latencyS: number | null;
  checked: string | null;
  models: Array<{
    id: string;
    label: string;
    uptime: string;
    failed: string;
    latency: string;
    output: string;
    uptimePct: number | null;
    failedPct: number | null;
    latencyS: number | null;
  }>;
}

interface Snapshot {
  at: number;
  aggregate: {
    uptime: string;
    failed: string;
    latency: string;
    output: string;
    runs: number;
  };
  providers: SlimProvider[];
  gateways: GatewayStatsRow[];
}

let snapshot: Snapshot | null = null;
let loading: Promise<Snapshot> | null = null;

const BOT =
  /bot\b|crawler|spider|slurp|facebookexternalhit|facebot|embedly|quora|pinterest|vkshare|whatsapp|telegram|slack|discord|linkedin|applebot|iframely|skypeuripreview|viber|kakaotalk|mastodon|bsky/i;

export function isShareBot(userAgent: string) {
  return BOT.test(userAgent);
}

export function pagePathFromOg(pathname: string): string | null {
  const match = pathname.match(/^\/og(\/.*)?\/image\.(png|jpe?g)$/);
  if (!match) return null;
  return match[1] || "/";
}

export function ogImagePath(pagePath: string) {
  const clean = pagePath === "/" ? "" : pagePath.replace(/\/$/, "");
  return `/og${clean}/image.png?v=4`;
}

export async function buildShare(pathname: string): Promise<ShareCard> {
  const path = normalizePath(pathname);
  try {
    return await cardFor(path);
  } catch {
    return baseCard(path, {
      kicker: "meter",
      kickerColor: "#3dd68c",
      headline: titleCase(path === "/" ? "Overview" : path.split("/").filter(Boolean).slice(-1)[0] || "Meter"),
      sub: "Gonka network observability",
      stats: [],
      foot: `meter.gonka.gg${path === "/" ? "" : path}`,
    });
  }
}

export function shareMeta(card: ShareCard, pageUrl: string, imageUrl: string) {
  const title = esc(card.title);
  const description = esc(card.description);
  const image = esc(imageUrl);
  const url = esc(pageUrl);
  return `<title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="meter.gonka.gg" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:secure_url" content="${image}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${title}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />`;
}

export function injectShare(html: string, card: ShareCard, pageUrl: string, imageUrl: string) {
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta[^>]+property=["']og:[^"']+["'][^>]*>/gi, "")
    .replace(/<meta[^>]+name=["']twitter:[^"']+["'][^>]*>/gi, "")
    .replace(/<meta[^>]+name=["']description["'][^>]*>/gi, "")
    .replace(/<link[^>]+rel=["']canonical["'][^>]*>/gi, "");
  const meta = shareMeta(card, pageUrl, imageUrl);
  if (/<head[^>]*>/i.test(stripped)) {
    return stripped.replace(/<head[^>]*>/i, (open) => `${open}\n${meta}`);
  }
  return `${meta}\n${stripped}`;
}

export function shareHtml(card: ShareCard, pageUrl: string, imageUrl: string) {
  const url = esc(pageUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${shareMeta(card, pageUrl, imageUrl)}
</head>
<body>
  <p><a href="${url}">Open this page on meter.gonka.gg</a></p>
</body>
</html>`;
}

async function cardFor(path: string): Promise<ShareCard> {
  const route = parsePath(path);
  const data = await loadSnapshot();
  const provider = route.brokerId == null ? null : data.providers.find((item) => item.id === route.brokerId) || null;

  if (route.name === "overview") {
    const counts = countStatus(data.providers);
    const headline = `${counts.healthy} healthy`;
    const sub = [counts.degraded && `${counts.degraded} degraded`, counts.down && `${counts.down} down`, `${data.providers.length} providers`]
      .filter(Boolean)
      .join(" · ");
    return baseCard(path, {
      kicker: "network",
      kickerColor: "#3dd68c",
      headline,
      sub,
      stats: aggregateStats(data),
      foot: "meter.gonka.gg",
    });
  }

  if (route.name === "broker" || route.name === "providers" && provider) {
    return providerCard(path, provider, data, route.model, route.logs ? "probe logs" : route.name === "broker" ? "broker" : "provider");
  }

  if (route.name === "providers") {
    const counts = countStatus(data.providers);
    return baseCard(path, {
      kicker: "providers",
      kickerColor: "#b5b5be",
      headline: `${data.providers.length} providers`,
      sub: `${counts.healthy} healthy · ${counts.degraded} degraded · ${counts.down} down`,
      stats: aggregateStats(data),
      foot: "meter.gonka.gg/providers",
    });
  }

  if (route.name === "trends") {
    return baseCard(path, {
      kicker: "trends",
      kickerColor: "#b5b5be",
      headline: route.model || "All models",
      sub: "Latency, uptime, failed probes, and output",
      stats: aggregateStats(data),
      foot: `meter.gonka.gg${path}`,
    });
  }

  if (route.name === "limits") {
    return provider
      ? providerCard(path, provider, data, route.model, "limits")
      : baseCard(path, {
          kicker: "limits",
          kickerColor: "#ffb020",
          headline: "Context and output",
          sub: `${data.providers.length} providers`,
          stats: aggregateStats(data),
          foot: "meter.gonka.gg/limits",
        });
  }

  if (route.name === "compare") {
    return baseCard(path, {
      kicker: "prices",
      kickerColor: "#3dd68c",
      headline: "Gonka vs the market",
      sub: "USD per 1M tokens, input and output",
      stats: aggregateStats(data),
      foot: "meter.gonka.gg/compare",
    });
  }

  if (route.name === "history") {
    return historyCard(path, route.runId, route.resultId);
  }

  if (route.name === "metric" && provider) {
    const metric = providerMetric(provider, route.metricKey);
    const tone = toneOf(provider);
    return baseCard(path, {
      kicker: metric?.label || route.metricKey || "metric",
      kickerColor: tone.color,
      headline: metric?.value || provider.name,
      sub: provider.name,
      stats: providerStats(provider, data),
      foot: stamp(provider.checked) || provider.host,
    });
  }

  return baseCard(path, {
    kicker: "meter",
    kickerColor: "#3dd68c",
    headline: "Gonka network status",
    sub: "Live probes across public brokers",
    stats: aggregateStats(data),
    foot: `meter.gonka.gg${path === "/" ? "" : path}`,
  });
}

function providerCard(
  path: string,
  provider: SlimProvider | null,
  data: Snapshot,
  model: string | null,
  kicker: string,
): ShareCard {
  if (!provider) {
    return baseCard(path, {
      kicker,
      kickerColor: "#9a9aa3",
      headline: "Broker",
      sub: "Not in the current meter lineup",
      stats: [],
      foot: `meter.gonka.gg${path}`,
    });
  }
  const modelRow = model ? provider.models.find((item) => item.id === model || item.label === model) : null;
  const tone = modelRow
    ? toneFrom(modelRow.uptimePct, modelRow.failedPct, modelRow.latencyS)
    : toneOf(provider);
  const volume = volumeFor(provider, data.gateways);
  const stats = modelRow
    ? [
        { label: "uptime", value: modelRow.uptime },
        { label: "failed", value: modelRow.failed },
        { label: "latency", value: modelRow.latency },
        { label: "output", value: modelRow.output },
      ]
    : providerStats(provider, data);
  if (volume && !modelRow) stats[3] = { label: "tokens", value: volume };
  return baseCard(path, {
    kicker: modelRow ? `${kicker} · ${tone.label}` : tone.label,
    kickerColor: tone.color,
    headline: modelRow ? modelRow.label : provider.name,
    sub: modelRow ? provider.name : provider.host,
    stats,
    foot: stamp(provider.checked) || provider.host,
  });
}

async function historyCard(path: string, runId: number | null, resultId: number | null): Promise<ShareCard> {
  if (runId == null) {
    return baseCard(path, {
      kicker: "history",
      kickerColor: "#b5b5be",
      headline: "Probe runs",
      sub: "Quick checks and limit runs",
      stats: [],
      foot: "meter.gonka.gg/history",
    });
  }
  const run = await loadRun(runId);
  const headline = resultId != null ? `Result #${resultId}` : `Run #${runId}`;
  return baseCard(path, {
    kicker: run?.status || "history",
    kickerColor: run?.status === "completed" ? "#3dd68c" : run?.status === "failed" ? "#ff5d73" : "#ffb020",
    headline,
    sub: [run?.type, run?.broker].filter(Boolean).join(" · ") || "Probe run",
    stats: run?.stats || [],
    foot: stamp(run?.started || null) || `meter.gonka.gg/history/${runId}`,
  });
}

function baseCard(path: string, parts: Omit<ShareCard, "path" | "title" | "description">): ShareCard {
  const title = `${parts.headline} | meter.gonka.gg`;
  const description = [parts.kicker, parts.sub, ...parts.stats.map((stat) => `${stat.value} ${stat.label}`)]
    .filter(Boolean)
    .join(" · ");
  return { path, title, description, ...parts };
}

function aggregateStats(data: Snapshot): ShareStat[] {
  return [
    { label: "uptime", value: data.aggregate.uptime },
    { label: "failed", value: data.aggregate.failed },
    { label: "latency", value: data.aggregate.latency },
    { label: "output", value: data.aggregate.output },
  ];
}

function providerStats(provider: SlimProvider, data: Snapshot): ShareStat[] {
  const volume = volumeFor(provider, data.gateways);
  return [
    { label: "uptime", value: provider.uptime },
    { label: "failed", value: provider.failed },
    { label: "latency", value: provider.latency },
    volume ? { label: "tokens", value: volume } : { label: "output", value: provider.output },
  ];
}

function volumeFor(provider: SlimProvider, rows: GatewayStatsRow[]) {
  const match = matchGateway(provider.name, provider.baseUrl, rows);
  const tokens = match?.kind === "gateway" ? match.row.tokens : match?.kind === "customer" ? match.org.total_tokens : null;
  return tokens ? compact(tokens) : null;
}

function countStatus(providers: SlimProvider[]) {
  const counts = { healthy: 0, degraded: 0, down: 0 };
  for (const provider of providers) {
    const tone = toneOf(provider).label;
    if (tone === "down") counts.down += 1;
    else if (tone === "degraded") counts.degraded += 1;
    else counts.healthy += 1;
  }
  return counts;
}

function toneOf(provider: SlimProvider) {
  return toneFrom(provider.uptimePct, provider.failedPct, provider.latencyS);
}

function toneFrom(uptime: number | null, failed: number | null, latency: number | null) {
  if (uptime === 0 && (failed == null || failed > 0)) return { label: "down", color: "#ff5d73" };
  if ((failed != null && failed > 5) || (uptime != null && uptime < 95) || (latency != null && latency > 10)) {
    return { label: "degraded", color: "#ffb020" };
  }
  if (uptime == null && failed == null) return { label: "meter", color: "#3dd68c" };
  return { label: "healthy", color: "#3dd68c" };
}

function providerMetric(provider: SlimProvider, key: string | null) {
  if (!key) return null;
  const labels: Record<string, string> = {
    api_uptime: "uptime",
    failed_probes: "failed",
    latency: "latency",
    output_speed: "output",
    real_world_gen: "caps",
    real_spend: "cost",
  };
  const value =
    key === "api_uptime"
      ? provider.uptime
      : key === "failed_probes"
        ? provider.failed
        : key === "latency"
          ? provider.latency
          : key === "output_speed"
            ? provider.output
            : "—";
  return { label: labels[key] || key, value };
}

async function loadSnapshot(): Promise<Snapshot> {
  if (snapshot && Date.now() - snapshot.at < TTL_MS) return snapshot;
  if (!loading) {
    loading = fetchSnapshot().finally(() => {
      loading = null;
    });
  }
  return loading;
}

async function fetchSnapshot(): Promise<Snapshot> {
  const [detailRes, gatewayRes] = await Promise.all([
    fetch(`${API}/api/metrics/dashboard/detail`, { signal: AbortSignal.timeout(4000) }),
    fetch(`${API}/api/metrics/gateways?hours=24`, { signal: AbortSignal.timeout(4000) }).catch(() => null),
  ]);
  if (!detailRes.ok) throw new Error("dashboard unavailable");
  const detail = await detailRes.json();
  const gateways = gatewayRes && gatewayRes.ok ? ((await gatewayRes.json()).rows || []) : snapshot?.gateways || [];
  const aggregate = detail.aggregate || {};
  const next: Snapshot = {
    at: Date.now(),
    aggregate: {
      uptime: num(aggregate.api_uptime_pct, "%"),
      failed: num(aggregate.failed_probes_pct, "%"),
      latency: num(aggregate.latency_s, "s"),
      output: num(aggregate.output_speed_tps, " tps"),
      runs: Number(aggregate.total_runs || 0),
    },
    providers: (detail.providers || []).map(slimProvider),
    gateways,
  };
  snapshot = next;
  return next;
}

async function loadRun(id: number) {
  const response = await fetch(`${API}/api/runs/${id}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const run = await response.json();
  const summary = run.summary && !Array.isArray(run.summary) ? run.summary : {};
  const broker = snapshot?.providers.find((item) => item.id === run.broker_id);
  const stats: ShareStat[] = [];
  if (summary.api_uptime_pct != null) stats.push({ label: "uptime", value: num(summary.api_uptime_pct, "%") });
  if (summary.failed_probes_pct != null) stats.push({ label: "failed", value: num(summary.failed_probes_pct, "%") });
  if (summary.latency_s != null) stats.push({ label: "latency", value: num(summary.latency_s, "s") });
  return {
    status: String(run.status || "run"),
    type: String(run.run_type || "probe"),
    broker: broker?.name || (run.broker_id != null ? `broker ${run.broker_id}` : ""),
    started: run.started_at ? String(run.started_at) : null,
    stats,
  };
}

function slimProvider(provider: any): SlimProvider {
  const raw = provider.metrics?.[0]?.raw || {};
  return {
    id: provider.broker_id,
    name: provider.broker_name,
    host: hostOf(provider.base_url),
    baseUrl: provider.base_url || "",
    uptime: textMetric(provider, "api_uptime", num(raw.api_uptime_pct, "%")),
    failed: textMetric(provider, "failed_probes", num(raw.failed_probes_pct, "%")),
    latency: textMetric(provider, "latency", num(raw.latency_s, "s")),
    output: textMetric(provider, "output_speed", num(raw.output_speed_tps, " tps")),
    uptimePct: numberOrNull(raw.api_uptime_pct),
    failedPct: numberOrNull(raw.failed_probes_pct),
    latencyS: numberOrNull(raw.latency_s),
    checked: provider.latest_run_at || null,
    models: (provider.models || []).map((model: any) => {
      const modelRaw = model.metrics?.[0]?.raw || {};
      return {
        id: model.model,
        label: model.label || model.model,
        uptime: textMetric(model, "api_uptime", num(modelRaw.api_uptime_pct, "%")),
        failed: textMetric(model, "failed_probes", num(modelRaw.failed_probes_pct, "%")),
        latency: textMetric(model, "latency", num(modelRaw.latency_s, "s")),
        output: textMetric(model, "output_speed", num(modelRaw.output_speed_tps, " tps")),
        uptimePct: numberOrNull(modelRaw.api_uptime_pct),
        failedPct: numberOrNull(modelRaw.failed_probes_pct),
        latencyS: numberOrNull(modelRaw.latency_s),
      };
    }),
  };
}

function textMetric(source: any, key: string, fallback: string) {
  const metric = (source.metrics || []).find((item: any) => item.key === key);
  return metric?.value || fallback;
}

function parsePath(pathname: string) {
  const parts = pathname.split("?")[0].replace(/\/+$/, "").split("/").filter(Boolean).map(decode);
  const [a, b, c, d, e] = parts;
  const brokerId = b ? idFromSlug(b) : null;
  if (parts.length === 0) return { name: "overview" as const, brokerId: null, model: null, logs: false, runId: null, resultId: null, metricKey: null };
  if (a === "trends") return { name: "trends" as const, brokerId: null, model: b === "models" ? c || null : null, logs: false, runId: null, resultId: null, metricKey: null };
  if (a === "providers") {
    return {
      name: "providers" as const,
      brokerId,
      model: c === "models" ? d || null : null,
      logs: e === "logs",
      runId: null,
      resultId: null,
      metricKey: null,
    };
  }
  if (a === "limits") return { name: "limits" as const, brokerId, model: c || null, logs: false, runId: null, resultId: null, metricKey: null };
  if (a === "history") {
    const runId = b && Number.isFinite(Number(b)) ? Number(b) : null;
    const resultId = c === "results" && d && Number.isFinite(Number(d)) ? Number(d) : null;
    return { name: "history" as const, brokerId: null, model: null, logs: false, runId, resultId, metricKey: null };
  }
  if (a === "metrics" && brokerId != null && c) {
    return { name: "metric" as const, brokerId, model: null, logs: false, runId: null, resultId: null, metricKey: c };
  }
  if (a === "compare") return { name: "compare" as const, brokerId: null, model: null, logs: false, runId: null, resultId: null, metricKey: null };
  if (a === "brokers" && brokerId != null) {
    return { name: "broker" as const, brokerId, model: null, logs: false, runId: null, resultId: null, metricKey: null };
  }
  return { name: "other" as const, brokerId: null, model: null, logs: false, runId: null, resultId: null, metricKey: null };
}

function idFromSlug(slug: string) {
  const match = slug.match(/-b(\d+)$/);
  return match ? Number(match[1]) : null;
}

function normalizePath(pathname: string) {
  const path = pathname.split("?")[0].replace(/\/+$/, "");
  return path || "/";
}

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function hostOf(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value || "";
  }
}

function num(value: unknown, suffix: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  if (suffix === "%") return `${parsed.toFixed(parsed >= 10 && parsed % 1 === 0 ? 0 : 1)}%`;
  if (suffix === "s") return `${parsed.toFixed(2)}s`;
  if (suffix === " tps") return `${parsed.toFixed(parsed >= 10 ? 0 : 1)} tps`;
  return String(parsed);
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compact(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  return String(Math.round(value));
}

function stamp(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${hh}:${mm} utc`;
}

function titleCase(value: string) {
  return decode(value).replace(/[-_]+/g, " ");
}

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
