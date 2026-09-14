# Phase 3: controlled question import API

Run migrations, start `uvicorn app.main:app --reload`, and open `/docs`.
This is a local, single-user API; authentication and hosted deployment are not implemented.
Use only content you have permission to import. No real PYQs or medical content are seeded.

## Workflow

1. `POST /api/sources`: register a source with `name`, unique `external_namespace`, and `source_type` (for example `dataset`). Record its citation where available. Source claims remain unverified.
2. `POST /api/imports/preview`: send `source_id`, `input_format` (`json` or `csv`), `input_name`, and file text in `content`. Preview writes only import audit records, never questions.
3. Inspect the returned rows or `GET /api/imports/{id}`. Use `GET /api/questions/{matched_question_id}` to inspect a duplicate candidate, including its answer and provenance.
4. `POST /api/imports/{id}/rows/{row_id}/review` with `action` (`reject`, `create`, or `link`) and a required `note`. `link` also requires `question_id`. Every decision retains its timestamp and note. Invalid rows require correction in a new preview.
5. `POST /api/imports/{id}/commit`. Flagged rows block commit until reviewed. Invalid/rejected rows are skipped; valid rows are committed atomically. Repeating a completed commit returns the same results without inserting again.

`GET /api/sources` and `GET /api/imports` support `limit` and `offset`.

## JSON contract v1

`content` is a JSON-encoded array. Each row requires a stable source-scoped `external_id`, a nonblank `stem`, and 2–10 ordered `options`.

```json
[
  {
    "external_id": "synthetic-001",
    "stem": "Synthetic import demonstration: select Alpha.",
    "question_type": "single_best_answer",
    "options": [
      {"label": "A", "text": "Alpha", "is_correct": true},
      {"label": "B", "text": "Beta", "is_correct": false}
    ],
    "answer_explanation": "Synthetic test data, not a medical question.",
    "reference_text": "User-authored import demonstration",
    "is_clinical": false,
    "is_integrated": false
  }
]
```

Optional fields: `difficulty` (integer 1–5), `exam_administration_id`, `question_number`, `subject_ids`, `system_ids`, `topic_ids`, `subtopic_ids`, and the explanation/reference/flags above. IDs must already exist. Taxonomy and examination-administration creation remain database administration tasks in this increment. Unknown fields are rejected, so unsupported content cannot silently disappear.

Supported question types: `single_best_answer`, `multiple_correct`, `true_false`, and `assertion_reason`. Exactly one correct answer is required except for `multiple_correct` (at least one). True/false requires two options. Other question types and media import are deferred.

## CSV contract

Use the same field names as column headers. `options` and taxonomy ID lists are JSON inside standard quoted CSV cells. Boolean and numeric columns use JSON literals (`true`, `false`, `3`). Blank optional cells use defaults; empty required fields are invalid. UTF-8 BOM is accepted. Duplicate headers, malformed CSV, inconsistent row widths, non-array JSON, and non-finite JSON constants reject the whole document. Structurally valid documents retain individual invalid rows with errors.

Limits: 500 rows per batch; 2,000,000 characters of content; 20,000 characters per text field. Submit larger datasets as separate batches. Original rows are retained alongside normalized data and a checksum of the supplied content.

## Duplicate and integrity rules

- Existing source/external-ID pairs are rejected rather than overwritten. The legacy source-name uniqueness constraint is also respected; use distinct source names for distinct namespaces until that legacy constraint is migrated.
- Fingerprint `v2` hashes Unicode NFKC, whitespace-normalized, case-folded stem plus question type and **ordered option text/correctness**. Explanation, labels, taxonomy, and provenance are excluded. Exact means a review candidate, not proof of medical equivalence.
- Similar stems (SequenceMatcher ratio >= 0.90) produce probable candidates. This is a heuristic, not semantic duplicate detection. The best candidate is shown; users can inspect and select an explicit link target.
- Repeated content in a batch is flagged. `create` explicitly preserves a separate canonical question; `link` adds an occurrence without overwriting canonical answers, tags, explanation, or verification. The incoming content remains in the audit record.
- All new questions, answers, references, tags, and occurrences remain unverified. Import validation is structural only.
- SQLite mutations acquire `BEGIN IMMEDIATE` before reading state. Commit rechecks source IDs, references, new duplicate candidates, and reviewed link-target content. A conflict rolls back the entire commit; refresh/review or create a new preview.
- Candidate search scans existing questions for legacy fingerprint compatibility and fuzzy matching. It targets personal datasets; large banks need indexed candidate retrieval before scaling.

## Validation

CI runs pytest on Python 3.11 and 3.12 plus an Alembic upgrade/downgrade/upgrade round trip. Import integration tests use migration-created databases to catch ORM/migration mismatches, including the Phase 2 enum-value defect repaired here.
