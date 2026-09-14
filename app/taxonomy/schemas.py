"""Strict request contracts for taxonomy administration."""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Name120 = Annotated[str, Field(min_length=1, max_length=120)]
Name160 = Annotated[str, Field(min_length=1, max_length=160)]
Code = Annotated[str, Field(min_length=1, max_length=32)]
Text = Annotated[str, Field(min_length=1, max_length=20000)]
PositiveId = Annotated[int, Field(strict=True, gt=0)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class UniqueIdsMixin:
    @model_validator(mode="after")
    def unique_ids(self):
        for field in ("subject_ids", "system_ids"):
            if hasattr(self, field):
                value = getattr(self, field)
                if value is not None and len(value) != len(set(value)):
                    raise ValueError(f"{field} contains repeated IDs")
        return self


class SubjectInput(StrictModel):
    name: Name120
    code: Code | None = None


class SubjectEdit(StrictModel):
    name: Name120 | None = None
    code: Code | None = None

    @model_validator(mode="after")
    def not_empty(self):
        if not self.model_fields_set:
            raise ValueError("provide at least one field")
        return self


class SystemInput(StrictModel):
    name: Name120


class SystemEdit(StrictModel):
    name: Name120 | None = None

    @model_validator(mode="after")
    def not_empty(self):
        if not self.model_fields_set:
            raise ValueError("provide at least one field")
        return self


class SubjectSystemInput(StrictModel):
    subject_id: PositiveId
    system_id: PositiveId


class TopicInput(UniqueIdsMixin, StrictModel):
    name: Name160
    description: Text | None = None
    subject_ids: list[PositiveId] = Field(default_factory=list, max_length=30)
    system_ids: list[PositiveId] = Field(default_factory=list, max_length=30)


class TopicEdit(UniqueIdsMixin, StrictModel):
    name: Name160 | None = None
    description: Text | None = None
    lifecycle_status: Literal["active", "archived"] | None = None
    subject_ids: list[PositiveId] | None = Field(default=None, max_length=30)
    system_ids: list[PositiveId] | None = Field(default=None, max_length=30)

    @model_validator(mode="after")
    def not_empty(self):
        if not self.model_fields_set:
            raise ValueError("provide at least one field")
        return self


class SubtopicInput(StrictModel):
    topic_id: PositiveId
    name: Name160
    description: Text | None = None


class SubtopicEdit(StrictModel):
    topic_id: PositiveId | None = None
    name: Name160 | None = None
    description: Text | None = None
    lifecycle_status: Literal["active", "archived"] | None = None

    @model_validator(mode="after")
    def not_empty(self):
        if not self.model_fields_set:
            raise ValueError("provide at least one field")
        return self
