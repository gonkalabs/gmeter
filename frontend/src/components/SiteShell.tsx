import { useEffect, useState, type ReactNode } from "react";
import { LIMITS_INTERVAL_MINUTES, PROBE_INTERVAL_MINUTES } from "../metrics";
import { navigate, type RouteName } from "../routes";
import { useI18n, type Locale } from "../i18n";
import { useTheme } from "../useTheme";

const NAV: Array<{ href: string; id: RouteName; labelKey: "tabs.overview" | "tabs.trends" | "tabs.providers" | "tabs.limits" | "tabs.history" | "tabs.compare" }> = [
  { href: "/", id: "overview", labelKey: "tabs.overview" },
  { href: "/trends", id: "trends", labelKey: "tabs.trends" },
  { href: "/providers", id: "providers", labelKey: "tabs.providers" },
  { href: "/limits", id: "limits", labelKey: "tabs.limits" },
  { href: "/history", id: "history", labelKey: "tabs.history" },
  { href: "/compare", id: "compare", labelKey: "tabs.compare" },
];

interface Jump {
  href: string;
  label: string;
}

interface Props {
  active: RouteName;
  title: string;
  lead?: string;
  jumps?: Jump[];
  probing: boolean;
  brokerCount: number;
  children: ReactNode;
}

export function SiteShell({ active, title, lead, jumps, probing, brokerCount, children }: Props) {
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const navActive: RouteName = active === "metric" ? "overview" : active;

  useEffect(() => {
    const onNavigate = () => setMenuOpen(false);
    window.addEventListener("popstate", onNavigate);
    return () => window.removeEventListener("popstate", onNavigate);
  }, []);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const raw = anchor.getAttribute("href");
      if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) return;
      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      navigate(`${url.pathname}${url.search}${url.hash}`);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div className="site">
      <a className="skip-link" href="#content">
        {t("nav.skip")}
      </a>

      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/" aria-label="meter.gonka.gg">
            <span className="brand-mark" aria-hidden="true">
              G
            </span>
            <span>
              <span className="brand-name">meter</span>
              <span className="brand-tag">{t("app.tagline")}</span>
            </span>
          </a>

          <nav id="site-nav" className={`nav ${menuOpen ? "is-open" : ""}`} aria-label={t("nav.menu")}>
            {NAV.map((item) => (
              <a
                key={item.href}
                className={`nav-link ${navActive === item.id ? "active" : ""}`}
                href={item.href}
                aria-current={navActive === item.id ? "page" : undefined}
              >
                {t(item.labelKey)}
              </a>
            ))}
          </nav>

          <div className="topbar-tools">
            <button
              type="button"
              className="nav-toggle"
              aria-expanded={menuOpen}
              aria-controls="site-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? t("nav.close") : t("nav.menu")}
            </button>

            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === "light" ? t("app.theme.dark") : t("app.theme.light")}
            >
              {theme === "light" ? "◐" : "◑"}
            </button>

            <div className="language-toggle" role="group" aria-label={t("app.language")}>
              {(["en", "ru"] as const).map((id: Locale) => (
                <button
                  key={id}
                  type="button"
                  className={locale === id ? "active" : ""}
                  aria-pressed={locale === id}
                  onClick={() => setLocale(id)}
                >
                  {id.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="status-chip">
              <span className={`status-dot ${probing ? "pulse" : "live"}`} />
              {probing ? t("app.measuring") : t("app.live")}
              {brokerCount > 0 && (
                <span className="provider-count">
                  · {brokerCount} {brokerCount === 1 ? t("app.provider") : t("app.providers")}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="main" id="content">
        <header className="page-hero">
          <p className="page-kicker">meter.gonka.gg</p>
          <h1>{title}</h1>
          {lead ? <p className="page-lead">{lead}</p> : null}
          {jumps && jumps.length > 0 ? (
            <nav className="page-jumps" aria-label={t("overview.jump")}>
              {jumps.map((jump) => (
                <a key={jump.href} href={jump.href}>
                  {jump.label}
                </a>
              ))}
            </nav>
          ) : null}
        </header>
        {children}
      </main>

      <footer className="footer">
        <span>
          {t("app.footer", {
            probe: PROBE_INTERVAL_MINUTES,
            limits: LIMITS_INTERVAL_MINUTES,
          })}
        </span>
        <span className="footer-links">
          <a href="https://github.com/gonkalabs/gmeter" target="_blank" rel="noreferrer">
            {t("app.githubRepo")}
          </a>
          <a href="https://gonkalabs.com" target="_blank" rel="noreferrer">
            {t("app.developers")}
          </a>
          <a href="https://rpc.gonka.gg" target="_blank" rel="noreferrer">
            rpc.gonka.gg
          </a>
        </span>
      </footer>
    </div>
  );
}
