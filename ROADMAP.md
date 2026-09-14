# Roadmap

## Completed: Phase 1 — database foundation

Project configuration, SQLAlchemy entities, an initial reproducible Alembic migration, database integrity constraints/indexes, FastAPI startup and health check, tests, and documentation are present. No content is seeded.

## Completed: Phase 2 — PYQ data foundation

Normalized canonical question content, options, media references, examination administrations, sources, flexible taxonomy tags, verification states, and import audit records are present. Imported content is not seeded or automatically medically verified; duplicate candidates remain review-only.

## Phase 3 — controlled question imports

CSV/JSON previews, per-row validation and audit records, duplicate review decisions, transactional/idempotent commit, source registration, question inspection, and CI are implemented. The ORM enum representation now matches migration-created databases. See IMPORTS.md. The responsive homepage now provides source creation, file upload, duplicate comparison, review decisions, import confirmation, and saved-batch history. Taxonomy creation UI, media ingestion, and broader question types remain follow-up work.

## Planned later phases

1. Taxonomy administration and media import workflows.
2. Study interaction UI and safe provenance validation.
3. Deterministic analytics, weakness detection, and revision scheduling.
4. Personal planning and other features only after the data foundation is proven.
