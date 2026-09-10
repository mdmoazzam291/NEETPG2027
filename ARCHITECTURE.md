# Architecture

## Phase 1 boundaries

The application uses Python, FastAPI, server-rendered HTML, SQLite, SQLAlchemy, Alembic, and pytest. SQLite is the source of truth. FastAPI exposes a deliberately small responsive landing page and a database-backed health check; it contains no study workflow.

`app/config.py` reads the database URL from `NEETPG2027_DATABASE_URL`. `app/db/models.py` owns SQLAlchemy mappings, while Alembic is the only schema-creation path. The app does not call `create_all` in production startup.

## Data integrity

Database foreign keys are enabled for SQLite connections. Timestamps use timezone-aware UTC values in application code. Records are retained rather than replaced: attempts and revision events are append-only records by design. Lifecycle and verification statuses keep imported or uncertain occurrences distinct from verified material.

## Not included

No AI, external services, scraping, authentication, question generation, fake data, analytics, weakness detection, priority calculation, or revision algorithm is implemented.
