import json
import math
import re
from typing import Any

from app.probes.constants import REAL_WORLD_TESTS
from app.services.model_catalog import label_for_model

METRIC_KEYS = [
    "api_uptime",
    "latency",
    "failed_probes",
    "output_speed",
    "stream_speed",
    "real_world_gen",
    "real_spend",
]

METRIC_LABELS = {
    "api_uptime": "API uptime",
    "latency": "Latency",
    "failed_probes": "Failed probes",
    "output_speed": "Output speed",
    "stream_speed": "Stream speed",
    "real_world_gen": "Real-world gen",
    "real_spend": "Real spend / 1M",
}

METRIC_TESTS: dict[str, set[str]] = {
    "api_uptime": {"connectivity"},
    "latency": {
        "output_ladder",
        "input_ladder",
        "tool_calling",
        "json_mode",
        "max_output",
        "multimodality",
        "max_input",
    },
    "failed_probes": set(),
    "output_speed": {"max_output"},
    "stream_speed": {"output_ladder"},
    "real_world_gen": REAL_WORLD_TESTS,
    "real_spend": {
        "pricing_probe",
        "max_output",
        "tool_calling",
        "json_mode",
        "output_ladder",
        "input_ladder",
    },
}


def model_label(model: str, aliases: dict[str, str] | None = None) -> str:
    return label_for_model(model, aliases)


def _result_row(r: Any, *, include_detail: bool = True) -> dict[str, Any]:
    return {
        "test_name": r.test_name,
        "ok": r.ok,
        "latency_s": r.latency_s,
        "ttft_s": r.ttft_s,
        "tps": r.tps,
        "stream_tps": r.stream_tps,
        "tokens_in": r.tokens_in,
        "tokens_out": r.tokens_out,
        "detail": r.detail if include_detail else {},
        "error": r.error,
        "gonka_limitation": r.gonka_limitation,
        "model": r.model,
    }


def _truncate(value: Any, limit: int = 1800) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2)
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def format_response(row: dict[str, Any]) -> str | None:
    detail = row.get("detail") or {}
    if isinstance(detail, dict) and detail.get("response"):
        return _truncate(detail["response"])

    payload: dict[str, Any] = {}
    if detail:
        payload["detail"] = detail
    if row.get("error"):
        payload["error"] = row["error"]
    usage = {}
    if row.get("tokens_in") is not None:
        usage["prompt_tokens"] = row["tokens_in"]
    if row.get("tokens_out") is not None:
        usage["completion_tokens"] = row["tokens_out"]
    if usage:
        payload["usage"] = usage
    if row.get("latency_s") is not None:
        payload["latency_s"] = row["latency_s"]
    if row.get("ttft_s") is not None:
        payload["ttft_s"] = row["ttft_s"]
    if row.get("tps") is not None:
        payload["tps"] = row["tps"]
    if row.get("stream_tps") is not None:
        payload["stream_tps"] = row["stream_tps"]

    if not payload:
        return row.get("error")
    return _truncate(payload)


def format_log_line(row: dict[str, Any]) -> str:
    test = row["test_name"]
    detail = row.get("detail") or {}

    if test == "connectivity":
        models = detail.get("models") or []
        status = "reachable" if row["ok"] else "unreachable"
        return f"GET /models → {status} in {row.get('latency_s', '?')}s · {len(models)} models listed"

    if test == "output_ladder":
        n = detail.get("n", "?")
        return (
            f"stream output {n}t → TTFT {row.get('ttft_s', '?')}s, "
            f"total {row.get('latency_s', '?')}s, {row.get('stream_tps', '?')} tps"
        )

    if test == "input_ladder":
        size = detail.get("size", "?")
        return f"input {size} → TTFT {row.get('ttft_s', '?')}s, total {row.get('latency_s', '?')}s"

    if test == "pricing_probe":
        billing = detail.get("billing") or {}
        rate = billing.get("rate_per_million")
        if rate:
            return f"pricing probe → ${rate:.6f} / 1M tokens"
        return "pricing probe → unavailable"

    if test == "max_output":
        tok = detail.get("tokens_out", row.get("tokens_out", 0))
        return f"max output → {tok} tokens in {row.get('latency_s', '?')}s ({row.get('tps', '?')} tps)"

    if test == "tool_calling":
        fn = detail.get("fn", "?")
        args = detail.get("args", {})
        return f"tool call → {fn}({args}) in {row.get('latency_s', '?')}s"

    if test == "json_mode":
        preview = detail.get("content_preview", "")
        return f"json mode → {'valid' if row['ok'] else 'invalid'} in {row.get('latency_s', '?')}s · {preview[:60]}"

    if test == "multimodality":
        reply = detail.get("reply", "")
        return f"vision → '{reply}' in {row.get('latency_s', '?')}s"

    if test == "max_input":
        max_k = detail.get("max_ok_k", 0)
        return f"max context → {max_k}k tokens accepted"

    status = "pass" if row["ok"] else "fail"
    return f"{test} → {status}"


