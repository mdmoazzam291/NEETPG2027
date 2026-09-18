# NEETPG2027 Study Engine

A personal, local-first NEET PG 2027 study engine for an MBBS intern. The project now includes the normalized backend/import pipeline plus a production GitHub Pages study app with offline practice, SRS, analytics, planning, exam simulation, provenance-aware content governance, and an expanding source-backed PYQ layer.

## Run locally

1. Create and activate a Python 3.11+ virtual environment.
2. Install development dependencies: `python -m pip install -e '.[dev]'`.
3. Configure an optional local database path with `NEETPG2027_DATABASE_URL=sqlite:///absolute/path/study.sqlite3`.
4. Create the default data directory (`mkdir -p instance`), then create the schema: `alembic upgrade head`.
5. Start the app: `uvicorn app.main:app --reload`.
6. Visit `/` to import and review questions, or `/health` for the connection check.

SQLite data defaults to `instance/neetpg2027.sqlite3`, which is ignored by Git. See [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), and [ROADMAP.md](ROADMAP.md).

## Deployment

The production service is configured to run with `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, apply Alembic migrations before startup, and use `/health` as the deployment health check.

## Import questions

Phase 3 adds source registration, preview validation, duplicate review, and atomic import commit through `/docs`. See [IMPORTS.md](IMPORTS.md) for the contract, sample payload, and limits. GitHub Actions runs database and import integration tests on Python 3.11/3.12.

## Import and review interface

The homepage now supports source creation, CSV/JSON file upload (or pasted content), row validation, paginated review, duplicate comparison and linking, explicit final confirmation, and reopening saved batches. A synthetic sample is available from the page. The layout adapts to tablets and phones. See [IMPORTS.md](IMPORTS.md) for the file format.


## GitHub Pages study bank

The current GitHub Pages study bank bundles **405 questions**:

- 405 normalized NEET-PG recall-derived items only
- recall counts: 2021 = 20, 2022 = 20, 2023 = 20, 2024 = 185, 2025 = 140, 2026 = 20

Each PYQ carries `Subject → System → Topic → Subtopic`, exam year/session, source provenance, verification state and a `repeat_key` used to detect concept recurrence across distinct exam years.

Question bundles are discovered through `data/pyq/manifest.json`, which CI and GitHub Pages regenerate automatically from valid JSON bundles under `data/pyq/`. The Question Bank renders the complete matching set rather than truncating at 200 rows, so newly added bundles appear without another frontend filename or display-limit change.

The **PYQ Intelligence** view summarizes year coverage, cross-year repeats, subject/system distribution and a year×subject matrix, and can launch recent-year or repeated-concept drills directly.

Public NEET-PG PYQ material is treated as memory-based/reconstructed unless explicitly supported otherwise. Source ingestion does not automatically mark medical content as verified.
