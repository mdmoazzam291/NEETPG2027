# NEETPG2027 Study Engine

A personal, local-first NEET PG 2027 study engine for an MBBS intern. Phases 1–2 provide a reliable database, a minimal web application foundation, and normalized storage for imported question/PYQ data; they do **not** include seeded medical content, analytics, recommendations, scheduling logic, AI, authentication, or a dashboard.

## Run locally

1. Create and activate a Python 3.11+ virtual environment.
2. Install development dependencies: `python -m pip install -e '.[dev]'`.
3. Configure an optional local database path with `NEETPG2027_DATABASE_URL=sqlite:///absolute/path/study.sqlite3`.
4. Create the schema: `alembic upgrade head`.
5. Start the app: `uvicorn app.main:app --reload`.
6. Visit `/` or `/health`.

SQLite data defaults to `instance/neetpg2027.sqlite3`, which is ignored by Git. See [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), and [ROADMAP.md](ROADMAP.md).
