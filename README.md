# NEETPG2027 Study Engine

A personal, local-first NEET PG 2027 study engine for an MBBS intern. Phases 1–3 provide a reliable database, a minimal web application foundation, and normalized storage and an audited CSV/JSON question import API; they do **not** include seeded medical content, analytics, recommendations, scheduling logic, AI, authentication, or a dashboard.

## Run locally

1. Create and activate a Python 3.11+ virtual environment.
2. Install development dependencies: `python -m pip install -e '.[dev]'`.
3. Configure an optional local database path with `NEETPG2027_DATABASE_URL=sqlite:///absolute/path/study.sqlite3`.
4. Create the schema: `alembic upgrade head`.
5. Start the app: `uvicorn app.main:app --reload`.
6. Visit `/` or `/health`.

SQLite data defaults to `instance/neetpg2027.sqlite3`, which is ignored by Git. See [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), and [ROADMAP.md](ROADMAP.md).

## Import questions

Phase 3 adds source registration, preview validation, duplicate review, and atomic import commit through `/docs`. See [IMPORTS.md](IMPORTS.md) for the contract, sample payload, and limits. GitHub Actions runs database and import integration tests on Python 3.11/3.12.
