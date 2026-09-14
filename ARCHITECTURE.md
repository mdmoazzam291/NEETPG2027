# Architecture

## Phase 1–2 boundaries

The application uses Python, FastAPI, server-rendered HTML, SQLite, SQLAlchemy, Alembic, and pytest. SQLite is the source of truth. FastAPI exposes a deliberately small responsive landing page and a database-backed health check; it contains no study workflow.

`app/config.py` reads the database URL from `NEETPG2027_DATABASE_URL`. `app/db/models.py` owns SQLAlchemy mappings, while Alembic is the only schema-creation path. The app does not call `create_all` in production startup. Phase 2 keeps canonical questions separate from source/exam occurrences, keeps taxonomy tags relational and multi-valued, and records import/verification state without an import UI or automatic duplicate merging.

## Data integrity

Database foreign keys are enabled for SQLite connections. Timestamps use timezone-aware UTC values in application code. Records are retained rather than replaced: attempts and revision events are append-only records by design. Lifecycle and verification statuses keep imported or uncertain occurrences distinct from verified material.

## Not included

No AI, external services, scraping, authentication, question generation, fake data, analytics, weakness detection, priority calculation, or revision algorithm is implemented.

## Phase 3 import boundary

`app/imports/schemas.py` defines strict input contracts; `service.py` separates preview, review, and commit; `api.py` owns HTTP and transaction boundaries. SQLite write transactions start with BEGIN IMMEDIATE. No schema change is required: Phase 2 audit tables retain raw input, normalized content, and timestamped review decisions. Enum mappings persist lowercase values to match existing Alembic constraints. See IMPORTS.md for duplicate and verification semantics.
