import type { DashboardDetail } from "../types";
import { dashboardDetailForCompare } from "../pricingStats";
import { useI18n } from "../i18n";
import { NetworkEpochBanner } from "./NetworkEpochBanner";
import { PriceComparison } from "./PriceComparison";

interface Props {
  detail: DashboardDetail | null;
  loading: boolean;
  error: string;
}

export function ComparePricesPage({ detail, loading, error }: Props) {
  const { t } = useI18n();
  const compareDetail = detail ? dashboardDetailForCompare(detail) : null;

  if (error && !compareDetail) return null;

  if (loading && !compareDetail) {
    return <div className="compare-prices-loading">{t("pricing.loading")}</div>;
  }

  if (!compareDetail) {
    return (
      <div className="empty-state compact-empty">
        <strong>{t("overview.collecting")}</strong>
        <p>{t("overview.collectingHint")}</p>
      </div>
    );
  }

  return (
    <>
      <NetworkEpochBanner detail={compareDetail} compact />
      <PriceComparison detail={compareDetail} standalone />
      <div className="compare-prices-contact-wrap">
        <a className="compare-prices-contact" href="https://t.me/gonka_gg" target="_blank" rel="noreferrer">
          <TelegramIcon />
          <span>{t("comparePrices.missingBroker")}</span>
        </a>
      </div>
    </>
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
