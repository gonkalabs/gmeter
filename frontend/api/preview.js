// src/brokerDirectory.ts
var BROKER_DIRECTORY = [
  {
    id: "openbroker",
    name: "OpenBroker by Gonka Labs",
    siteUrl: "https://openbroker.gonka.gg/",
    apiBaseUrl: "https://api.openbroker.gonka.gg/v1",
    docsUrl: "https://openbroker.gonka.gg/docs",
    matchHosts: ["openbroker.gonka.gg", "api.openbroker.gonka.gg"]
  },
  {
    id: "proxy-gonka",
    name: "proxy.gonka.gg",
    siteUrl: "https://proxy.gonka.gg/",
    apiBaseUrl: "https://api.proxy.gonka.gg/v1",
    chatUrl: "https://proxy.gonka.gg/chat",
    chatNoteKey: "start.chatNote.proxy",
    demoUrl: "https://drive.google.com/file/d/1-Zk__4cY_ENi0Q8gw-JHgEBz6XZWXKAj/view",
    matchHosts: ["proxy.gonka.gg", "api.proxy.gonka.gg"]
  },
  {
    id: "gonkagate",
    name: "gonkagate.com",
    siteUrl: "https://gonkagate.com/",
    apiBaseUrl: "https://api.gonkagate.com/v1",
    chatUrl: "https://gonkagate.com/en/chat",
    chatNoteKey: "start.chatNote.gonkagate",
    matchHosts: ["gonkagate.com", "api.gonkagate.com"]
  },
  {
    id: "mingles",
    name: "router.mingles.ai",
    siteUrl: "https://router.mingles.ai/",
    apiBaseUrl: "https://gonka-gateway.mingles.ai/v1",
    chatUrl: "https://router.mingles.ai/chat",
    chatNoteKey: "start.chatNote.mingles",
    demoUrl: "https://youtu.be/gegiRnNMavY",
    matchHosts: ["mingles.ai", "router.mingles.ai", "gonka-gateway.mingles.ai"]
  },
  {
    id: "gonkascan",
    name: "router.gonkascan.com",
    siteUrl: "https://router.gonkascan.com/",
    apiBaseUrl: "https://api.gonkascan.com/v1",
    demoUrl: "https://youtu.be/1uWmLGPoBCM",
    chatUrl: "https://router.gonkascan.com/chat",
    chatNoteKey: "start.chatNote.gonkascan",
    matchHosts: ["gonkascan.com", "router.gonkascan.com", "api.gonkascan.com"]
  },
  {
    id: "gonka-api",
    name: "gonka-api.org",
    siteUrl: "https://gonka-api.org/",
    apiBaseUrl: "https://api.gonka-api.org/v1",
    demoUrl: "https://youtu.be/JgY2ikjcP9M",
    matchHosts: ["gonka-api.org", "api.gonka-api.org"]
  },
  {
    id: "hyperfusion",
    name: "console.hyperfusion.io",
    siteUrl: "https://console.hyperfusion.io/",
    apiBaseUrl: "https://api.hyperfusion.io/v1",
    matchHosts: ["hyperfusion.io", "console.hyperfusion.io", "api.hyperfusion.io"]
  },
  {
    id: "joingonka",
    name: "gate.joingonka.ai",
    siteUrl: "https://gate.joingonka.ai/",
    matchHosts: ["gate.joingonka.ai", "joingonka.ai"]
  },
  {
    id: "eterial",
    name: "eterial.ai",
    siteUrl: "https://eterial.ai/",
    apiBaseUrl: "https://chat.eterial.ai/v1",
    docsUrl: "https://eterial.ai/docs",
    matchHosts: ["eterial.ai", "chat.eterial.ai", "dashboard.eterial.ai"]
  },
  {
    id: "dahl",
    name: "inference.dahl.global",
    siteUrl: "https://inference.dahl.global",
    matchHosts: ["inference.dahl.global", "dahl.global"]
  },
  {
    id: "gonkabroker",
    name: "gonkabroker.com",
    siteUrl: "https://gonkabroker.com/",
    matchHosts: ["gonkabroker.com"]
  }
];
function hostOf(url) {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  }
}
function brokerMatchesHost(entry, probeUrl) {
  const host = hostOf(probeUrl);
  return entry.matchHosts.some(
    (fragment) => host === fragment || host.endsWith(`.${fragment}`) || fragment.endsWith(host)
  );
}
function findDirectoryEntryForProbe(probeUrl, probeName) {
  const byUrl = BROKER_DIRECTORY.find((entry) => brokerMatchesHost(entry, probeUrl));
  if (byUrl) return byUrl;
  if (!probeName) return void 0;
  const normalized = probeName.toLowerCase();
  return BROKER_DIRECTORY.find(
    (entry) => entry.name.toLowerCase() === normalized || entry.matchHosts.some((host) => normalized.includes(host.split(".")[0] ?? ""))
  );
}

