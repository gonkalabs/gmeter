import type { DashboardDetail } from "../types";
import { useI18n } from "../i18n";

interface Props {
  detail: DashboardDetail;
  compact?: boolean;
}

export function NetworkEpochBanner({ detail, compact = false }: Props) {
  const { t } = useI18n();
  const notice = detail.network_notice?.trim();
  const inactive = detail.network_models?.filter((item) => !item.active) ?? [];

  if (!notice && !inactive.length) return null;

  return (
    <section className={`network-epoch-banner ${compact ? "is-compact" : ""}`} role="status">
      <div className="network-epoch-banner-main">
        <span className="network-epoch-badge">{t("network.epochBadge")}</span>
        <div>
          <strong>{t("network.epochTitle")}</strong>
          <p>{notice || t("network.epochFallback")}</p>
          {inactive.length > 0 && (
            <ul className="network-epoch-models">
              {inactive.map((item) => (
                <li key={item.model_id}>
                  <span className="network-epoch-model-name">{item.label}</span>
                  {item.status_note ? (
                    <span className="network-epoch-model-note">{item.status_note}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {detail.network_update_url ? (
        <a
          className="network-epoch-link"
          href={detail.network_update_url}
          target="_blank"
          rel="noreferrer"
        >
          {t("network.readUpdate")}
        </a>
      ) : null}
    </section>
  );
}
