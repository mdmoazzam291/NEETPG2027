# NEETPG2027 Roadmap

The repository contains a FastAPI/local backend for normalized imports/taxonomy/media/study APIs and a GitHub Pages study app with offline IndexedDB, Supabase sync, adaptive practice, SRS, analytics, premium UI and the NEET-PG exam simulator.

## Completed: Phases 1–8.5

Database foundation, normalized question/PYQ data, controlled imports, the 100-question realistic platform bank, taxonomy administration, media workflow, study interaction engine, offline/PWA study app, NEET-PG pacing timer, Supabase authentication/cloud sync and premium dashboard UI v4 are implemented and regression-tested.

## Completed: Phase 9 — NEET-PG exam simulator

- section-locked 40-question / 42-minute NEET-PG flow
- 5-section / 200-question engine support when ≥200 unique questions exist
- current-bank simulation for the expanded bundled study bank
- question palette states, Save & Next, Mark for Review & Next, Clear Response
- permanent section locking, automatic timeout and reload-safe active-exam resume
- post-test review and result summary

Full 200-question mocks are content-unlocked because the bundled bank now contains 505 unique questions. Simulator behavior remains separate from any future NEET-PG 2027 pattern update.

## Completed: Phase 10 — content infrastructure and medical verification

Bulk synthetic question generation remains deferred. Source-backed PYQ expansion is active; the surrounding infrastructure remains complete:

- browser-compatible `Subject → System → Topic → Subtopic` metadata contract
- deterministic system inference for legacy platform items and conservative topic→subtopic fallback
- System filter in Practice and Question Bank, including filtered-session launch
- explicit `unverified / reviewed / verified / retired` governance workflow documented in `CONTENT_GOVERNANCE.md`
- provenance contract for origin, source kind, content version, reviewer and review timestamp
- legacy items remain **unverified**; automation cannot self-certify medical correctness
- dedicated Phase 10 browser tests plus full Python 3.11/3.12, migration and browser CI passed

## Completed: Phase 11 — analytics and weakness engine v2

- Subject, system and topic weakness scores with transparent formulas
- speed × accuracy analysis and accuracy inside/outside the 63-second pace target
- time-pressure, overthinking and confidence-miscalibration signatures
- rolling performance trends and revision effectiveness
- readiness scoring with documented inputs
- “Why this question?” explanation for Smart queue prioritization
- exam-review timing/confidence/error overlays
- dedicated Phase 11 Playwright validation passed

## Completed: Phase 12 — planning and adaptive revision v2

- Daily/weekly MCQ targets tied to the user profile with local fallback
- user-set exam countdown and rolling study plan without inventing an exam date
- SRS workload calendar, daily review cap and overdue-load balancing
- automatic daily mix across due, weak, incorrect, unseen and balanced adaptive material
- 15/30/60-minute study plans plus interruption-friendly 5/10-minute micro-sessions
- reminders remain off until scheduling history is sufficiently reliable
- planner launches the existing practice engine rather than duplicating question logic
- dedicated Phase 12 Playwright validation passed

## Completed: Phase 13 — production hardening and repository cleanup

### 13.1 Consolidate production source

- [x] `main` is the single production source of truth
- [x] validated Phase 9–12 frontend, Supabase browser layer, PWA and tests are on the `main` lineage
- [x] primary CI covers Python 3.11/3.12, migration round trips, backend browser and static browser suites
- [x] GitHub Pages checks out `main` only
- [x] deployed production is followed by an automated live-site smoke test

### 13.2 Repository and workflow cleanup

- [x] legacy deployment/test workflows and experimental branches inventoried in `PHASE13_OPERATIONS.md`
- [x] only `ci.yml` and `pages-option1-live.yml` remain active on `main`
- [x] CI push scope reduced to `main`; historical branches are retained as non-production reference points
- [x] no historical branch was deleted during hardening

### 13.3 Production reliability

- [x] live GitHub Pages smoke test
- [x] Supabase guest/RLS plus authentication/sync UI regression coverage
- [x] offline → online recovery and service-worker update behavior
- [x] interrupted exam/practice cloud-session protection and recovery paths
- [x] backup/export/reset/import restoration
- [x] deterministic sync-conflict policy regression checks

### 13.4 iPad and accessibility

- [x] iPad-sized WebKit regression in CI in addition to Chromium coverage
- [x] 44 px touch targets and horizontal-overflow checks
- [x] keyboard/focus navigation and keyboard-operable switches
- [x] screen-reader semantics for navigation, dialogs, progress and status regions
- [x] premium dashboard search/navigation labels and `aria-current`
- [x] mobile/sidebar navigation regression

### 13.5 PWA and account hardening

- [x] explicit release/cache version discipline
- [x] controlled update-ready banner and user-accepted service-worker activation
- [x] install/icon/offline fallback validation
- [x] active-session deletion guard and sync-conflict recovery checks
- [x] local data export plus normal and global sign-out/device-session controls
- [x] full Auth-user deletion intentionally remains outside the public browser client because it requires a trusted privileged backend; no service-role credential is exposed

Operational details and the historical branch inventory are recorded in `PHASE13_OPERATIONS.md`.

---

# Next roadmap

## Phase 14 — optional intelligence layer

**Not started.** Begin only with explicit approval after Phase 13. Candidate work:

- source-constrained AI explanation variants
- personalized error-pattern coaching
- automatic cross-subject concept linking
- “why am I getting this wrong?” analysis
- AI-assisted note generation
- medically reviewed question-generation assistance

The AI layer must not replace the deterministic study engine, SRS, analytics, provenance or medical-review controls.

---

## Current state

**Phases 1–13 are complete. Phase 14 is not started. Source-backed NEET-PG PYQ expansion now contains 405 normalized 2021–2026 recalls alongside the existing 100 repository-authored items, for a 505-question bundled bank. The 2024 and 2025 recall sets are the first substantially expanded years.**
