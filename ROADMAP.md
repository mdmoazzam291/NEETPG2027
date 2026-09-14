# Roadmap

## Completed: Phase 1 — database foundation

Project configuration, SQLAlchemy entities, an initial reproducible Alembic migration, database integrity constraints/indexes, FastAPI startup and health check, tests, and documentation are present. No content is seeded.

## Completed: Phase 2 — PYQ data foundation

Normalized canonical question content, options, media references, examination administrations, sources, flexible taxonomy tags, verification states, and import audit records are present. Imported content is not seeded or automatically medically verified; duplicate candidates remain review-only.

## Completed: Phase 3 — controlled question imports

CSV/JSON previews, per-row validation and audit records, duplicate review decisions, transactional/idempotent commit, source registration, question inspection, and CI are implemented. The ORM enum representation now matches migration-created databases. See IMPORTS.md. The responsive homepage provides source creation, file upload, duplicate comparison, review decisions, import confirmation, and saved-batch history.

## Completed: Phase 3.5 — realistic 100-question import stress test

A repository-authored bank of 100 original NEET-PG/INI-CET-style single-best-answer questions spans 19 MBBS subjects and is explicitly marked as non-PYQ, medically unverified test content. Regression coverage validates the versioned import contract and submits all 100 questions through the migrated Phase 3 preview/commit workflow as one atomic batch, including idempotent retry and persisted-question counts.

## Completed: Phase 4A — taxonomy administration

A responsive local taxonomy workspace and API manage Subjects, Systems, many-to-many Topic relationships, and Subtopics using the existing normalized schema. Stable IDs can be created before question import, subject-system relationships are reusable, topic relationship sets can be edited, and topics/subtopics can be archived without deleting referenced IDs. API, browser, and import-integration tests cover the workflow. See TAXONOMY.md.

## Completed: Phase 4B — question image/media workflow

A local media workspace and API attach validated raster images to canonical questions or individual answer options using the existing `question_media` schema. PNG, JPEG, and WebP files are MIME/magic checked, capped at 5 MiB, hashed with SHA-256, and stored content-addressed outside the Git repository. Duplicate attachment to one question is blocked, metadata can be corrected without destructive deletion, and question-detail responses expose media plus stable option IDs. See MEDIA.md.

## Phase 5 — study interaction engine

The `/study` workspace turns imported single-best-answer questions into an active-recall loop. Pre-answer API payloads intentionally omit correctness, option explanations, answer explanations, and references. The server calculates outcomes, then reveals the answer key and explanation only after an attempt is persisted. Every attempt records confidence and elapsed time; post-reveal reflections can record mistake category and notes. Unseen, latest-incorrect, bookmarked, and all-question queues are deterministic, recent history and summary metrics are available, and bookmarks are durable through a small Alembic migration. See STUDY.md.

## Planned later phases

1. Deterministic analytics and weakness scoring from Phase 5 attempt data.
2. Revision scheduling and adaptive-but-explainable queue prioritization.
3. Subject/system/topic study filters and richer session planning.
4. Personal planning and other features only after the measurement loop is proven.
