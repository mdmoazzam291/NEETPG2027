# Roadmap

## Completed: Phase 1 — database foundation

Project configuration, SQLAlchemy entities, an initial reproducible Alembic migration, database integrity constraints/indexes, FastAPI startup and health check, tests, and documentation are present. No content is seeded.

## Completed: Phase 2 — PYQ data foundation

Normalized canonical question content, options, media references, examination administrations, sources, flexible taxonomy tags, verification states, and import audit records are present. Imported content is not seeded or automatically medically verified; duplicate candidates remain review-only.

## Completed: Phase 3 — controlled question imports

CSV/JSON previews, per-row validation and audit records, duplicate review decisions, transactional/idempotent commit, source registration, question inspection, and CI are implemented. The ORM enum representation now matches migration-created databases. See IMPORTS.md. The responsive homepage provides source creation, file upload, duplicate comparison, review decisions, import confirmation, and saved-batch history.

## Completed: Phase 3.5 — realistic 100-question import stress test

A repository-authored bank of 100 original NEET-PG/INI-CET-style single-best-answer questions spans 19 MBBS subjects and is explicitly marked as non-PYQ, medically unverified test content. Regression coverage validates the versioned import contract and submits all 100 questions through the migrated Phase 3 preview/commit workflow as one atomic batch, including idempotent retry and persisted-question counts.

## Phase 4A — taxonomy administration

A responsive local taxonomy workspace and API manage Subjects, Systems, many-to-many Topic relationships, and Subtopics using the existing normalized schema. Stable IDs can be created before question import, subject-system relationships are reusable, topic relationship sets can be edited, and topics/subtopics can be archived without deleting referenced IDs. API, browser, and import-integration tests cover the workflow. See TAXONOMY.md.

## Planned later phases

1. Phase 4B: question media/image ingestion and review workflows.
2. Study interaction UI and safe provenance validation.
3. Deterministic analytics, weakness detection, and revision scheduling.
4. Personal planning and other features only after the data foundation is proven.
