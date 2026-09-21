# NEETPG2027 Study Engine

A local-first NEET-PG study platform with offline practice, spaced repetition, analytics, adaptive planning, mock-exam simulation, cloud sync, NeuralVault knowledge tools and a provenance-aware question pipeline.

**Live app:** https://mdmoazzam291.github.io/NEETPG2027/

For the canonical current feature status and future queue, see [ROADMAP.md](ROADMAP.md).

## Current production features

The GitHub Pages application currently includes:

- auth-first startup with email/password, recovery and email link/code flows
- Google/Apple OAuth wiring with provider auto-detection
- local/offline guest study mode
- QBank and adaptive practice
- spaced repetition and revision queues
- exam countdown and adaptive daily/weekly study planning
- weakness, timing, confidence and readiness analytics
- a 180-question NEET-PG mock preset with 5 × 36-question locked sections and 42 minutes per section
- offline/PWA support and controlled service-worker updates
- Supabase-backed private sync for signed-in users
- NeuralVault Markdown notes, wiki links, backlinks, graph, search, version history and PYQ matching
- grounded local NeuralVault Brain V1/V2 tools
- responsive phone/iPad/desktop UI with Chromium + iPad WebKit regression coverage

The simulator is an original practice interface and is not affiliated with or endorsed by NBEMS.

## Current study bank

The production study bank bundles **405 normalized NEET-PG recall-derived questions**:

- 2021: 20
- 2022: 20
- 2023: 20
- 2024: 185
- 2025: 140
- 2026: 20

Each PYQ carries `Subject → System → Topic → Subtopic`, exam year/session, source provenance, verification state and a `repeat_key` for cross-year concept recurrence.

Question bundles are discovered through `data/pyq/manifest.json`. CI and GitHub Pages regenerate the manifest from valid JSON bundles, so adding a valid bundle does not require another frontend filename change.

The QBank renders the complete matching result set rather than using the old 200-row display cap.

Public NEET-PG PYQ material is treated as memory-based/reconstructed unless explicitly supported otherwise. Importing a source does **not** automatically mark medical content as verified.

## PYQ Intelligence

The PYQ Intelligence layer provides:

- year coverage
- cross-year repeat concepts
- subject/system distribution
- year × subject analysis
- direct drill launch for repeated/recent concepts

## NeuralVault

NeuralVault is the local-first knowledge layer. Current capabilities include Markdown notes, folder paths, Obsidian-style imports, wiki links, backlinks, graph views, search, durable IndexedDB snapshots, version history, backup/restore, PYQ matching and grounded local Brain tools.

See [NEURALVAULT.md](NEURALVAULT.md).

## Production architecture

The production study application is a static/PWA GitHub Pages build. It uses IndexedDB/localStorage for local-first state and Supabase for optional authenticated sync and server-backed mock attempts.

The repository also contains a FastAPI/SQLite backend used for normalized import/taxonomy/media/study APIs and an optional secure AI-provider gateway. That backend is a separate deployment boundary and is **not** required for the normal GitHub Pages study experience.

See [ARCHITECTURE.md](ARCHITECTURE.md).

## Run the FastAPI/import backend locally

1. Create and activate a Python 3.11+ virtual environment.
2. Install development dependencies:

   `python -m pip install -e '.[dev]'`

3. Optionally configure a database path:

   `NEETPG2027_DATABASE_URL=sqlite:///absolute/path/study.sqlite3`

4. Create the default data directory:

   `mkdir -p instance`

5. Apply migrations:

   `alembic upgrade head`

6. Start the backend:

   `uvicorn app.main:app --reload`

7. Open `/docs` for API/import workflows or `/health` for the connection check.

SQLite defaults to `instance/neetpg2027.sqlite3`, which is ignored by Git.

## Import pipeline

The backend supports source registration, CSV/JSON preview validation, duplicate review/linking and atomic commit. See [IMPORTS.md](IMPORTS.md) for the file contract and limits.

Content governance, provenance and verification rules are documented in [CONTENT_GOVERNANCE.md](CONTENT_GOVERNANCE.md).

## CI and deployment

Current production gates include:

- Python 3.11
- Python 3.12
- Alembic migration checks
- backend browser tests
- Chromium regression suite
- production-artifact browser tests
- iPad-sized WebKit regression
- GitHub Pages deploy
- post-deploy live-site smoke test

Only `main` is a production source.

## Key documentation

- [ROADMAP.md](ROADMAP.md) — canonical current status and future roadmap
- [ARCHITECTURE.md](ARCHITECTURE.md) — current system architecture and trust boundaries
- [CONTENT_GOVERNANCE.md](CONTENT_GOVERNANCE.md) — provenance and medical-review states
- [IMPORTS.md](IMPORTS.md) — import format and workflow
- [NEURALVAULT.md](NEURALVAULT.md) — knowledge/Brain architecture
- [PHASE13_OPERATIONS.md](PHASE13_OPERATIONS.md) — production/CI/recovery operations
