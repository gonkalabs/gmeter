import json
from typing import Any

from app.probes.client import GonkaClient
from app.probes.constants import (
    CONTEXT_SIZES,
    INPUT_SIZES,
    MULTIMODAL_MODELS,
    OUTPUT_SIZES,
)


def _result(
    test_name: str,
    ok: bool,
    *,
    latency_s: float | None = None,
    ttft_s: float | None = None,
    tps: float | None = None,
    stream_tps: float | None = None,
    tokens_in: int | None = None,
    tokens_out: int | None = None,
    detail: dict | None = None,
    error: str | None = None,
    gonka_limitation: bool = False,
) -> dict[str, Any]:
    payload = detail or {}
    return {
        "test_name": test_name,
        "ok": ok,
        "latency_s": latency_s,
        "ttft_s": ttft_s,
        "tps": tps,
        "stream_tps": stream_tps,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "detail": payload,
        "error": error,
        "gonka_limitation": gonka_limitation,
    }


def _with_response(detail: dict | None, response: str | None) -> dict:
    payload = dict(detail or {})
    if response:
        payload["response"] = response[:1800]
    return payload


def _with_meta(
    detail: dict | None,
    *,
    response: str | None = None,
    request: dict | None = None,
    billing: dict | None = None,
) -> dict:
    payload = _with_response(detail, response)
    if request is not None:
        payload["request"] = request
    if billing:
        payload["billing"] = billing
    return payload


def _chat_request(body: dict, *, stream: bool = False) -> dict:
    req = {"method": "POST", "path": "/chat/completions", "body": body}
    if stream:
        req["stream"] = True
    return req


def _json_candidate(text: str) -> tuple[Any | None, str]:
    cleaned = text.strip()
    if "</think>" in cleaned:
        cleaned = cleaned.split("</think>", 1)[1].strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()

    attempts = [cleaned]
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        attempts.append(cleaned[start : end + 1])

    for candidate in attempts:
        try:
            return json.loads(candidate), candidate
        except Exception:
            continue
    return None, cleaned


def _completion_text(data: dict | None) -> str:
    if not data:
        return ""
    content = ((data.get("choices") or [{}])[0].get("message") or {}).get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or ""))
            else:
                parts.append(str(item))
        return "".join(parts)
    return ""


def _approx_output_tokens(data: dict | None, content: str) -> int:
    usage = data.get("usage", {}) if data else {}
    tokens = usage.get("completion_tokens")
    if isinstance(tokens, int) and tokens > 0:
        return tokens
    return max(1, len(content.split()))


def test_connectivity(client: GonkaClient) -> dict[str, Any]:
    probe = client.probe_endpoint()
    return _result(
        "connectivity",
        probe.get("ok", False),
        latency_s=probe.get("elapsed"),
        detail=_with_meta(
            probe,
            request={"method": "GET", "path": "/models"},
        ),
        error=probe.get("error"),
    )


def test_output_ladder(client: GonkaClient, model: str) -> list[dict[str, Any]]:
    results = []
    for n in OUTPUT_SIZES:
        body = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": f"Write exactly {n} words describing the sky. Do not stop early.",
                }
            ],
            "max_tokens": n + 20,
        }
        ttft, total, tokens, err, response, billing = client.stream_measure(body, timeout=120)
        if err and ttft is None:
            if err == "empty stream":
                data, elapsed, post_err, post_response, post_billing = client.post(body, timeout=120)
                content = _completion_text(data)
                if content:
                    fallback_tokens = _approx_output_tokens(data, content)
                    tps = round(fallback_tokens / elapsed, 2) if elapsed > 0 else 0
                    results.append(
                        _result(
                            "output_ladder",
                            True,
                            latency_s=round(elapsed, 2),
                            tps=tps,
                            tokens_out=fallback_tokens,
                            detail=_with_meta(
                                {
                                    "n": n,
                                    "tps": tps,
                                    "fallback": "non_stream",
                                    "stream_error": err,
                                    "stream_response": response,
                                },
                                response=post_response,
                                request=_chat_request(body),
                                billing=post_billing or billing,
                            ),
                        )
                    )
                    continue
                if post_err:
                    err = f"{err}; non-stream fallback failed: {post_err}"
            results.append(
                _result(
                    "output_ladder",
                    False,
                    detail=_with_meta(
                        {"n": n},
                        response=response,
                        request=_chat_request(body, stream=True),
                        billing=billing,
                    ),
                    error=err,
                )
            )
        else:
            tps = round(tokens / total, 2) if total > 0 else 0
            results.append(
                _result(
                    "output_ladder",
                    True,
                    latency_s=round(total, 2),
                    ttft_s=round(ttft or 0, 2),
                    stream_tps=tps,
                    tokens_out=tokens,
                    detail=_with_meta(
                        {"n": n, "tps": tps},
                        response=response,
                        request=_chat_request(body, stream=True),
                        billing=billing,
                    ),
                )
            )
    return results


