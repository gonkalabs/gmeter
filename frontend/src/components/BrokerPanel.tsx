import { useState } from "react";
import type { Broker } from "../types";
import { api } from "../api";
import { useI18n } from "../i18n";
import { BrokerLink } from "../brokerLinks";

interface Props {
  brokers: Broker[];
  onChanged: () => void;
}

export function BrokerPanel({ brokers, onChanged }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://proxy.gonka.gg/v1");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState(
    "moonshotai/Kimi-K2.6,Qwen/Qwen3-235B-A22B-Instruct-2507-FP8"
  );
  const [aliases, setAliases] = useState("{}");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.createBroker({
        name,
        base_url: baseUrl,
        api_key: apiKey,
        models,
        model_aliases: JSON.parse(aliases || "{}"),
      });
      setName("");
      setApiKey("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("brokers.addFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t("brokers.confirmDelete"))) return;
    await api.deleteBroker(id);
    onChanged();
  }

  return (
    <div className="panel">
      <h2>{t("brokers.title")}</h2>
      {brokers.length === 0 ? (
        <p className="empty">{t("brokers.empty")}</p>
      ) : (
        brokers.map((b) => (
          <div className="broker-row" key={b.id}>
            <div className="broker-meta">
              <BrokerLink name={b.name} baseUrl={b.base_url}>
                <strong>{b.name}</strong>
              </BrokerLink>
              <span>
                <BrokerLink name={b.name} baseUrl={b.base_url}>{b.base_url}</BrokerLink> ·{" "}
                {t("brokers.key", { key: b.api_key_masked })}
                {!b.enabled && ` · ${t("brokers.disabled")}`}
              </span>
            </div>
            <div className="broker-actions">
              <button className="btn btn-danger" onClick={() => handleDelete(b.id)}>
                {t("brokers.delete")}
              </button>
            </div>
          </div>
        ))
      )}

      <h2 style={{ marginTop: 28 }}>{t("brokers.addTitle")}</h2>
      {error && <div className="alert error">{error}</div>}
      <form className="form-grid" onSubmit={handleAdd}>
        <label>
          {t("brokers.name")}
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          {t("brokers.baseUrl")}
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
        </label>
        <label>
          {t("brokers.apiKey")}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required
            autoComplete="off"
          />
        </label>
        <label>
          {t("brokers.models")}
          <textarea
            rows={2}
            value={models}
            onChange={(e) => setModels(e.target.value)}
          />
        </label>
        <label>
          {t("brokers.aliases")}
          <textarea
            rows={3}
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? t("brokers.adding") : t("brokers.add")}
        </button>
      </form>
    </div>
  );
}
