from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import settings
from app.models import Broker
from app.probes.constants import MODEL_LABELS, MODELS


_ENV_REF = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}")


@dataclass(frozen=True)
class BrokerSeedSpec:
    name: str
    base_url: str
    api_key: str
    models: list[str]
    model_aliases: dict[str, str]
    enabled: bool = True

    @property
    def models_csv(self) -> str:
        return ",".join(self.models)


def split_model_ids(raw: str | None) -> list[str]:
    return [m.strip() for m in (raw or "").split(",") if m.strip()]


def broker_model_ids(broker: Broker) -> list[str]:
    raw = broker.models.strip() if broker.models else settings.default_models
    return split_model_ids(raw) or MODELS


def broker_model_aliases(broker: Broker) -> dict[str, str]:
    aliases = broker.model_aliases or {}
    return {
        str(model_id): str(alias)
        for model_id, alias in aliases.items()
        if str(model_id).strip() and str(alias).strip()
    }


def label_for_model(model: str, aliases: dict[str, str] | None = None) -> str:
    if model == "broker":
        return "endpoint"
    aliases = aliases or {}
    return aliases.get(model) or MODEL_LABELS.get(model) or model.split("/")[-1]


def resolve_model_ids(broker: Broker, requested: list[str] | None = None) -> list[str]:
    configured = broker_model_ids(broker)
    if not requested:
        return configured

    aliases = broker_model_aliases(broker)
    by_alias = {alias.strip().lower(): model_id for model_id, alias in aliases.items()}
    by_model = {model_id.strip().lower(): model_id for model_id in configured}
    resolved: list[str] = []

    for model in requested:
        key = model.strip()
        if not key:
            continue
        normalized = key.lower()
        resolved.append(by_model.get(normalized) or by_alias.get(normalized) or key)

    return resolved or configured


def configured_broker_specs() -> tuple[list[BrokerSeedSpec], bool]:
    payload = _load_config_payload()
    if payload is None:
        return _default_broker_specs(), False
    return _parse_broker_specs(payload), True


def _default_broker_specs() -> list[BrokerSeedSpec]:
    return [
        BrokerSeedSpec(
            name="proxy.gonka.gg",
            base_url=os.environ.get("GONKA_BASE_URL", "https://proxy.gonka.gg/v1"),
            models=split_model_ids(os.environ.get("GONKA_MODELS", settings.default_models)),
            model_aliases={
                "moonshotai/Kimi-K2.6": "kimi-k2.6",
                "Qwen/Qwen3-235B-A22B-Instruct-2507-FP8": "qwen3-235b",
                "MiniMaxAI/MiniMax-M2.7": "minimax-m2.7",
            },
            api_key=os.environ.get("GONKA_API_KEY", ""),
            enabled=bool(os.environ.get("GONKA_API_KEY", "")),
        ),
        BrokerSeedSpec(
            name="gonkagate.com",
            base_url=os.environ.get("GONKAGATE_BASE_URL", "https://api.gonkagate.com/v1"),
            models=split_model_ids(
                os.environ.get(
                    "GONKAGATE_MODELS",
                    "moonshotai/kimi-k2.6,qwen/qwen3-235b-a22b-instruct-2507-fp8,minimaxai/minimax-m2.7",
                )
            ),
            model_aliases={
                "moonshotai/kimi-k2.6": "kimi-k2.6",
                "qwen/qwen3-235b-a22b-instruct-2507-fp8": "qwen3-235b",
                "minimaxai/minimax-m2.7": "minimax-m2.7",
            },
            api_key=os.environ.get("GONKAGATE_API_KEY", ""),
            enabled=bool(os.environ.get("GONKAGATE_API_KEY", "")),
        ),
    ]


def _load_config_payload() -> Any | None:
    if settings.brokers_config_json.strip():
        return json.loads(_expand_env(settings.brokers_config_json))

    path_text = settings.brokers_config_path.strip()
    if not path_text:
        return None

    path = Path(path_text)
    if not path.is_absolute():
        path = Path.cwd() / path
    if not path.exists():
        return None

    return json.loads(_expand_env(path.read_text(encoding="utf-8")))


def _parse_broker_specs(payload: Any) -> list[BrokerSeedSpec]:
    raw_brokers = payload.get("brokers") if isinstance(payload, dict) else payload
    if not isinstance(raw_brokers, list):
        raise ValueError("Broker config must be a list or an object with a 'brokers' list.")

    return [_parse_broker_spec(item) for item in raw_brokers]


def _parse_broker_spec(raw: Any) -> BrokerSeedSpec:
    if not isinstance(raw, dict):
        raise ValueError("Each broker config entry must be an object.")

    base_url = str(raw.get("base_url") or raw.get("url") or "").strip()
    if not base_url:
        raise ValueError("Broker config entry is missing 'base_url'.")

    name = str(raw.get("name") or _hostish_name(base_url)).strip()
    api_key = str(raw.get("api_key") or raw.get("key") or "").strip()
    enabled = bool(raw.get("enabled", True)) and bool(api_key)

    models, aliases = _parse_models(raw.get("models"))
    aliases.update(_parse_alias_overrides(raw.get("model_aliases"), models))
    if not models:
        models = split_model_ids(settings.default_models) or MODELS

    return BrokerSeedSpec(
        name=name,
        base_url=base_url,
        api_key=api_key,
        models=models,
        model_aliases=aliases,
        enabled=enabled,
    )


def _parse_models(raw: Any) -> tuple[list[str], dict[str, str]]:
    models: list[str] = []
    aliases: dict[str, str] = {}

    if raw is None:
        return models, aliases

    if isinstance(raw, str):
        return split_model_ids(raw), aliases

    if isinstance(raw, dict):
        for alias, model_id in raw.items():
            model = str(model_id).strip()
            if not model:
                continue
            models.append(model)
            alias_text = str(alias).strip()
            if alias_text:
                aliases[model] = alias_text
        return _unique(models), aliases

    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, str):
                model = item.strip()
                if model:
                    models.append(model)
                continue
            if not isinstance(item, dict):
                raise ValueError("Model entries must be strings or objects.")
            model = str(item.get("id") or item.get("model") or "").strip()
            if not model:
                raise ValueError("Model object is missing 'id' or 'model'.")
            alias = str(item.get("alias") or item.get("label") or item.get("name") or "").strip()
            models.append(model)
            if alias:
                aliases[model] = alias
        return _unique(models), aliases

    raise ValueError("'models' must be a comma string, list, or alias-to-model object.")


def _parse_alias_overrides(raw: Any, models: list[str]) -> dict[str, str]:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise ValueError("'model_aliases' must be an object.")

    known = set(models)
    aliases: dict[str, str] = {}
    for key, value in raw.items():
        left = str(key).strip()
        right = str(value).strip()
        if not left or not right:
            continue
        if left in known:
            aliases[left] = right
        elif right in known:
            aliases[right] = left
        else:
            aliases[left] = right
    return aliases


def _expand_env(text: str) -> str:
    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        default = match.group(2)
        return os.environ.get(name, default or "")

    return os.path.expandvars(_ENV_REF.sub(replace, text))


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def _hostish_name(base_url: str) -> str:
    return base_url.replace("https://", "").replace("http://", "").split("/")[0]