def test_input_ladder(client: GonkaClient, model: str) -> list[dict[str, Any]]:
    results = []
    for _label, size_label, prompt in INPUT_SIZES:
        body = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 5,
        }
        ttft, total, _, err, response, billing = client.stream_measure(body)
        if err and ttft is None:
            results.append(
                _result(
                    "input_ladder",
                    False,
                    detail=_with_meta(
                        {"size": size_label},
                        response=response,
                        request=_chat_request(body, stream=True),
                        billing=billing,
                    ),
                    error=err,
                )
            )
        else:
            results.append(
                _result(
                    "input_ladder",
                    True,
                    latency_s=round(total, 2),
                    ttft_s=round(ttft or 0, 2),
                    detail=_with_meta(
                        {"size": size_label},
                        response=response,
                        request=_chat_request(body, stream=True),
                        billing=billing,
                    ),
                )
            )
    return results


def test_pricing_probe(client: GonkaClient, model: str) -> dict[str, Any]:
    body = {
        "model": model,
        "messages": [{"role": "user", "content": "Say OK."}],
        "max_tokens": 8,
    }
    data, elapsed, err, response, billing = client.post(body, timeout=60)
    usage = data.get("usage", {}) if data else {}
    ok = billing is not None
    return _result(
        "pricing_probe",
        ok,
        latency_s=round(elapsed, 2),
        tokens_in=usage.get("prompt_tokens"),
        tokens_out=usage.get("completion_tokens"),
        detail=_with_meta(
            {"billing_available": ok},
            response=response or (json.dumps(data, ensure_ascii=False)[:1800] if data else None),
            request=_chat_request(body),
            billing=billing,
        ),
        error=None if ok else (err or "billing unavailable"),
    )


def pricing_probe_from_rate(model: str, rate_per_million: float, source: str) -> dict[str, Any]:
    return _result(
        "pricing_probe",
        True,
        detail={
            "billing_available": True,
            "billing": {
                "rate_per_million": rate_per_million,
                "model": model,
                "source": source,
            },
        },
    )


def test_max_output(
    client: GonkaClient, model: str, min_output_tokens: int
) -> dict[str, Any]:
    body = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": (
                    "Write a comprehensive, detailed essay of at least 3000 words on the history of "
                    "artificial intelligence from the 1950s to 2024. Cover key milestones, researchers, "
                    "technical breakthroughs, and the societal impact of AI. Do not truncate."
                ),
            }
        ],
        "max_tokens": 32768,
    }
    data, elapsed, err, response, billing = client.post(body, timeout=600)
    if err or not data:
        return _result(
            "max_output",
            False,
            error=err,
            tokens_out=0,
            detail=_with_meta(None, response=response, request=_chat_request(body), billing=billing),
        )
    usage = data.get("usage", {})
    tok = usage.get("completion_tokens", 0)
    ok = tok >= min_output_tokens
    total_tokens = usage.get("prompt_tokens", 0) + tok
    tps = round(tok / elapsed, 2) if elapsed > 0 else 0
    return _result(
        "max_output",
        ok,
        latency_s=round(elapsed, 2),
        tps=tps,
        tokens_in=usage.get("prompt_tokens"),
        tokens_out=tok,
        detail=_with_meta(
            {"tokens_out": tok, "total_tokens": total_tokens},
            response=response or json.dumps(data, ensure_ascii=False)[:1800],
            request=_chat_request(body),
            billing=billing,
        ),
        error=None if ok else f"only {tok} tokens (need ≥{min_output_tokens})",
    )


def test_tool_calling(client: GonkaClient, model: str) -> dict[str, Any]:
    tools = [
        {
            "type": "function",
            "function": {
                "name": "add_numbers",
                "description": "Adds two integers.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "a": {"type": "integer"},
                        "b": {"type": "integer"},
                    },
                    "required": ["a", "b"],
                },
            },
        }
    ]
    req_body = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": "What is 57 + 38? Use the add_numbers tool.",
            }
        ],
        "tools": tools,
        "tool_choice": "required",
        "max_tokens": 128,
    }
    data, elapsed, err, response, billing = client.post(req_body, timeout=60)
    if err or not data:
        return _result(
            "tool_calling",
            False,
            latency_s=elapsed,
            error=err,
            detail=_with_meta(None, response=response, request=_chat_request(req_body), billing=billing),
        )
    tool_calls = (
        data.get("choices", [{}])[0].get("message", {}).get("tool_calls", [])
    )
    if not tool_calls:
        return _result(
            "tool_calling",
            False,
            latency_s=elapsed,
            error="no tool_calls",
            detail=_with_meta(None, response=response, request=_chat_request(req_body), billing=billing),
        )
    fn = tool_calls[0].get("function", {})
    try:
        args = json.loads(fn.get("arguments", "{}"))
    except Exception:
        args = {}
    ok = (
        fn.get("name") == "add_numbers"
        and args.get("a") == 57
        and args.get("b") == 38
    )
    usage = data.get("usage", {})
    return _result(
        "tool_calling",
        ok,
        latency_s=round(elapsed, 2),
        tokens_in=usage.get("prompt_tokens"),
        tokens_out=usage.get("completion_tokens"),
        detail=_with_meta(
            {"fn": fn.get("name"), "args": args},
            response=response or json.dumps(data, ensure_ascii=False)[:1800],
            request=_chat_request(req_body),
            billing=billing,
        ),
        error=None if ok else f"wrong: {fn.get('name')}({args})",
    )


