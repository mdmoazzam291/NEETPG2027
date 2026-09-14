"""Versioned import contract; unknown fields are rejected, never silently lost."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

Text = Annotated[str, Field(min_length=1, max_length=20000)]
Identifier = Annotated[str, Field(min_length=1, max_length=160)]
PositiveId = Annotated[int, Field(strict=True, gt=0)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class OptionInput(StrictModel):
    text: Text
    is_correct: StrictBool = False
    label: Annotated[str, Field(min_length=1, max_length=16)] | None = None
    explanation: Text | None = None


class QuestionInput(StrictModel):
    external_id: Identifier
    stem: Text
    question_type: Literal["single_best_answer", "multiple_correct", "true_false", "assertion_reason"] = "single_best_answer"
    options: Annotated[list[OptionInput], Field(min_length=2, max_length=10)]
    answer_explanation: Text | None = None
    reference_text: Text | None = None
    difficulty: Annotated[int, Field(strict=True, ge=1, le=5)] | None = None
    is_clinical: StrictBool = False
    is_integrated: StrictBool = False
    exam_administration_id: PositiveId | None = None
    question_number: Annotated[str, Field(min_length=1, max_length=64)] | None = None
    subject_ids: list[PositiveId] = Field(default_factory=list, max_length=30)
    system_ids: list[PositiveId] = Field(default_factory=list, max_length=30)
    topic_ids: list[PositiveId] = Field(default_factory=list, max_length=100)
    subtopic_ids: list[PositiveId] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def valid_answer(self):
        correct = sum(option.is_correct for option in self.options)
        if self.question_type == "multiple_correct":
            if correct < 1:
                raise ValueError("multiple_correct requires at least one correct option")
        elif correct != 1:
            raise ValueError("this question type requires exactly one correct option")
        if self.question_type == "true_false" and len(self.options) != 2:
            raise ValueError("true_false requires two options")
        texts = [" ".join(o.text.split()).casefold() for o in self.options]
        labels = [o.label for o in self.options if o.label is not None]
        if len(set(texts)) != len(texts) or len(set(labels)) != len(labels):
            raise ValueError("option text and explicit labels must be unique")
        for name in ("subject_ids", "system_ids", "topic_ids", "subtopic_ids"):
            ids = getattr(self, name)
            if len(ids) != len(set(ids)):
                raise ValueError(f"{name} contains repeated IDs")
        return self


class PreviewInput(StrictModel):
    source_id: PositiveId
    input_format: Literal["csv", "json"]
    input_name: Annotated[str, Field(min_length=1, max_length=255)]
    content: Annotated[str, Field(min_length=1, max_length=2_000_000)]


class SourceInput(StrictModel):
    name: Identifier
    external_namespace: Identifier
    source_type: Literal["official_paper", "official_key", "publisher", "dataset", "manual_entry", "other"]
    citation: Text | None = None


class ReviewInput(StrictModel):
    action: Literal["reject", "create", "link"]
    question_id: PositiveId | None = None
    note: Annotated[str, Field(min_length=1, max_length=2000)]

    @model_validator(mode="after")
    def link_target(self):
        if (self.action == "link") != (self.question_id is not None):
            raise ValueError("question_id is required only for link")
        return self
