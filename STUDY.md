# Phase 5 study interaction

## Purpose

Phase 5 turns canonical imported questions into measurable retrieval practice. It intentionally stops before adaptive recommendations: first collect trustworthy attempt data, then build analytics on top of it.

## Study eligibility

The first study workflow supports `single_best_answer` questions that are imported, validated, verified, or active, are not archived, and are not marked as duplicates. Other question types remain stored but are not forced through an incompatible UI.

## No-answer-leak contract

`GET /api/study/queue` and `GET /api/study/questions/{id}` return the stem, options, media, difficulty/clinical flags, bookmark state, and answer-verification status. They do **not** return:

- `is_correct`
- option explanations
- answer explanation
- reference text
- correct option IDs

The client sends the selected stable option ID to `POST /api/study/questions/{id}/attempts`. The server validates that the option belongs to the question, calculates the outcome, writes the attempt, and only then returns the answer key and explanation.

## Attempt data

Every submitted or skipped attempt requires:

- confidence: 1–5
- elapsed time: 0–7200 seconds
- selected option ID, unless explicitly skipped

The existing `attempts` table stores outcome, selected stable option ID (serialized in the existing `selected_option` field), confidence, time, optional occurrence, mistake category, notes, and timestamp.

After reveal, `PATCH /api/study/attempts/{id}` can add a mistake category and/or note. Supported categories are knowledge gap, misread stem, confused options, overthinking, guessing, time pressure, calculation error, and other.

## Queues

`GET /api/study/queue?mode=...` supports:

- `unseen`: no recorded attempts
- `incorrect`: latest attempt is incorrect
- `bookmarked`: durable bookmark exists
- `all`: every eligible SBA question

Ordering is deterministic by canonical question ID. Phase 6 may rank these queues, but that ranking must remain explainable and derived from recorded performance.

## Bookmarks

Phase 5 adds `question_bookmarks` in migration `20260915_0003`. Bookmark writes are idempotent. The bookmark is a study preference, not a content or medical-verification state.

## Summary and history

`GET /api/study/summary` reports eligible questions, distinct questions attempted, unseen count, attempts, correct/incorrect/skipped totals, scored accuracy, average time, and bookmark count.

`GET /api/study/history` returns recent persisted attempts with question stem, outcome, selected option ID, confidence, time, reflection category, notes, and timestamp.

## UI

`/study` defaults to a 15-question unseen session. It renders stem- and option-level Phase 4B media, requires confidence before reveal, times the attempt, records server-scored results, permits post-reveal reflection, supports bookmarks, and shows recent history plus compact study metrics.

The UI displays answer-verification status after and before attempts so medically unverified imported/test content is never silently presented as verified truth.