def test_json_mode(client: GonkaClient, model: str) -> dict[str, Any]:
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "Respond only with valid JSON."},
            {
                "role": "user",
                "content": (
                    'Return JSON with: "capital" (capital of France), '
                    '"population_millions" (number), "languages" (array).'
                ),
            },
        ],
        "response_format": {"type": "json_object"},
        "max_tokens": 1024,
    }
    data, elapsed, err, response, billing = client.post(body, timeout=60)
    if err or not data:
        return _result(
            "json_mode",
            False,
            latency_s=elapsed,
            error=err,
            detail=_with_meta(None, response=response, request=_chat_request(body), billing=billing),
        )
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    parsed, parsed_text = _json_candidate(content)
    ok = isinstance(parsed, dict) and all(
        k in parsed for k in ("capital", "population_millions", "languages")
    )
    usage = data.get("usage", {})
    return _result(
        "json_mode",
        ok,
        latency_s=round(elapsed, 2),
        tokens_in=usage.get("prompt_tokens"),
        tokens_out=usage.get("completion_tokens"),
        detail=_with_meta(
            {"content_preview": parsed_text[:120]},
            response=response or json.dumps(data, ensure_ascii=False)[:1800],
            request=_chat_request(body),
            billing=billing,
        ),
        error=None if ok else "invalid JSON response",
    )


def test_multimodality(client: GonkaClient, model: str) -> dict[str, Any]:
    red_pixel = (
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
        "AAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="
    )
    body = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "What colour is this image? One word."},
                    {"type": "image_url", "image_url": {"url": red_pixel}},
                ],
            }
        ],
        "max_tokens": 8,
    }
    data, elapsed, err, response, billing = client.post(body, timeout=30)
    if err:
        return _result(
            "multimodality",
            False,
            latency_s=elapsed,
            error=err,
            gonka_limitation=True,
            detail=_with_meta(None, response=response, request=_chat_request(body), billing=billing),
        )
    content = (
        ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    ).strip()
    sees = any(k in content.lower() for k in ("red", "красн"))
    return _result(
        "multimodality",
        sees,
        latency_s=round(elapsed, 2),
        detail=_with_meta(
            {"reply": content},
            response=response or json.dumps(data, ensure_ascii=False)[:1800],
            request=_chat_request(body),
            billing=billing,
        ),
        error=None if sees else f"unexpected: {content[:60]}",
        gonka_limitation=not sees,
    )


def test_max_input(client: GonkaClient, model: str) -> dict[str, Any]:
    unit = (
        "The Gonka validator network enables decentralized AI inference at scale. "
        "Researchers use it to run long-horizon experiments with minimal latency. "
    )
    max_ok_k = 0
    ladder_results = []
    last_response = None
    for label, target_tokens in CONTEXT_SIZES:
        needed_chars = target_tokens * 4
        filler = (unit * (needed_chars // len(unit) + 2))[:needed_chars]
        prompt = filler + "\n\nSay only: OK"
        body = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 3,
        }
        ttft, total, _, err, response, billing = client.stream_measure(body, timeout=60)
        if response:
            last_response = response
        ok = ttft is not None
        ladder_results.append(
            {
                "label": label,
                "ok": ok,
                "ttft": round(ttft, 2) if ttft is not None else None,
                "error": (err or "")[:80] if not ok else None,
                "response": response,
                "billing": billing,
            }
        )
        if ok:
            max_ok_k = target_tokens // 1000
        else:
            break
    first_error = ladder_results[0]["error"] if ladder_results and not ladder_results[0]["ok"] else None
    if max_ok_k >= 64:
        err_msg = None
    elif max_ok_k == 0 and first_error:
        err_msg = first_error
    else:
        err_msg = f"max context {max_ok_k}k"
    return _result(
        "max_input",
        max_ok_k >= 64,
        detail=_with_meta(
            {"max_ok_k": max_ok_k, "results": ladder_results},
            response=last_response,
        ),
        error=err_msg,
        gonka_limitation=max_ok_k > 0 and max_ok_k < 128,
    )


def run_model_suite(
    client: GonkaClient,
    model: str,
    *,
    min_output_tokens: int,
    mode: str = "quick",
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []

    if mode == "limits":
        results.append(test_max_input(client, model))
        results.append(test_max_output(client, model, min_output_tokens))
        return results

    results.extend(test_output_ladder(client, model))
    results.extend(test_input_ladder(client, model))

    if mode == "quick":
        results.append(test_tool_calling(client, model))
        results.append(test_json_mode(client, model))
        return results

    results.append(test_max_input(client, model))
    results.append(test_max_output(client, model, min_output_tokens))
    results.append(test_tool_calling(client, model))
    results.append(test_json_mode(client, model))
    if model in MULTIMODAL_MODELS:
        results.append(test_multimodality(client, model))
    return results
