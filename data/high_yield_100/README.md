# NEET-PG / INI-CET high-yield 100 stress-test bank

This directory contains 100 original single-best-answer medical questions created to exercise the Phase 3 import pipeline with realistic NEET-PG/INI-CET-style content.

## Important provenance

- These are **original test items**, not recalled PYQs and not copied from an examination paper.
- Medical content is intentionally stored as **unverified**, matching the application's provenance rules.
- Each question includes a concise explanation plus subject/topic text in `reference_text`.
- The bank is split into four 25-question JSON shards for repository readability. The regression test loads all four and submits all 100 questions to `/api/imports/preview` as one JSON batch.

## Coverage

The 100 items span 19 subjects: Anatomy, Physiology, Biochemistry, Pathology, Pharmacology, Microbiology, Forensic Medicine, Community Medicine, ENT, Ophthalmology, Medicine, Surgery, Obstetrics and Gynecology, Pediatrics, Orthopedics, Dermatology, Psychiatry, Radiology, and Anesthesia.

The weighting intentionally favors major clinical and high-yield subjects while retaining broad MBBS coverage.

## Validation

`tests/test_high_yield_100.py` verifies:

- exactly 100 sequential unique IDs (`hy100-001` through `hy100-100`);
- 100 unique stems;
- all 19 expected subjects are represented;
- every row passes the versioned `QuestionInput` schema;
- every item has four options and exactly one keyed answer;
- provenance text explicitly marks every item as original and medically unverified;
- all 100 items can be previewed and committed atomically through the real migrated Phase 3 API;
- the completed batch is idempotent and produces exactly 100 questions and 100 occurrences.
