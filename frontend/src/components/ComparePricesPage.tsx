import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { DashboardDetail } from "../types";
import { useI18n, type Locale } from "../i18n";
import { useTheme } from "../useTheme";
import { NetworkEpochBanner } from "./NetworkEpochBanner";
import { PriceComparison } from "./PriceComparison";

export function ComparePricesPage() {
  const [detail, setDetail] = useState<DashboardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      setDetail(await api.getDashboardDetail());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedLoad"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    refresh();
    const interval = setInterval(() => refresh(true), 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="site compare-prices-site">
      <div className="grid-bg" aria-hidden />

      <header className="topbar compare-prices-topbar">
        <div className="topbar-inner">
          <a className="brand compare-prices-brand" href="/" aria-label={t("comparePrices.back")}>
            <div className="brand-mark" aria-hidden="true">
              G
            </div>
            <div>
              <div className="brand-name">meter</div>
              <div className="brand-tag">{t("pricing.title")}</div>
            </div>
          </a>

          <div className="compare-prices-spacer" />

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
                onClick={() => setLocale(id)}
              >
                {id.toUpperCase()}
              </button>
            ))}
          </div>

          <a className="compare-prices-dashboard-link" href="/">
            {t("comparePrices.dashboard")}
          </a>
        </div>
      </header>

      <main className="main compare-prices-main">
        {error ? (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        ) : null}

        {loading && !detail ? (
          <div className="compare-prices-loading">{t("pricing.loading")}</div>
        ) : detail ? (
          <>
            <NetworkEpochBanner detail={detail} compact />
            <PriceComparison detail={detail} standalone />
            <div className="compare-prices-contact-wrap">
              <a
                className="compare-prices-contact"
                href="https://t.me/gonka_gg"
                target="_blank"
                rel="noreferrer"
              >
                <TelegramIcon />
                <span>{t("comparePrices.missingBroker")}</span>
              </a>
            </div>
          </>
        ) : (
          <div className="empty-state compact-empty">
            <strong>{t("overview.collecting")}</strong>
            <p>{t("overview.collectingHint")}</p>
          </div>
        )}
      </main>
    </div>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"
      />
    </svg>
  );
}
