export interface BrokerDirectoryEntry {
  id: string;
  name: string;
  siteUrl: string;
  apiBaseUrl?: string;
  demoUrl?: string;
  docsUrl?: string;
  /** In-browser chat / playground hosted by the broker (not third-party apps) */
  chatUrl?: string;
  chatNoteKey?:
    | "start.chatNote.gonkagate"
    | "start.chatNote.gonkascan"
    | "start.chatNote.proxy"
    | "start.chatNote.mingles";
  /** Hostname fragments used to match G-Meter probe data */
  matchHosts: string[];
}

export const BROKER_DIRECTORY: BrokerDirectoryEntry[] = [
  {
    id: "proxy-gonka",
    name: "proxy.gonka.gg",
    siteUrl: "https://proxy.gonka.gg/",
    apiBaseUrl: "https://proxy.gonka.gg/v1",
    chatUrl: "https://proxy.gonka.gg/chat",
    chatNoteKey: "start.chatNote.proxy",
    demoUrl: "https://drive.google.com/file/d/1-Zk__4cY_ENi0Q8gw-JHgEBz6XZWXKAj/view",
    matchHosts: ["proxy.gonka.gg"],
  },
  {
    id: "gonkagate",
    name: "gonkagate.com",
    siteUrl: "https://gonkagate.com/",
    apiBaseUrl: "https://api.gonkagate.com/v1",
    chatUrl: "https://gonkagate.com/en/chat",
    chatNoteKey: "start.chatNote.gonkagate",
    matchHosts: ["gonkagate.com", "api.gonkagate.com"],
  },
  {
    id: "mingles",
    name: "router.mingles.ai",
    siteUrl: "https://router.mingles.ai/",
    apiBaseUrl: "https://gonka-gateway.mingles.ai/v1",
    chatUrl: "https://router.mingles.ai/chat",
    chatNoteKey: "start.chatNote.mingles",
    demoUrl: "https://youtu.be/gegiRnNMavY",
    matchHosts: ["mingles.ai", "router.mingles.ai", "gonka-gateway.mingles.ai"],
  },
  {
    id: "gonkascan",
    name: "router.gonkascan.com",
    siteUrl: "https://router.gonkascan.com/",
    apiBaseUrl: "https://api.gonkascan.com/v1",
    demoUrl: "https://youtu.be/1uWmLGPoBCM",
    chatUrl: "https://router.gonkascan.com/chat",
    chatNoteKey: "start.chatNote.gonkascan",
    matchHosts: ["gonkascan.com", "router.gonkascan.com", "api.gonkascan.com"],
  },
  {
    id: "gonka-api",
    name: "gonka-api.org",
    siteUrl: "https://gonka-api.org/",
    apiBaseUrl: "https://api.gonka-api.org/v1",
    demoUrl: "https://youtu.be/JgY2ikjcP9M",
    matchHosts: ["gonka-api.org", "api.gonka-api.org"],
  },
  {
    id: "hyperfusion",
    name: "console.hyperfusion.io",
    siteUrl: "https://console.hyperfusion.io/",
    apiBaseUrl: "https://api.hyperfusion.io/v1",
    matchHosts: ["hyperfusion.io", "console.hyperfusion.io", "api.hyperfusion.io"],
  },
  {
    id: "joingonka",
    name: "gate.joingonka.ai",
    siteUrl: "https://gate.joingonka.ai/",
    matchHosts: ["gate.joingonka.ai", "joingonka.ai"],
  },
  {
    id: "dahl",
    name: "inference.dahl.global",
    siteUrl: "https://inference.dahl.global",
    matchHosts: ["inference.dahl.global", "dahl.global"],
  },
  {
    id: "gonkabroker",
    name: "gonkabroker.com",
    siteUrl: "https://gonkabroker.com/",
    matchHosts: ["gonkabroker.com"],
  },
];

export const GONKA_QUICKSTART_URL = "https://gonka.ai/docs/developer/quickstart/";

export function youtubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`;
    }
    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function hostOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  }
}

export function brokerMatchesHost(entry: BrokerDirectoryEntry, probeUrl: string): boolean {
  const host = hostOf(probeUrl);
  return entry.matchHosts.some(
    (fragment) => host === fragment || host.endsWith(`.${fragment}`) || fragment.endsWith(host)
  );
}

export function brokersWithHostedChat(): BrokerDirectoryEntry[] {
  return BROKER_DIRECTORY.filter((entry) => entry.chatUrl);
}

export function findDirectoryEntryForProbe(probeUrl: string, probeName?: string): BrokerDirectoryEntry | undefined {
  const byUrl = BROKER_DIRECTORY.find((entry) => brokerMatchesHost(entry, probeUrl));
  if (byUrl) return byUrl;
  if (!probeName) return undefined;
  const normalized = probeName.toLowerCase();
  return BROKER_DIRECTORY.find(
    (entry) =>
      entry.name.toLowerCase() === normalized ||
      entry.matchHosts.some((host) => normalized.includes(host.split(".")[0] ?? ""))
  );
}
