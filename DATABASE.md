# Database

## Core entities

- `subjects`, `systems`, `topics`, and `subtopics` hold an empty, user-importable taxonomy. `topic_subjects` and `topic_systems` are many-to-many links so a topic can be cross-disciplinary without a knowledge graph.
- `questions` stores a canonical question. `content_hash` and `duplicate_of_question_id` preserve later duplicate-review inputs without destructive merging.
- `question_occurrences` records an appearance of a canonical question in a source/exam context, including source, optional identifier/reference/year, lifecycle, and verification facts. A unique partial index prevents repeated populated source identifiers per source.
- `attempts` records every interaction and its timestamp/outcome (`correct`, `incorrect`, or `skipped`). Optional future-facing fields retain selected option, confidence, time, mistake category, and notes.
- `revision_events` records completed activity; `revision_schedules` separately holds one current planned state per canonical question.
- `app_settings` stores configurable string values under unique keys; future logic may use it for thresholds and intervals.

## Migration workflow

Create or upgrade a database with `alembic upgrade head`. Alembic reads `NEETPG2027_DATABASE_URL` when set, otherwise uses the URL in `alembic.ini`. Generate future reviewed migrations with `alembic revision --autogenerate -m "description"`; never manually alter a study database.

## Testing

Run `pytest`. Tests use temporary SQLite databases and include an Alembic upgrade from an empty file.
