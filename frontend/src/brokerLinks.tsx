import type { ReactNode } from "react";

interface BrokerLinkProps {
  name: string;
  baseUrl?: string;
  className?: string;
  children?: ReactNode;
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

export function BrokerLink({ name, baseUrl, className, children }: BrokerLinkProps) {
  const href = brokerWebsiteUrl(name, baseUrl);
  if (!href) return <span className={className}>{children ?? name}</span>;

  return (
    <a
      className={className ? `broker-link ${className}` : "broker-link"}
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
    >
      {children ?? name}
    </a>
  );
}

function hostnameLike(value: string) {
  const trimmed = value.trim().replace(/^https?:\/\//, "").split("/")[0];
  if (!trimmed || trimmed.includes(" ") || !trimmed.includes(".")) return null;
  return trimmed;
}
