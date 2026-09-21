# Architecture

_Last updated: 2026-09-21_

NEETPG2027 now has two deliberate execution surfaces:

1. a **production GitHub Pages PWA** for day-to-day study, and
2. an **optional FastAPI backend** for normalized import/database workflows and trusted-server capabilities.

The browser/PWA is the primary study product. The backend does not need to be running for normal offline/local study.

## High-level architecture

```text
                         ┌─────────────────────────────┐
                         │       GitHub Pages PWA      │
                         │ index + app/ui/exam/vault   │
                         └──────────────┬──────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
              ▼                         ▼                         ▼
       IndexedDB/localStorage      Service Worker          Static PYQ bundles
       study + SRS + vault         offline/update          manifest + JSON
              │
              │ optional signed-in sync
              ▼
        ┌───────────────┐
        │   Supabase    │
        │ Auth + RLS    │
        │ sync + exam   │
        └───────────────┘

 Optional trusted/server boundary
 ─────────────────────────────────────────────────────────────────

       ┌────────────────────────┐
       │ FastAPI application    │
       │ imports/taxonomy/media │
       │ study APIs/AI router   │
       └───────────┬────────────┘
                   ▼
          SQLite + SQLAlchemy
          Alembic migrations
```

## Production browser/PWA

### Core study engine

`assets/app.js` owns the local study runtime:

- question loading
- IndexedDB study state
- attempts and sessions
- question state/bookmarks/notes
- SRS/revision state
- practice-session lifecycle
- preferences
- analytics inputs

IndexedDB is the durable local study store. LocalStorage is used for selected lightweight bootstrap/settings values, not as the only durable study database.

### UI shell

`assets/ui-v4.js` and `assets/ui-v4.css` provide the production navigation and dashboard layer:

- Dashboard
- QBank
- Revision
- NeuralVault
- Mock Exams
- Study Plan
- Analytics
- Settings
- global topic/question/note search
- responsive phone/iPad/desktop navigation

The UI layer must call the existing study engine rather than create competing state stores.

### Authentication and cloud sync

The browser auth stack is split across:

- `assets/supabase-config.js` — public browser-safe Supabase configuration
- `assets/auth-launch.js` — auth-first launch gate
- `assets/auth-sync.js` — session handling, cloud reconciliation and sync
- `assets/auth-provider-guard.js` — provider visibility guard
- `assets/auth-v2.js` / `auth-v2.css` — login/account UI

Supported application flows include:

- email/password
- signup
- password recovery/update
- email link/code
- Google OAuth wiring
- Apple OAuth wiring
- signed-in account view
- local/offline guest mode
- normal sign-out

Google/Apple provider availability is controlled by Supabase/provider-console configuration and runtime auto-detection.

### Cloud data policy

Supabase private data is protected by Row Level Security. Browser code contains only public/publishable configuration and must never contain a service-role credential.

Cloud reconciliation covers:

- question state
- attempts
- study sessions
- settings
- active-session recovery

Important sync guarantees include deterministic client keys, updated-at comparison, successful-push watermarks, idle/foreground reconciliation and guarded cleanup of finished active sessions.

Mock attempts are retained for analytics but are kept separate from normal SRS/question-state counters.

### Mock exam simulator

`assets/exam-v9.js` is the current production simulator shell.

The current preset is:

- 180 questions
- 5 sections
- 36 questions per section
- 42 minutes per section
- 210 minutes total
- +4/−1/0 scoring

Strict attempts use the signed-in Supabase/server boundary for timing, persistence, response mutation, resume and history. The UI is original and intentionally not a copy of official NBEMS trade dress.

The preset must be re-verified when future official rules are published.

### NeuralVault

NeuralVault is a separate local-first knowledge workspace under `/neuralvault/`.

Its durable model is:

```text
Markdown-compatible notes
        ↓
IndexedDB snapshots + revisions
        ↓
localStorage bootstrap/cache
```

It integrates with the study engine through PYQ/question metadata and retrieval evidence rather than duplicating question, attempt or SRS state.

Brain V1/V2 deterministic/local intelligence operates over note/PYQ evidence and preserves source IDs.

### PWA/offline boundary

`sw.js` uses explicit release identifiers and caches the production study/vault assets required for offline operation.

The update flow is controlled: a waiting service worker does not silently force a reload; the application exposes an update-ready path and reloads after user acceptance.

## Static content/data

The active production QBank is assembled from JSON bundles declared through `data/pyq/manifest.json`.

Every imported/normalized question can carry:

- subject/system/topic/subtopic
- exam year/session
- source/provenance metadata
- verification state
- repeat key

Medical verification status is distinct from source ingestion. Unverified content must remain visibly unverified.

## FastAPI/backend boundary

The repository backend uses Python, FastAPI, SQLAlchemy, SQLite and Alembic.

Responsibilities include:

- normalized import schemas
- preview/review/commit workflows
- taxonomy/media APIs
- backend study/database tests
- optional trusted AI-provider gateway

`app/config.py` reads `NEETPG2027_DATABASE_URL`. Alembic is the schema-creation/migration path; production code should not bypass migrations with ad-hoc `create_all`.

SQLite foreign keys are enabled and timestamps use timezone-aware UTC application values.

## Import architecture

`app/imports/schemas.py` defines strict contracts. Import services separate preview, review and commit, and the API owns HTTP/transaction boundaries.

The import pipeline preserves raw/source context and review state. It must not silently merge duplicates or upgrade verification status.

See [IMPORTS.md](IMPORTS.md) and [CONTENT_GOVERNANCE.md](CONTENT_GOVERNANCE.md).

## AI/intelligence boundary

There are two categories:

### Deterministic/local intelligence

Already implemented in NeuralVault:

- retrieval/evidence ranking
- mastery prioritization
- source-backed local answers
- link suggestions
- recall-card candidates
- safe note-patch previews

These functions must remain usable without a cloud model.

### Generative providers

The FastAPI backend contains optional provider-router support for OpenAI, Gemini, Anthropic and OpenAI-compatible/local endpoints.

Permanent provider secrets must never be stored in GitHub Pages/browser code. Generative answers must consume grounded evidence bundles and preserve source traceability.

The current GitHub Pages production deployment does not itself constitute a deployed generative-provider backend.

## Source-of-truth boundaries

- **Question/content source:** normalized repository bundles/backend database + provenance metadata
- **Local study state:** browser IndexedDB
- **Cloud user sync:** Supabase private tables under RLS
- **Strict mock timing/persistence:** Supabase/server exam boundary
- **NeuralVault notes:** NeuralVault IndexedDB + portable Markdown/backup exports
- **Backend schema:** Alembic migrations
- **Production branch:** `main`
- **Feature-status documentation:** `ROADMAP.md`

No new feature should create a second competing source of truth for attempts, SRS, questions or vault notes.

## Security boundaries

1. Never ship Supabase service-role credentials in browser code.
2. Never ship permanent AI-provider API keys in browser code.
3. Full Auth-user deletion is handled only through the authenticated `delete-account` Edge Function; the service-role credential remains server-side.
4. Importing content does not equal medical verification.
5. Destructive local/vault actions require recovery paths.
6. Remote generative AI must not silently mutate notes or study state.
7. Production deployment and CI operate from `main` only.
