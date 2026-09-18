# NEET-PG PYQ priority bank: 2021-2026

This directory is the first production-facing slice of the 10-year PYQ project.

## Current seed

- 60 normalized recall-derived questions
- 10 questions from each exam year: 2021, 2022, 2023, 2024, 2025 and 2026
- every row includes Subject → System → Topic → Subtopic
- every row includes `exam_year`, `exam_session`, `repeat_key`, provenance and verification state
- questions are independently normalized/paraphrased from public memory-recall sources; exact official wording is not claimed
- all rows remain `unverified` until the project's medical-review workflow promotes them

## Repeat model

`repeat_key` groups the same underlying tested concept across exam years. A repeat count is the number of distinct NEET-PG years in which that concept appears in this dataset, not the number of websites reproducing the same recall.

Examples in the initial seed:

- `marfan-fbn1`: 2025, 2026
- `opioid-toxicity-naloxone`: 2022, 2026

This is deliberately concept-level recurrence. Small wording changes or different clinical vignettes do not create fake extra repeats.

## Expansion order

Expand each year toward the fullest defensible recall set in this order:

1. 2026
2. 2025
3. 2024, preserving shift/session metadata
4. 2023
5. 2022
6. 2021

Then continue the ten-year project with 2020, 2019, 2018 and 2017.

## Quality rule

A question should not enter the trusted study bank merely because a recall website supplies an answer. Preserve the source, normalize the item, deduplicate the underlying concept, and leave medical verification explicit.
