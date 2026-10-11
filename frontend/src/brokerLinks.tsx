import { createContext, useContext, type ReactNode } from "react";
import { brokerPagePath } from "./routes";

interface BrokerLinkProps {
  name: string;
  brokerId?: number;
  baseUrl?: string;
  className?: string;
  children?: ReactNode;
}

export interface BrokerIndexEntry {
  id: number;
  name: string;
}

const BrokerIndexContext = createContext<BrokerIndexEntry[]>([]);

export function BrokerIndexProvider({
  brokers,
  children,
}: {
  brokers: BrokerIndexEntry[];
  children: ReactNode;
}) {
  return <BrokerIndexContext.Provider value={brokers}>{children}</BrokerIndexContext.Provider>;
}

export function brokerWebsiteUrl(name: string, baseUrl?: string) {
  const nameHost = hostnameLike(name);
  if (nameHost) return `https://${nameHost}`;

  try {
    const parsed = new URL(baseUrl ?? name);
    const host = parsed.hostname.startsWith("api.")
      ? parsed.hostname.slice(4)
      : parsed.hostname;
    return `${parsed.protocol}//${host}`;
  } catch {
    const fallbackHost = hostnameLike(baseUrl ?? "");
    return fallbackHost ? `https://${fallbackHost}` : undefined;
  }
}

export function hostFromUrl(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

export function BrokerLink({ name, brokerId, className, children }: BrokerLinkProps) {
  const index = useContext(BrokerIndexContext);
  const id = brokerId ?? index.find((broker) => broker.name === name)?.id;
  const href = id != null ? brokerPagePath(name, id) : null;
  const classNames = className ? `broker-link ${className}` : "broker-link";

  if (!href) return <span className={classNames}>{children ?? name}</span>;

  return (
    <a className={classNames} href={href} onClick={(event) => event.stopPropagation()}>
      {children ?? name}
    </a>
  );
}

function hostnameLike(value: string) {
  const trimmed = value.trim().replace(/^https?:\/\//, "").split("/")[0];
  if (!trimmed || trimmed.includes(" ") || !trimmed.includes(".")) return null;
  return trimmed;
}
