"""NeuralVault Brain AI API.

This endpoint intentionally accepts grounded prompts only. Provider credentials remain
in server environment variables and are never accepted from the browser.
"""
from __future__ import annotations

from typing import Literal
from collections import defaultdict, deque
import hashlib
import secrets
import threading
import time

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import Settings
from app.ai.providers import AIProviderError, generate_text, provider_infos


router = APIRouter(prefix="/ai", tags=["ai"])
_RATE_WINDOWS: dict[str, deque[float]] = defaultdict(deque)
_RATE_LOCK = threading.Lock()


def _check_rate_limit(token: str, limit: int) -> None:
    now = time.monotonic()
    key = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with _RATE_LOCK:
        window = _RATE_WINDOWS[key]
        cutoff = now - 60.0
        while window and window[0] < cutoff:
            window.popleft()
        if len(window) >= limit:
            raise HTTPException(status_code=429, detail="NeuralVault AI gateway rate limit exceeded")
        window.append(now)


class GenerateRequest(BaseModel):
    provider: Literal["openai", "gemini", "anthropic", "compatible"]
    prompt: str = Field(min_length=1, max_length=50_000)
    max_output_tokens: int = Field(default=1200, ge=64, le=4096)


class GenerateResponse(BaseModel):
    provider: str
    model: str
    text: str


def _settings(request: Request) -> Settings:
    return request.app.state.settings


@router.get("/providers")
def providers(
    request: Request,
    x_neuralvault_token: str | None = Header(default=None),
) -> dict[str, object]:
    settings = _settings(request)
    rows = provider_infos(settings)
    gateway_ready = bool(settings.ai_access_token)
    gateway_authorized = bool(
        gateway_ready
        and x_neuralvault_token
        and secrets.compare_digest(x_neuralvault_token, settings.ai_access_token or "")
    )
    return {
        "local_evidence": True,
        "gateway_ready": gateway_ready,
        "gateway_authorized": gateway_authorized,
        "providers": [
            {
                "id": row.id,
                "label": row.label,
                "configured": row.configured,
                "model": row.model,
            }
            for row in rows
        ],
    }


@router.post("/generate", response_model=GenerateResponse)
def generate(
    payload: GenerateRequest,
    request: Request,
    x_neuralvault_token: str | None = Header(default=None),
) -> GenerateResponse:
    settings = _settings(request)
    if not settings.ai_access_token:
        raise HTTPException(status_code=503, detail="AI gateway access token is not configured")
    if not x_neuralvault_token or not secrets.compare_digest(x_neuralvault_token, settings.ai_access_token):
        raise HTTPException(status_code=401, detail="invalid NeuralVault AI gateway token")
    _check_rate_limit(x_neuralvault_token, settings.ai_max_requests_per_minute)
    try:
        model, text = generate_text(
            settings,
            provider=payload.provider,
            prompt=payload.prompt,
            max_output_tokens=payload.max_output_tokens,
        )
    except AIProviderError as exc:
        message = str(exc)
        status = 503 if "not configured" in message else 502
        raise HTTPException(status_code=status, detail=message) from exc

    return GenerateResponse(
        provider=payload.provider,
        model=model,
        text=text,
    )
