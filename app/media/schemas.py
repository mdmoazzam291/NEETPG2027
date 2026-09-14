"""Strict contracts for local question-image ingestion."""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

PositiveId = Annotated[int, Field(strict=True, gt=0)]
AltText = Annotated[str, Field(min_length=1, max_length=1000)]
Caption = Annotated[str, Field(min_length=1, max_length=4000)]
Base64Payload = Annotated[str, Field(min_length=1, max_length=7_100_000)]
ImageMime = Literal["image/png", "image/jpeg", "image/webp"]
VisualType = Literal["image", "diagram", "table"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MediaUploadInput(StrictModel):
    media_type: VisualType = "image"
    mime_type: ImageMime
    content_base64: Base64Payload
    alt_text: AltText
    caption: Caption | None = None
    question_option_id: PositiveId | None = None


class MediaEditInput(StrictModel):
    media_type: VisualType | None = None
    alt_text: AltText | None = None
    caption: Caption | None = None
    question_option_id: PositiveId | None = None

    @model_validator(mode="after")
    def valid_patch(self):
        if not self.model_fields_set:
            raise ValueError("provide at least one field")
        for field in ("media_type", "alt_text"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self
