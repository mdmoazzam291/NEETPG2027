# Roadmap

## Completed: Phase 1 — database foundation

Project configuration, SQLAlchemy entities, an initial reproducible Alembic migration, database integrity constraints/indexes, FastAPI startup and health check, tests, and documentation are present. No content is seeded.

## Completed: Phase 2 — PYQ data foundation

Normalized canonical question content, options, media references, examination administrations, sources, flexible taxonomy tags, verification states, and import audit records are present. Imported content is not seeded or automatically medically verified; duplicate candidates remain review-only.

## Planned later phases

1. Controlled taxonomy/question import and duplicate-review workflows.
2. Study interaction UI and safe provenance validation.
3. Deterministic analytics, weakness detection, and revision scheduling.
4. Personal planning and other features only after the data foundation is proven.
