# NEETPG2027 Roadmap

The repository contains a FastAPI/local backend for normalized imports/taxonomy/media/study APIs and a GitHub Pages study app with offline IndexedDB, Supabase sync, adaptive practice, SRS, analytics, premium UI and the NEET-PG exam simulator.

## Completed: Phases 1–8.5

Database foundation, normalized question/PYQ data, controlled imports, the 100-question realistic platform bank, taxonomy administration, media workflow, study interaction engine, offline/PWA study app, NEET-PG pacing timer, Supabase authentication/cloud sync and premium dashboard UI v4 are implemented and regression-tested.

## Completed: Phase 9 — NEET-PG exam simulator

- section-locked 40-question / 42-minute NEET-PG flow
- 5-section / 200-question engine support when ≥200 unique questions exist
- current-bank simulation for the existing 100-question platform bank
- question palette states, Save & Next, Mark for Review & Next, Clear Response
- permanent section locking, automatic timeout and reload-safe active-exam resume
- post-test review and result summary

Full 200-question mocks remain gated because bulk question expansion is intentionally skipped by user instruction.

## Completed: Phase 10 — content infrastructure and medical verification

Bulk question generation/expansion remains deferred. The surrounding infrastructure is complete:

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

---

# Deferred roadmap

## Phase 13 — production hardening and repository cleanup

Not started. The user explicitly requested stopping after Phase 12.

- Make `main` the single source of truth instead of deploying from long-lived feature branches
- Reconcile branch history and obsolete deployment workflows
- Production URL smoke tests, sync/offline/recovery tests, accessibility and iPad regressions
- PWA release discipline and account/device controls

## Phase 14 — optional intelligence layer

Not started. After later approval: source-constrained AI explanations, error-pattern coaching, cross-subject linking and medically reviewed question-generation assistance.

---

## Current state

**Phases 1–12 are complete for the requested scope. Bulk question expansion remains intentionally skipped. Stop here. Do not start Phase 13 without a new explicit instruction from the user.**
