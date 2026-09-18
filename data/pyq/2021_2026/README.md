# NEET-PG PYQ priority bank: 2021-2026

This directory is the first production-facing slice of the 10-year PYQ project.

## Current seed

- 405 normalized recall-derived questions
- year counts: 2021 = 20, 2022 = 20, 2023 = 20, 2024 = 185, 2025 = 140, 2026 = 20
- every row includes Subject → System → Topic → Subtopic
- every row includes `exam_year`, `exam_session`, `repeat_key`, provenance and verification state
- questions are independently normalized/paraphrased from public memory-recall sources; exact official wording is not claimed
- all rows remain `unverified` until the project's medical-review workflow promotes them

## Repeat model

`repeat_key` groups the same underlying tested concept across exam years. A repeat count is the number of distinct NEET-PG years in which that concept appears in this dataset, not the number of websites reproducing the same recall.

Examples already detected:

- `marfan-fbn1`: 2025, 2026
- `opioid-toxicity-naloxone`: 2022, 2026

This is deliberately concept-level recurrence. Small wording changes or different clinical vignettes do not create fake extra repeats.

## Expansion order

Expansion is source-backed and proceeds toward the fullest defensible recall set. Current priority state:

1. 2025 substantially expanded to 140 normalized recalls.
2. 2024 substantially expanded to 185 normalized recalls, preserving shift/session metadata where sources support it.
3. 2026, 2023, 2022 and 2021 remain at 20-item high-confidence seeds.
4. Continue the ten-year project with 2020, 2019, 2018 and 2017 after the recent-year sets are reviewed/expanded.

## Quality rule

A question should not enter the trusted study bank merely because a recall website supplies an answer. Preserve the source, normalize the item, deduplicate the underlying concept, and leave medical verification explicit.
