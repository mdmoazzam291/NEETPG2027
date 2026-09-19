"""Server-side AI provider adapters for NeuralVault Brain.

API keys and provider URLs are read only from server configuration. Browser clients
choose among configured providers but never send or receive credentials.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any
from urllib import error, parse, request

from app.config import Settings


class AIProviderError(RuntimeError):
    """Sanitized provider failure safe to surface through the API."""


@dataclass(frozen=True)
class ProviderInfo:
    id: str
    label: str
    configured: bool
    model: str | None


def provider_infos(settings: Settings) -> list[ProviderInfo]:
    return [
        ProviderInfo(
            id="openai",
            label="OpenAI",
            configured=bool(settings.openai_api_key and settings.openai_model),
            model=settings.openai_model,
        ),
        ProviderInfo(
            id="gemini",
            label="Google Gemini",
            configured=bool(settings.gemini_api_key and settings.gemini_model),
            model=settings.gemini_model,
        ),
        ProviderInfo(
            id="anthropic",
            label="Anthropic Claude",
            configured=bool(settings.anthropic_api_key and settings.anthropic_model),
            model=settings.anthropic_model,
        ),
        ProviderInfo(
            id="compatible",
            label="OpenAI-compatible / local",
            configured=bool(settings.compatible_base_url and settings.compatible_model),
            model=settings.compatible_model,
        ),
    ]


def _post_json(
    url: str,
    *,
    headers: dict[str, str],
    payload: dict[str, Any],
    timeout: float,
) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", **headers},
    )
    try:
        with request.urlopen(req, timeout=timeout) as response:
            raw = response.read()
    except error.HTTPError as exc:
        raise AIProviderError(f"provider request failed with HTTP {exc.code}") from exc
    except (error.URLError, TimeoutError) as exc:
        raise AIProviderError("provider request could not be completed") from exc

    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AIProviderError("provider returned an invalid response") from exc


def _openai(settings: Settings, prompt: str, max_output_tokens: int) -> tuple[str, str]:
    if not settings.openai_api_key or not settings.openai_model:
        raise AIProviderError("OpenAI is not configured")
    data = _post_json(
        "https://api.openai.com/v1/responses",
        headers={"Authorization": f"Bearer {settings.openai_api_key}"},
        payload={
            "model": settings.openai_model,
            "input": prompt,
            "max_output_tokens": max_output_tokens,
        },
        timeout=settings.ai_timeout_seconds,
    )
    text = data.get("output_text")
    if not text:
        parts: list[str] = []
        for item in data.get("output", []):
            for block in item.get("content", []) if isinstance(item, dict) else []:
                if isinstance(block, dict) and block.get("type") == "output_text" and block.get("text"):
                    parts.append(str(block["text"]))
        text = "\n".join(parts).strip()
    if not text:
        raise AIProviderError("OpenAI returned no text")
    return settings.openai_model, str(text)


def _gemini(settings: Settings, prompt: str, max_output_tokens: int) -> tuple[str, str]:
    if not settings.gemini_api_key or not settings.gemini_model:
        raise AIProviderError("Gemini is not configured")
    model_path = parse.quote(settings.gemini_model, safe="-._/")
    data = _post_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model_path}:generateContent",
        headers={"x-goog-api-key": settings.gemini_api_key},
        payload={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": max_output_tokens},
        },
        timeout=settings.ai_timeout_seconds,
    )
    candidates = data.get("candidates") or []
    parts = (
        candidates[0].get("content", {}).get("parts", [])
        if candidates and isinstance(candidates[0], dict)
        else []
    )
    text = "\n".join(
        str(part.get("text"))
        for part in parts
        if isinstance(part, dict) and part.get("text")
    ).strip()
    if not text:
        raise AIProviderError("Gemini returned no text")
    return settings.gemini_model, text


def _anthropic(settings: Settings, prompt: str, max_output_tokens: int) -> tuple[str, str]:
    if not settings.anthropic_api_key or not settings.anthropic_model:
        raise AIProviderError("Anthropic is not configured")
    data = _post_json(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": settings.anthropic_api_key,
            "anthropic-version": "2023-06-01",
        },
        payload={
            "model": settings.anthropic_model,
            "max_tokens": max_output_tokens,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=settings.ai_timeout_seconds,
    )
    text = "\n".join(
        str(block.get("text"))
        for block in data.get("content", [])
        if isinstance(block, dict) and block.get("type") == "text" and block.get("text")
    ).strip()
    if not text:
        raise AIProviderError("Anthropic returned no text")
    return settings.anthropic_model, text


def _compatible(settings: Settings, prompt: str, max_output_tokens: int) -> tuple[str, str]:
    if not settings.compatible_base_url or not settings.compatible_model:
        raise AIProviderError("OpenAI-compatible provider is not configured")
    base = settings.compatible_base_url.rstrip("/")
    parsed = parse.urlparse(base)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise AIProviderError("OpenAI-compatible base URL is invalid")
    headers: dict[str, str] = {}
    if settings.compatible_api_key:
        headers["Authorization"] = f"Bearer {settings.compatible_api_key}"
    data = _post_json(
        f"{base}/v1/chat/completions",
        headers=headers,
        payload={
            "model": settings.compatible_model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_output_tokens,
        },
        timeout=settings.ai_timeout_seconds,
    )
    choices = data.get("choices") or []
    text = (
        choices[0].get("message", {}).get("content")
        if choices and isinstance(choices[0], dict)
        else None
    )
    if isinstance(text, list):
        text = "\n".join(
            str(x.get("text", ""))
            for x in text
            if isinstance(x, dict)
        ).strip()
    if not text:
        raise AIProviderError("OpenAI-compatible provider returned no text")
    return settings.compatible_model, str(text)


def generate_text(
    settings: Settings,
    *,
    provider: str,
    prompt: str,
    max_output_tokens: int,
) -> tuple[str, str]:
    adapters = {
        "openai": _openai,
        "gemini": _gemini,
        "anthropic": _anthropic,
        "compatible": _compatible,
    }
    adapter = adapters.get(provider)
    if adapter is None:
        raise AIProviderError("unknown AI provider")
    return adapter(settings, prompt, max_output_tokens)