// src/gatewayMatch.ts
var GENERIC = /* @__PURE__ */ new Set([
  "api",
  "app",
  "broker",
  "console",
  "gate",
  "global",
  "gonka",
  "https",
  "inference",
  "open",
  "proxy",
  "router",
  "www"
]);
function hostOf2(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
function hostsForBroker(name, baseUrl) {
  const hosts = /* @__PURE__ */ new Set();
  const add = (value) => {
    const host = value ? hostOf2(value) : null;
    if (host) hosts.add(host);
  };
  add(name);
  add(baseUrl);
  const entry = findDirectoryEntryForProbe(baseUrl, name);
  entry?.matchHosts.forEach((host) => add(host));
  add(entry?.siteUrl);
  add(entry?.apiBaseUrl);
  return [...hosts];
}
function hostsForGateway(row) {
  const hosts = /* @__PURE__ */ new Set();
  const add = (value) => {
    const host = value ? hostOf2(value) : null;
    if (host) hosts.add(host);
  };
  add(row.host);
  add(row.url);
  for (const part of (row.subtitle || "").split(/[·,]/)) add(part);
  return [...hosts];
}
function sameHost(left, right) {
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}
function overlaps(brokerHosts, row) {
  const gatewayHosts = hostsForGateway(row);
  return brokerHosts.some((host) => gatewayHosts.some((other) => sameHost(host, other)));
}
function scoreRow(brokerHosts, row) {
  const primary = hostOf2(row.host);
  let score = 0;
  if (primary && brokerHosts.some((host) => sameHost(host, primary))) score += 10;
  if (row.split_of) score += 6;
  const extras = hostsForGateway(row).filter((host) => !brokerHosts.some((item) => sameHost(item, host)));
  if (extras.length && !row.split_of) score -= 5 * extras.length;
  return score;
}
function matchGateway(name, baseUrl, rows) {
  const brokerHosts = hostsForBroker(name, baseUrl);
  const ranked = rows.filter((row) => overlaps(brokerHosts, row)).map((row) => ({ row, score: scoreRow(brokerHosts, row) })).filter((item) => item.score > 0).sort((left, right) => right.score - left.score);
  if (ranked[0]) return { kind: "gateway", row: ranked[0].row };
  const needles = /* @__PURE__ */ new Set();
  for (const host of brokerHosts) {
    for (const label of host.split(".")) {
      if (label.length >= 6 && !GENERIC.has(label)) needles.add(label);
    }
  }
  const compactName = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (compactName.length >= 6 && !GENERIC.has(compactName)) needles.add(compactName);
  for (const row of rows) {
    for (const org of row.brokers || []) {
      const compactOrg = org.org_name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if ([...needles].some((needle) => compactOrg.includes(needle))) {
        return { kind: "customer", row, org };
      }
    }
  }
  return null;
}

// share/preview.ts
var API = "https://gmeter-production.up.railway.app";
var TTL_MS = 5 * 60 * 1e3;
var snapshot = null;
var loading = null;
async function buildShare(pathname) {
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
      foot: `meter.gonka.gg${path === "/" ? "" : path}`
    });
  }
}
async function cardFor(path) {
  const route = parsePath(path);
  const data = await loadSnapshot();
  const provider = route.brokerId == null ? null : data.providers.find((item) => item.id === route.brokerId) || null;
  if (route.name === "overview") {
    const counts = countStatus(data.providers);
    const headline = `${counts.healthy} healthy`;
    const sub = [counts.degraded && `${counts.degraded} degraded`, counts.down && `${counts.down} down`, `${data.providers.length} providers`].filter(Boolean).join(" \xB7 ");
    return baseCard(path, {
      kicker: "network",
      kickerColor: "#3dd68c",
      headline,
      sub,
      stats: aggregateStats(data),
      foot: "meter.gonka.gg"
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
      sub: `${counts.healthy} healthy \xB7 ${counts.degraded} degraded \xB7 ${counts.down} down`,
      stats: aggregateStats(data),
      foot: "meter.gonka.gg/providers"
    });
  }
  if (route.name === "trends") {
    return baseCard(path, {
      kicker: "trends",
      kickerColor: "#b5b5be",
      headline: route.model || "All models",
      sub: "Latency, uptime, failed probes, and output",
      stats: aggregateStats(data),
      foot: `meter.gonka.gg${path}`
    });
  }
  if (route.name === "limits") {
    return provider ? providerCard(path, provider, data, route.model, "limits") : baseCard(path, {
      kicker: "limits",
      kickerColor: "#ffb020",
      headline: "Context and output",
      sub: `${data.providers.length} providers`,
      stats: aggregateStats(data),
      foot: "meter.gonka.gg/limits"
    });
  }
  if (route.name === "compare") {
    return baseCard(path, {
      kicker: "prices",
      kickerColor: "#3dd68c",
      headline: "Gonka vs the market",
      sub: "USD per 1M tokens, input and output",
      stats: aggregateStats(data),
      foot: "meter.gonka.gg/compare"
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
      foot: stamp(provider.checked) || provider.host
    });
  }
  return baseCard(path, {
    kicker: "meter",
    kickerColor: "#3dd68c",
    headline: "Gonka network status",
    sub: "Live probes across public brokers",
    stats: aggregateStats(data),
    foot: `meter.gonka.gg${path === "/" ? "" : path}`
  });
}
function providerCard(path, provider, data, model, kicker) {
  if (!provider) {
    return baseCard(path, {
      kicker,
      kickerColor: "#9a9aa3",
      headline: "Broker",
      sub: "Not in the current meter lineup",
      stats: [],
      foot: `meter.gonka.gg${path}`
    });
  }
  const modelRow = model ? provider.models.find((item) => item.id === model || item.label === model) : null;
  const tone = modelRow ? toneFrom(modelRow.uptimePct, modelRow.failedPct, modelRow.latencyS) : toneOf(provider);
  const volume = volumeFor(provider, data.gateways);
  const stats = modelRow ? [
    { label: "uptime", value: modelRow.uptime },
    { label: "failed", value: modelRow.failed },
    { label: "latency", value: modelRow.latency },
    { label: "output", value: modelRow.output }
  ] : providerStats(provider, data);
  if (volume && !modelRow) stats[3] = { label: "tokens", value: volume };
  return baseCard(path, {
    kicker: modelRow ? `${kicker} \xB7 ${tone.label}` : tone.label,
    kickerColor: tone.color,
    headline: modelRow ? modelRow.label : provider.name,
    sub: modelRow ? provider.name : provider.host,
    stats,
    foot: stamp(provider.checked) || provider.host
  });
}
async function historyCard(path, runId, resultId) {
  if (runId == null) {
    return baseCard(path, {
      kicker: "history",
      kickerColor: "#b5b5be",
      headline: "Probe runs",
      sub: "Quick checks and limit runs",
      stats: [],
      foot: "meter.gonka.gg/history"
    });
  }
  const run = await loadRun(runId);
  const headline = resultId != null ? `Result #${resultId}` : `Run #${runId}`;
  return baseCard(path, {
    kicker: run?.status || "history",
    kickerColor: run?.status === "completed" ? "#3dd68c" : run?.status === "failed" ? "#ff5d73" : "#ffb020",
    headline,
    sub: [run?.type, run?.broker].filter(Boolean).join(" \xB7 ") || "Probe run",
    stats: run?.stats || [],
    foot: stamp(run?.started || null) || `meter.gonka.gg/history/${runId}`
  });
}
function baseCard(path, parts) {
  const title = `${parts.headline} | meter.gonka.gg`;
  const description = [parts.kicker, parts.sub, ...parts.stats.map((stat) => `${stat.value} ${stat.label}`)].filter(Boolean).join(" \xB7 ");
  return { path, title, description, ...parts };
}
function aggregateStats(data) {
  return [
    { label: "uptime", value: data.aggregate.uptime },
    { label: "failed", value: data.aggregate.failed },
    { label: "latency", value: data.aggregate.latency },
    { label: "output", value: data.aggregate.output }
  ];
}
function providerStats(provider, data) {
  const volume = volumeFor(provider, data.gateways);
  return [
    { label: "uptime", value: provider.uptime },
    { label: "failed", value: provider.failed },
    { label: "latency", value: provider.latency },
    volume ? { label: "tokens", value: volume } : { label: "output", value: provider.output }
  ];
}
function volumeFor(provider, rows) {
  const match = matchGateway(provider.name, provider.baseUrl, rows);
  const tokens = match?.kind === "gateway" ? match.row.tokens : match?.kind === "customer" ? match.org.total_tokens : null;
  return tokens ? compact(tokens) : null;
}
function countStatus(providers) {
  const counts = { healthy: 0, degraded: 0, down: 0 };
  for (const provider of providers) {
    const tone = toneOf(provider).label;
    if (tone === "down") counts.down += 1;
    else if (tone === "degraded") counts.degraded += 1;
    else counts.healthy += 1;
  }
  return counts;
}
function toneOf(provider) {
  return toneFrom(provider.uptimePct, provider.failedPct, provider.latencyS);
}
function toneFrom(uptime, failed, latency) {
  if (uptime === 0 && (failed == null || failed > 0)) return { label: "down", color: "#ff5d73" };
  if (failed != null && failed > 5 || uptime != null && uptime < 95 || latency != null && latency > 10) {
    return { label: "degraded", color: "#ffb020" };
  }
  if (uptime == null && failed == null) return { label: "meter", color: "#3dd68c" };
  return { label: "healthy", color: "#3dd68c" };
}
function providerMetric(provider, key) {
  if (!key) return null;
  const labels = {
    api_uptime: "uptime",
    failed_probes: "failed",
    latency: "latency",
    output_speed: "output",
    real_world_gen: "caps",
    real_spend: "cost"
  };
  const value = key === "api_uptime" ? provider.uptime : key === "failed_probes" ? provider.failed : key === "latency" ? provider.latency : key === "output_speed" ? provider.output : "\u2014";
  return { label: labels[key] || key, value };
}
async function loadSnapshot() {
  if (snapshot && Date.now() - snapshot.at < TTL_MS) return snapshot;
  if (!loading) {
    loading = fetchSnapshot().finally(() => {
      loading = null;
    });
  }
  return loading;
}
async function fetchSnapshot() {
  const [detailRes, gatewayRes] = await Promise.all([
    fetch(`${API}/api/metrics/dashboard/detail`, { signal: AbortSignal.timeout(4e3) }),
    fetch(`${API}/api/metrics/gateways?hours=24`, { signal: AbortSignal.timeout(4e3) }).catch(() => null)
  ]);
  if (!detailRes.ok) throw new Error("dashboard unavailable");
  const detail = await detailRes.json();
  const gateways = gatewayRes && gatewayRes.ok ? (await gatewayRes.json()).rows || [] : snapshot?.gateways || [];
  const aggregate = detail.aggregate || {};
  const next = {
    at: Date.now(),
    aggregate: {
      uptime: num(aggregate.api_uptime_pct, "%"),
      failed: num(aggregate.failed_probes_pct, "%"),
      latency: num(aggregate.latency_s, "s"),
      output: num(aggregate.output_speed_tps, " tps"),
      runs: Number(aggregate.total_runs || 0)
    },
    providers: (detail.providers || []).map(slimProvider),
    gateways
  };
  snapshot = next;
  return next;
}
async function loadRun(id) {
  const response = await fetch(`${API}/api/runs/${id}`, { signal: AbortSignal.timeout(8e3) });
  if (!response.ok) return null;
  const run = await response.json();
  const summary = run.summary && !Array.isArray(run.summary) ? run.summary : {};
  const broker = snapshot?.providers.find((item) => item.id === run.broker_id);
  const stats = [];
  if (summary.api_uptime_pct != null) stats.push({ label: "uptime", value: num(summary.api_uptime_pct, "%") });
  if (summary.failed_probes_pct != null) stats.push({ label: "failed", value: num(summary.failed_probes_pct, "%") });
  if (summary.latency_s != null) stats.push({ label: "latency", value: num(summary.latency_s, "s") });
  return {
    status: String(run.status || "run"),
    type: String(run.run_type || "probe"),
    broker: broker?.name || (run.broker_id != null ? `broker ${run.broker_id}` : ""),
    started: run.started_at ? String(run.started_at) : null,
    stats
  };
}
function slimProvider(provider) {
  const raw = provider.metrics?.[0]?.raw || {};
  return {
    id: provider.broker_id,
    name: provider.broker_name,
    host: hostOf3(provider.base_url),
    baseUrl: provider.base_url || "",
    uptime: textMetric(provider, "api_uptime", num(raw.api_uptime_pct, "%")),
    failed: textMetric(provider, "failed_probes", num(raw.failed_probes_pct, "%")),
    latency: textMetric(provider, "latency", num(raw.latency_s, "s")),
    output: textMetric(provider, "output_speed", num(raw.output_speed_tps, " tps")),
    uptimePct: numberOrNull(raw.api_uptime_pct),
    failedPct: numberOrNull(raw.failed_probes_pct),
    latencyS: numberOrNull(raw.latency_s),
    checked: provider.latest_run_at || null,
    models: (provider.models || []).map((model) => {
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
        latencyS: numberOrNull(modelRaw.latency_s)
      };
    })
  };
}
function textMetric(source, key, fallback) {
  const metric = (source.metrics || []).find((item) => item.key === key);
  return metric?.value || fallback;
}
function parsePath(pathname) {
  const parts = pathname.split("?")[0].replace(/\/+$/, "").split("/").filter(Boolean).map(decode);
  const [a, b, c, d, e] = parts;
  const brokerId = b ? idFromSlug(b) : null;
  if (parts.length === 0) return { name: "overview", brokerId: null, model: null, logs: false, runId: null, resultId: null, metricKey: null };
  if (a === "trends") return { name: "trends", brokerId: null, model: b === "models" ? c || null : null, logs: false, runId: null, resultId: null, metricKey: null };
  if (a === "providers") {
    return {
      name: "providers",
      brokerId,
      model: c === "models" ? d || null : null,
      logs: e === "logs",
      runId: null,
      resultId: null,
      metricKey: null
    };
  }
  if (a === "limits") return { name: "limits", brokerId, model: c || null, logs: false, runId: null, resultId: null, metricKey: null };
  if (a === "history") {
    const runId = b && Number.isFinite(Number(b)) ? Number(b) : null;
    const resultId = c === "results" && d && Number.isFinite(Number(d)) ? Number(d) : null;
    return { name: "history", brokerId: null, model: null, logs: false, runId, resultId, metricKey: null };
  }
  if (a === "metrics" && brokerId != null && c) {
    return { name: "metric", brokerId, model: null, logs: false, runId: null, resultId: null, metricKey: c };
  }
  if (a === "compare") return { name: "compare", brokerId: null, model: null, logs: false, runId: null, resultId: null, metricKey: null };
  if (a === "brokers" && brokerId != null) {
    return { name: "broker", brokerId, model: null, logs: false, runId: null, resultId: null, metricKey: null };
  }
  return { name: "other", brokerId: null, model: null, logs: false, runId: null, resultId: null, metricKey: null };
}
function idFromSlug(slug) {
  const match = slug.match(/-b(\d+)$/);
  return match ? Number(match[1]) : null;
}
function normalizePath(pathname) {
  const path = pathname.split("?")[0].replace(/\/+$/, "");
  return path || "/";
}
function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function hostOf3(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value || "";
  }
}
function num(value, suffix) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "\u2014";
  if (suffix === "%") return `${parsed.toFixed(parsed >= 10 && parsed % 1 === 0 ? 0 : 1)}%`;
  if (suffix === "s") return `${parsed.toFixed(2)}s`;
  if (suffix === " tps") return `${parsed.toFixed(parsed >= 10 ? 0 : 1)} tps`;
  return String(parsed);
}
function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function compact(value) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  return String(Math.round(value));
}
function stamp(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${hh}:${mm} utc`;
}
function titleCase(value) {
  return decode(value).replace(/[-_]+/g, " ");
}

// share/jpeg.ts
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

// share/image.ts
import { createElement as h } from "react";
import { ImageResponse } from "@vercel/og";
var fontRegular = null;
var fontBold = null;
async function shareImage(card) {
  const fonts = await loadFonts();
  return new ImageResponse(cardElement(card), {
    width: 1200,
    height: 630,
    fonts,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=600"
    }
  });
}
function cardElement(card) {
  const stats = card.stats.slice(0, 4);
  return h(
    "div",
    {
      style: {
        width: "1200px",
        height: "630px",
        display: "flex",
        background: "#050505",
        padding: "36px",
        fontFamily: "Space Grotesk"
      }
    },
    h(
      "div",
      {
        style: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#141414",
          border: "1px solid #2a2a2a",
          borderRadius: "32px",
          padding: "42px 48px 36px"
        }
      },
      h(
        "div",
        { style: { display: "flex", flexDirection: "column" } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center" } },
          h(
            "div",
            {
              style: {
                width: "54px",
                height: "54px",
                borderRadius: "14px",
                background: "#17171c",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "32px",
                fontWeight: 700
              }
            },
            "G"
          ),
          h(
            "div",
            { style: { display: "flex", marginLeft: "16px", color: "#f5f5f7", fontSize: "34px", fontWeight: 700 } },
            "meter.gonka.gg"
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                marginLeft: "16px",
                background: "#f4f5fb",
                color: "#19182b",
                borderRadius: "999px",
                padding: "6px 14px",
                fontSize: "22px",
                fontWeight: 700
              }
            },
            "meter"
          )
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              marginTop: "36px",
              color: card.kickerColor,
              fontSize: "24px",
              letterSpacing: "0.08em",
              textTransform: "uppercase"
            }
          },
          card.kicker
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              marginTop: "8px",
              color: "#ffffff",
              fontSize: card.headline.length > 28 ? "54px" : "68px",
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.03em"
            }
          },
          card.headline
        ),
        h(
          "div",
          { style: { display: "flex", marginTop: "10px", color: "#b5b5be", fontSize: "28px" } },
          card.sub
        )
      ),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column" } },
        h("div", { style: { display: "flex", height: "1px", background: "#2e2e2e", marginBottom: "22px" } }),
        h(
          "div",
          { style: { display: "flex", justifyContent: "space-between" } },
          ...stats.map(
            (stat) => h(
              "div",
              { style: { display: "flex", flexDirection: "column", width: "240px" } },
              h(
                "div",
                { style: { display: "flex", color: "#8d8d96", fontSize: "20px", letterSpacing: "0.04em" } },
                stat.label
              ),
              h(
                "div",
                { style: { display: "flex", marginTop: "6px", color: "#ffffff", fontSize: "32px", fontWeight: 700 } },
                stat.value
              )
            )
          )
        ),
        h(
          "div",
          { style: { display: "flex", marginTop: "22px", color: "#6f6f78", fontSize: "20px" } },
          card.foot
        )
      )
    )
  );
}
async function loadFonts() {
  try {
    if (!fontRegular) fontRegular = await fetchFont("500");
    if (!fontBold) fontBold = await fetchFont("700");
    return [
      { name: "Space Grotesk", data: fontRegular, weight: 500, style: "normal" },
      { name: "Space Grotesk", data: fontBold, weight: 700, style: "normal" }
    ];
  } catch {
    return void 0;
  }
}
async function fetchFont(weight) {
  const response = await fetch(
    `https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@5.2.8/latin-${weight}-normal.woff`,
    { signal: AbortSignal.timeout(8e3) }
  );
  if (!response.ok) throw new Error("font");
  return response.arrayBuffer();
}

// share/jpeg.ts
async function shareJpeg(card) {
  const rendered = await shareImage(card);
  const png = PNG.sync.read(Buffer.from(await rendered.arrayBuffer()));
  const encoded = jpeg.encode({ data: png.data, width: png.width, height: png.height }, 82);
  return Buffer.from(encoded.data);
}

// share/preview-handler.ts
function pathFromFile(file) {
  const name = decodeURIComponent(file).replace(/\.jpe?g$/i, "");
  if (!name || name === "home") return "/";
  return `/${name.replace(/__/g, "/")}`;
}
async function handler(req, res) {
  try {
    const file = String(req.query?.file || "home.jpg");
    const card = await buildShare(pathFromFile(file));
    const body = await shareJpeg(card);
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=600");
    res.setHeader("Content-Length", String(body.length));
    res.end(body);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end(error instanceof Error ? error.message : "preview failed");
  }
}
export {
  handler as default
};
