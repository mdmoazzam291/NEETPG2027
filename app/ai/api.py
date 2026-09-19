"""NeuralVault Brain AI API.

This endpoint intentionally accepts grounded prompts only. Provider credentials remain
in server environment variables and are never accepted from the browser.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import Settings
from app.ai.providers import AIProviderError, generate_text, provider_infos


router = APIRouter(prefix="/ai", tags=["ai"])


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
def providers(request: Request) -> dict[str, object]:
    rows = provider_infos(_settings(request))
    return {
        "local_evidence": True,
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
def generate(payload: GenerateRequest, request: Request) -> GenerateResponse:
    settings = _settings(request)
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
