# Database

## Core entities

- `subjects`, `systems`, `topics`, and `subtopics` hold an empty, user-importable taxonomy. `topic_subjects` and `topic_systems` are many-to-many links so a topic can be cross-disciplinary without a knowledge graph.
- `questions` stores canonical question content, type, explanation/reference, difficulty and clinical metadata. `question_options` stores ordered answers and their correctness; `question_media` stores portable media references rather than binary assets.
- `question_occurrences` records an appearance of a canonical question in a source/exam context. `exams`, `exam_administrations`, and `sources` normalize examination family, year/session, and provenance. A source-scoped external identifier prevents duplicate occurrence imports without collapsing appearances in separate papers.
- `subject_systems` complements the existing flexible topic links. `question_taxonomy_tags` attaches one or more verified or unverified Subject/System/Topic/Subtopic tags to a question while preserving foreign-key integrity.
- `question_verification_states` tracks content, answer, taxonomy, and reference verification independently. Source/occurrence verification does not imply medical answer verification.
- `import_batches` and `import_rows` retain preview, validation, rejection, and duplicate-review outcomes for future CSV/JSON/manual imports. Content hashes identify exact candidates only; probable duplicates require human review and are never auto-merged.
- `attempts` records every interaction and its timestamp/outcome (`correct`, `incorrect`, or `skipped`). Optional future-facing fields retain selected option, confidence, time, mistake category, and notes.
- `revision_events` records completed activity; `revision_schedules` separately holds one current planned state per canonical question.
- `app_settings` stores configurable string values under unique keys; future logic may use it for thresholds and intervals.

## Migration workflow

Create or upgrade a database with `alembic upgrade head`. Alembic reads `NEETPG2027_DATABASE_URL` when set, otherwise uses the URL in `alembic.ini`. Generate future reviewed migrations with `alembic revision --autogenerate -m "description"`; never manually alter a study database.

## Testing

Run `pytest`. Tests use temporary SQLite databases and include an Alembic upgrade from an empty file.
