"""Validated inputs for the study interaction API."""
from typing import Literal

from pydantic import BaseModel, Field, model_validator


MistakeCategory = Literal[
    "knowledge_gap",
    "misread_stem",
    "confused_options",
    "overthinking",
    "guessing",
    "time_pressure",
    "calculation_error",
    "other",
]


class AttemptInput(BaseModel):
    selected_option_id: int | None = Field(default=None, gt=0)
    skipped: bool = False
    confidence: int = Field(ge=1, le=5)
    time_spent_seconds: int = Field(ge=0, le=7200)
    occurrence_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def selection_matches_action(self):
        if self.skipped and self.selected_option_id is not None:
            raise ValueError("skipped attempts cannot include a selected option")
        if not self.skipped and self.selected_option_id is None:
            raise ValueError("selected_option_id is required unless skipped")
        return self


class AttemptReviewInput(BaseModel):
    mistake_category: MistakeCategory | None = None
    user_notes: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def require_change(self):
        if not self.model_fields_set:
            raise ValueError("provide a mistake category or note")
        return self