def metric_matches(metric_key: str, row: dict[str, Any]) -> bool:
    if metric_key == "failed_probes":
        return row["test_name"] != "pricing_probe" and not row["ok"]
    tests = METRIC_TESTS.get(metric_key, set())
    return row["test_name"] in tests


def _percentile(values: list[float], pct: float) -> float:
    clean = sorted(v for v in values if v is not None)
    if not clean:
        return 0.0
    if len(clean) == 1:
        return round(clean[0], 2)

    position = (len(clean) - 1) * pct
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return round(clean[int(position)], 2)
    weight = position - lower
    return round(clean[lower] * (1 - weight) + clean[upper] * weight, 2)


def _percentiles(values: list[float]) -> dict[str, float]:
    return {
        "p50": _percentile(values, 0.50),
        "p75": _percentile(values, 0.75),
        "p90": _percentile(values, 0.90),
        "p99": _percentile(values, 0.99),
    }


def _error_category(row: dict[str, Any]) -> str:
    error = str(row.get("error") or "").lower()
    if not error:
        return "unknown"
    if "empty stream" in error:
        return "empty_stream"
    if "mid-stream" in error or "stream" in error and "error" in error:
        return "stream_error"
    if "timed out" in error or "timeout" in error or "read operation timed out" in error:
        return "timeout"

    match = re.search(r"http\s+(\d{3})", error)
    if match:
        status = int(match.group(1))
        if status == 429:
            return "rate_limited"
        if status in (401, 402, 403, 404):
            return "auth_or_config"
        if status in (400, 413):
            return "bad_request"
        if status >= 500:
            return "upstream_5xx"

    if "invalid json" in error or "no tool_calls" in error or "wrong:" in error:
        return "capability_mismatch"
    return "other"


