# NEET-PG PYQ recall ingest: 2017-2026

## Scope

This dataset covers ten exam years, **2017 through 2026 inclusive**.

Publicly available NEET-PG "PYQs" in this period are generally **memory-based reconstructions / recalls**, not a conventional official paper. Every imported occurrence must therefore retain its source and exam year/session.

Source discovery is tracked in `data/pyq/source_manifest_2017_2026.json`.

## Target output

Use the existing Phase 3 import contract. A finalized row should contain:

- `external_id`: stable source-scoped ID, e.g. `neetpg-2024-shift1-prepp-001`
- `stem`: normalized/reconstructed question stem
- `question_type`: normally `single_best_answer`
- `options`: 2-10 ordered options with exactly one correct answer unless the source clearly supports another type
- `answer_explanation`: concise medically checked explanation
- `reference_text`: year + source + source URL + recall status
- `exam_administration_id`: NEET-PG year/session occurrence
- taxonomy IDs when available
- `is_clinical` and `is_integrated`

## Provenance states

Use these source labels during staging:

1. `memory_based_recall_reviewed` — recall bank with explicit cross-check/review process
2. `memory_based_recall` — year-specific recalled questions/answers
3. `memory_based_recall_pdf` — downloadable recall compilation
4. `memory_based_recall_index` — landing/index page linking to recall PDFs
5. `memory_based_recall_analysis` — analysis page useful for recovering topics but not sufficient alone for an exact question row

Do **not** upgrade a question's medical verification state merely because a source calls it "verified." The app's verification state remains independent.

## Deduplication

The same recalled question often appears on several sites with wording drift.

For each candidate:
- normalize whitespace/case/punctuation;
- compare topic + clinical facts + ask;
- preserve one canonical question;
- attach each independent year/source appearance as a separate occurrence;
- if two sources disagree on the answer, keep the row unverified and flag it for review;
- image-based recalls without the original usable image should be tagged as image-dependent and not silently converted into a text-only exact duplicate.

## Copyright-safe dataset rule

Do not bulk-copy third-party recall banks verbatim into the repository. Store:
- user-authorized/imported source files when permission is clear, or
- independently normalized/paraphrased recall questions with source provenance.

The goal is an auditable study bank, not a mirrored copy of another site's database.

## Recommended ingestion order

1. 2026
2. 2025
3. 2024 Shift 1 and Shift 2
4. 2023
5. 2022
6. 2021
7. 2020
8. 2019
9. 2018
10. 2017

Recent papers should be processed first because they best match the current clinical/application-heavy style; older recalls remain useful for repeated concepts.

## Batch strategy

The existing import API accepts at most 500 rows per batch. Use one source/year/session per batch whenever practical.

Suggested namespaces:

```
neetpg-2026-careers360
neetpg-2025-neetpgai
neetpg-2024-shift1-shiksha
neetpg-2024-shift2-shiksha
neetpg-2023-shiksha
neetpg-2022-collegedekho
neetpg-2021-shiksha
neetpg-2020-neetpgai
neetpg-2019-prepp
neetpg-2018-prepp
neetpg-2017-prepp
```

## Quality gates before commit

A row can move from staging to the practice bank only when:
- year/source provenance exists;
- stem is understandable without missing essential context;
- option set is complete enough to solve;
- marked answer is medically defensible;
- duplicate status has been reviewed;
- image-dependent questions are either linked to usable media or clearly marked incomplete;
- taxonomy is at least subject-level.

## Next data artifact

Create year-specific staging files under:

```
data/pyq/staging/2017/
...
data/pyq/staging/2026/
```

Then convert approved staging rows into the current `pyq-import-v1` JSON contract and import through the app's existing preview/review/commit workflow.
