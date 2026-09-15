# Phase 13 production operations

This document records the production-hardening decisions made before closing Phase 13.

## Production source of truth

- Production branch: `main`
- Live app: `https://mdmoazzam291.github.io/NEETPG2027/`
- GitHub Pages deploys only from `main`.
- The production workflow runs a browser smoke test against the deployed URL after deployment.
- The primary CI workflow validates Python 3.11, Python 3.12, Alembic migration round trips, FastAPI browser tests, the static Chromium suite, and an iPad-sized WebKit regression.

## Active workflows

Only two workflows are active on `main`:

1. `.github/workflows/ci.yml`
2. `.github/workflows/pages-option1-live.yml`

Older one-off deployment and experiment workflows are no longer present on `main` and therefore cannot trigger production.

## Historical branch inventory

Historical branches are retained as reference points. They are not production sources and are not automatically deleted.

### Codex implementation history

- `codex/implement-phase-1-of-neetpg2027-study-engine`
- `codex/plan-phase-2-database-architecture`
- `codex/phase-3-question-import`
- `codex/phase-3-import-interface`
- `codex/phase-3-5-high-yield-100`
- `codex/phase-4a-taxonomy-admin`
- `codex/phase-4b-question-media`
- `codex/phase-5-study-interaction`

### Feature history

- `feature/github-only-ui-v2`
- `feature/phase9-exam-simulator`
- `feature/phase10-taxonomy-verification`
- `feature/phase11-analytics-v2`
- `feature/phase13-production-hardening`
- `feature/supabase-auth-v1`
- `feature/ui-v4-premium-dashboard`

### Experimental/test history

- `test/codespaces-fastapi`
- `test/external-render`
- `test/github-pages-static`
- `test/github-pages-static-final`
- `test/github-pages-static-v2`
- `test/option1-pages`
- `test/option1-pages-live`
- `test/static-browser-only`

Branch deletion is intentionally separate from production hardening. Retaining these refs costs no runtime complexity because CI and Pages are scoped to the production path.

## Recovery and sync policy

The app remains local-first. IndexedDB is the primary offline store and export/import is the recovery path.

Cloud merge rules are deterministic:

- Question state uses the newest `updated_at` value.
- Attempts use a deterministic client key and `(user_id, client_key)` uniqueness to avoid duplicate uploads.
- Study sessions merge by session ID and update timestamp.
- User settings use the newest settings timestamp.
- A missing local active session is **not** permission to delete a remote active session. Remote active-session deletion requires the explicit `clearActiveSession` path.

The Phase 13 regression suite verifies backup restore, offline operation, return-to-online recovery, conflict-policy guards, and active-session deletion protection.

## PWA release discipline

- The service worker has an explicit release identifier.
- Core study assets are cached for offline study.
- Waiting service workers do not force an uncontrolled reload.
- The UI exposes an update-ready banner and reloads only after the user accepts the update.
- Manifest/install metadata and app icon are regression-tested.

## iPad and accessibility

The production UI is checked at iPad dimensions using WebKit in CI in addition to Chromium regression coverage. Phase 13 also adds:

- 44 px minimum touch targets
- skip-to-content navigation
- `aria-current` on legacy and premium navigation
- keyboard-operable switches
- dialog semantics
- progressbar semantics
- menu expanded-state tracking
- labels for premium search and navigation controls
- mobile/sidebar overflow checks

## Account and device safety

- Local backup export remains available before sign-out or destructive local reset.
- Supabase authentication and private-table RLS remain covered by regression tests.
- The app supports normal sign-out and global sign-out across sessions/devices.
- Full Auth-user deletion is deliberately **not** exposed from the public GitHub Pages client because it requires a trusted privileged backend/admin operation. No service-role credential is placed in browser code.

This is an intentional security boundary, not a missing browser feature.
