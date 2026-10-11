import { findDirectoryEntryForProbe } from "./brokerDirectory";
import type { GatewayCustomer, GatewayStatsRow } from "./types";

const GENERIC = new Set([
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
  "www",
]);

function hostOf(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return null;
  }
}

function hostsForBroker(name: string, baseUrl: string): string[] {
  const hosts = new Set<string>();
  const add = (value?: string) => {
    const host = value ? hostOf(value) : null;
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

function hostsForGateway(row: GatewayStatsRow): string[] {
  const hosts = new Set<string>();
  const add = (value?: string) => {
    const host = value ? hostOf(value) : null;
    if (host) hosts.add(host);
  };
  add(row.host);
  add(row.url);
  for (const part of (row.subtitle || "").split(/[·,]/)) add(part);
  return [...hosts];
}

function sameHost(left: string, right: string) {
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function overlaps(brokerHosts: string[], row: GatewayStatsRow) {
  const gatewayHosts = hostsForGateway(row);
  return brokerHosts.some((host) => gatewayHosts.some((other) => sameHost(host, other)));
}

function scoreRow(brokerHosts: string[], row: GatewayStatsRow) {
  const primary = hostOf(row.host);
  let score = 0;
  if (primary && brokerHosts.some((host) => sameHost(host, primary))) score += 10;
  if (row.split_of) score += 6;
  const extras = hostsForGateway(row).filter((host) => !brokerHosts.some((item) => sameHost(item, host)));
  if (extras.length && !row.split_of) score -= 5 * extras.length;
  return score;
}

export type GatewayMatch =
  | { kind: "gateway"; row: GatewayStatsRow }
  | { kind: "customer"; row: GatewayStatsRow; org: GatewayCustomer };

export function matchGateway(name: string, baseUrl: string, rows: GatewayStatsRow[]): GatewayMatch | null {
  const brokerHosts = hostsForBroker(name, baseUrl);
  const ranked = rows
    .filter((row) => overlaps(brokerHosts, row))
    .map((row) => ({ row, score: scoreRow(brokerHosts, row) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  if (ranked[0]) return { kind: "gateway", row: ranked[0].row };

  const needles = new Set<string>();
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
