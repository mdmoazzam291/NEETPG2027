# Phase 13 production operations

_Last updated: 2026-09-21_

This document records the production-hardening and repository-hygiene decisions that remain in force after Phase 13.

## Production source of truth

- Production branch: `main`
- Live app: `https://mdmoazzam291.github.io/NEETPG2027/`
- GitHub Pages deploys only from `main`.
- The production workflow runs a browser smoke test against the deployed URL after deployment.
- Primary CI validates Python 3.11, Python 3.12, migration round trips, backend browser tests, the static Chromium suite, production-artifact behavior and an iPad-sized WebKit regression.

## Active workflows

Only two workflows are active on `main`:

1. `.github/workflows/ci.yml`
2. `.github/workflows/pages-option1-live.yml`

Older one-off deployment and experiment workflows are not present on `main` and cannot trigger production.

## 2026-09-21 repository cleanup

The legacy open-PR queue was audited against current `main`.

Closed as superseded:

- UI/search PRs: **#29, #30, #31, #32**
- cloud-sync PRs: **#47, #48, #49, #50, #52, #55, #56, #57, #59, #60**

Why they were closed:

- each branch was materially behind current `main`
- the intended behavior is already represented by later merged implementations/tests
- leaving them open made the repository look as if obsolete work were still queued

Each closed PR received an audit comment. Historical branches were **not deleted**.

Going forward, open PRs should represent active/current work only.

## Historical branch policy

Historical branches are retained as reference points and are not production sources.

Examples include earlier Codex phases, UI experiments, deployment experiments and superseded sync/UI branches.

Branch deletion is intentionally separate from roadmap/repository cleanup. Retaining a branch has no runtime effect because CI and GitHub Pages are scoped to the production path.

## Recovery and sync policy

The app remains local-first. IndexedDB is the primary local study store and export/import remains a recovery path.

Cloud merge rules include:

- question state uses updated timestamps and successful-push watermarks
- attempts use deterministic client keys and `(user_id, client_key)` uniqueness
- study sessions merge by session ID/update time
- user settings merge by settings-update time
- signed-in visible clients reconcile periodically and on foreground return
- finished active-session rows are deleted only through an explicit guarded completion intent
- a missing local active session alone is not permission to delete a remote active session
- mock attempts are retained for analytics while excluded from normal SRS/question-state counters

Regression tests cover offline operation, return-to-online recovery, repeated-sync behavior, conflict guards and active-session cleanup.

## PWA release discipline

- the service worker has an explicit release identifier
- core study/NeuralVault assets are cached for offline use
- waiting service workers do not force uncontrolled reloads
- the UI exposes an update-ready path
- manifest/install metadata and app icons are regression-tested
- release bumps accompany frontend changes that need cache invalidation

## Auth-first launch

The production GitHub Pages artifact starts behind an auth/session launch gate:

- authenticated returning user → app
- signed-out user → login
- Continue offline → session-scoped guest workspace
- explicit sign-out → login

The dashboard is not intentionally exposed before the launch decision completes.

## iPad, mobile and accessibility

Current CI includes WebKit at iPad dimensions plus Chromium regression coverage.

Production hardening includes:

- touch-target sizing
- mobile/sidebar overflow checks
- keyboard-operable controls
- dialog/focus semantics
- navigation labels and `aria-current`
- responsive search behavior
- auth modal focus trapping
- mobile mock-palette geometry checks

## Account and device safety

Current public-browser capabilities include:

- email/password authentication
- recovery/password update
- email link/code
- Google/Apple OAuth wiring
- local/offline guest mode
- standard sign-out
- local backup/export before destructive local reset

Not yet part of the public-browser contract:

- trusted full Auth-user deletion
- explicit sign-out-all-devices/session-revocation UI
- full connected-login-method security center

Those require additional account/security work; Auth-user deletion specifically requires a trusted privileged backend. No service-role credential may be placed in browser code.

## Documentation authority

- `ROADMAP.md` is the canonical feature-status/roadmap document.
- `ARCHITECTURE.md` describes the current system boundaries.
- phase-specific documents are historical/implementation references.
- when older docs conflict with current `ROADMAP.md`, the current roadmap wins.

This prevents historical phase text from being mistaken for the production contract.
