import type { ReactNode } from "react";
import { useI18n } from "../i18n";

interface Props {
  children: ReactNode;
  announce?: ReactNode;
  ctaHref?: string;
}

export function CompareChrome({ children, announce, ctaHref = "/compare/start" }: Props) {
  const { t, locale, setLocale } = useI18n();

  return (
    <div className="compare-page">
      {announce ? <div className="compare-announce">{announce}</div> : null}

      <header className="compare-nav">
        <a className="compare-logo" href="/compare">
          <span className="compare-logo-mark">G</span>
          <span className="compare-logo-text">
            <strong>G-Meter</strong>
            <span>{t("app.tagline")}</span>
          </span>
        </a>
        <div className="compare-nav-actions">
          <button
            type="button"
            className="compare-btn compare-btn-secondary"
            onClick={() => setLocale(locale === "en" ? "ru" : "en")}
          >
            {locale === "en" ? "RU" : "EN"}
          </button>
          <a className="compare-btn compare-btn-ghost" href="/">
            {t("compare.navDashboard")}
          </a>
          <a className="compare-btn compare-btn-primary" href={ctaHref}>
            {t("compare.ctaPrimary")}
          </a>
        </div>
      </header>

      {children}

      <footer className="compare-footer">{t("compare.footer")}</footer>
    </div>
  );
}