def _error_breakdown(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    tests: dict[str, set[str]] = {}
    for row in rows:
        if row["test_name"] == "pricing_probe" or row["ok"]:
            continue
        category = _error_category(row)
        counts[category] = counts.get(category, 0) + 1
        tests.setdefault(category, set()).add(row["test_name"])

    return [
        {"category": category, "count": count, "tests": sorted(tests.get(category, set()))}
        for category, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]


def _test_breakdown(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    tests: dict[str, dict[str, int]] = {}
    for row in rows:
        if row["test_name"] == "pricing_probe":
            continue
        item = tests.setdefault(row["test_name"], {"total": 0, "passed": 0})
        item["total"] += 1
        if row["ok"]:
            item["passed"] += 1

    return [
        {
            "test": test,
            "passed": item["passed"],
            "total": item["total"],
            "pct": round(100 * item["passed"] / item["total"], 1) if item["total"] else 0,
        }
        for test, item in sorted(tests.items())
    ]


def _capability_matrix(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups = [
        ("streaming", {"output_ladder"}),
        ("input", {"input_ladder"}),
        ("json", {"json_mode"}),
        ("tools", {"tool_calling"}),
        ("vision", {"multimodality"}),
    ]
    matrix: list[dict[str, Any]] = []
    for name, tests in groups:
        scoped = [row for row in rows if row["test_name"] in tests]
        if not scoped:
            continue
        passed = sum(1 for row in scoped if row["ok"])
        matrix.append(
            {
                "capability": name,
                "passed": passed,
                "total": len(scoped),
                "pct": round(100 * passed / len(scoped), 1),
            }
        )
    return matrix


def compute_metric_values(
    rows: list[dict[str, Any]],
    *,
    spend_values: dict[str, Any] | None = None,
) -> dict[str, Any]:
    spend = spend_values or {"pricing_available": False}
    pricing_available = bool(spend.get("pricing_available"))
    base = {
        "pricing_available": pricing_available,
        "real_spend_per_m": spend.get("real_spend_per_m"),
        "real_spend_max": spend.get("real_spend_max"),
        "real_spend_input_per_m": spend.get("real_spend_input_per_m"),
        "real_spend_output_per_m": spend.get("real_spend_output_per_m"),
        "real_spend_input_max": spend.get("real_spend_input_max"),
        "real_spend_output_max": spend.get("real_spend_output_max"),
    }
    metered_rows = [r for r in rows if r["test_name"] != "pricing_probe"]
    if not metered_rows:
        return {
            "api_uptime_pct": 0.0,
            "latency_s": 0,
            "latency_percentiles": _percentiles([]),
            "ttft_percentiles": _percentiles([]),
            "failed_probes_pct": 0,
            "failed_probes": 0,
            "error_breakdown": [],
            "top_error_category": None,
            "test_breakdown": [],
            "output_speed_tps": 0,
            "output_speed_percentiles": _percentiles([]),
            "stream_speed_tps": 0,
            "stream_speed_percentiles": _percentiles([]),
            "stream_success_pct": 0,
            "output_success_pct": 0,
            "real_world_gen_pct": 0,
            "capability_matrix": [],
            **base,
            "total_tokens": 0,
            "total_probes": 0,
        }

    connectivity = next((r for r in metered_rows if r["test_name"] == "connectivity"), None)
    latencies = [r["latency_s"] for r in metered_rows if r.get("latency_s") is not None]
    stream_speeds = [r["stream_tps"] for r in metered_rows if r.get("stream_tps") is not None]
    output_speeds = [r["tps"] for r in metered_rows if r.get("tps") is not None]
    if not output_speeds:
        output_speeds = [r["stream_tps"] for r in metered_rows if r.get("stream_tps") is not None]
    real_world = [r for r in metered_rows if r["test_name"] in REAL_WORLD_TESTS]
    total = len(metered_rows)
    failed = sum(1 for r in metered_rows if not r["ok"])
    output_rows = [r for r in metered_rows if r["test_name"] in {"output_ladder", "max_output"}]
    stream_rows = [r for r in metered_rows if r["test_name"] == "output_ladder"]
    total_tokens = sum(
        (r.get("tokens_in") or 0) + (r.get("tokens_out") or 0)
        for r in metered_rows
    )
    errors = _error_breakdown(metered_rows)

    return {
        "api_uptime_pct": round(100.0 if connectivity and connectivity["ok"] else 0.0, 1),
        "latency_s": round(sum(latencies) / len(latencies), 2) if latencies else 0,
        "latency_percentiles": _percentiles(latencies),
        "ttft_percentiles": _percentiles(
            [r["ttft_s"] for r in metered_rows if r.get("ttft_s") is not None]
        ),
        "failed_probes_pct": round(100 * failed / total, 1) if total else 0,
        "failed_probes": failed,
        "error_breakdown": errors,
        "top_error_category": errors[0]["category"] if errors else None,
        "test_breakdown": _test_breakdown(metered_rows),
        "output_speed_tps": round(sum(output_speeds) / len(output_speeds), 2)
        if output_speeds
        else 0,
        "output_speed_percentiles": _percentiles(output_speeds),
        "stream_speed_tps": round(sum(stream_speeds) / len(stream_speeds), 2)
        if stream_speeds
        else 0,
        "stream_speed_percentiles": _percentiles(stream_speeds),
        "stream_success_pct": round(
            100 * sum(1 for r in stream_rows if r["ok"]) / len(stream_rows), 1
        )
        if stream_rows
        else 0,
        "output_success_pct": round(
            100 * sum(1 for r in output_rows if r["ok"]) / len(output_rows), 1
        )
        if output_rows
        else 0,
        "real_world_gen_pct": round(100 * sum(1 for r in real_world if r["ok"]) / len(real_world), 1)
        if real_world
        else 0,
        "capability_matrix": _capability_matrix(metered_rows),
        **base,
        "total_tokens": total_tokens,
        "total_probes": total,
    }


def format_metric_value(metric_key: str, values: dict[str, Any]) -> str:
    if metric_key == "api_uptime":
        return f"{values['api_uptime_pct']}%"
    if metric_key == "latency":
        return f"{values['latency_s']}s"
    if metric_key == "failed_probes":
        return f"{values['failed_probes_pct']}%"
    if metric_key == "output_speed":
        return f"{values['output_speed_tps']} tps"
    if metric_key == "stream_speed":
        return f"{values['stream_speed_tps']} tps"
    if metric_key == "real_world_gen":
        return f"{values['real_world_gen_pct']}%"
    if metric_key == "real_spend":
        if not values.get("pricing_available"):
            return "—"
        low = values["real_spend_per_m"]
        high = values.get("real_spend_max", low)
        if high != low:
            return f"${low:.6f}–${high:.6f}"
        return f"${low:.6f}"
    return "—"
