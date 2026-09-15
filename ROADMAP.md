# NEETPG2027 Roadmap

This roadmap tracks the project as it exists today. The repository contains two complementary application paths:

- **FastAPI/local backend path** for normalized imports, taxonomy, media and server-side study APIs.
- **GitHub Pages study app** for day-to-day NEET-PG/INI-CET study, with IndexedDB offline storage, Supabase authentication/cloud sync, adaptive practice, SRS, analytics, the premium UI and the exam simulator.

## Completed: Phase 1 — database foundation

Project configuration, SQLAlchemy entities, Alembic migrations, database integrity constraints/indexes, FastAPI startup and health checks, tests and documentation are present.

## Completed: Phase 2 — question/PYQ data foundation

Canonical question content, answer options, media references, examination administrations, sources, taxonomy tags, verification states and import audit records are normalized. Imported material is not automatically medically verified.

## Completed: Phase 3 — controlled question imports

CSV/JSON preview, per-row validation, duplicate review, transactional/idempotent commit, source registration, question inspection and CI are implemented. See `IMPORTS.md`.

## Completed: Phase 3.5 — 100-question realistic test bank

A repository-authored bank of 100 original NEET-PG/INI-CET-style single-best-answer questions spans all 19 MBBS subjects. It is explicitly test content rather than copied PYQs. Regression tests validate import and browser use of the bank.

## Completed: Phase 4A — taxonomy administration

Subjects, systems, topics and subtopics can be managed through the normalized taxonomy model. Stable IDs, many-to-many topic relationships and non-destructive archiving are supported. See `TAXONOMY.md`.

## Completed: Phase 4B — question image/media workflow

Validated PNG/JPEG/WebP media can be attached to questions/options with MIME/magic validation, file-size limits, SHA-256 content addressing and metadata management. See `MEDIA.md`.

## Completed: Phase 5 — study interaction engine

The FastAPI `/study` path provides server-scored SBA practice, attempt persistence, confidence, elapsed time, mistake categories, notes, bookmarks, deterministic queues, history and summary metrics. The GitHub Pages client also provides a full local-first practice loop.

## Completed: Phase 6 — GitHub-only offline study app

The static app includes Dashboard, Practice, Review & SRS, Question Bank, Analytics and Settings; IndexedDB persistence; adaptive queues; subject/topic/difficulty/clinical/integrated filters; instant/exam feedback; confidence, mistakes, notes, bookmarks, flags, elimination mode; SRS; backup/import; and offline PWA caching.

## Completed: Phase 7 — NEET-PG pacing timer

The browser app supports a **63-second/question pacing target** together with the current **42-minute / 40-question section pace**. Crossing 63 seconds warns the learner but does not hard-submit the question.

## Completed: Phase 8 — authentication and cloud sync

Supabase provides email/password authentication, optional Google OAuth, profile settings, Row Level Security and per-user cloud storage for question state/SRS, attempts, study sessions, active-session resume and preferences/profile data. Guest/offline mode remains available.

## Completed: Phase 8.5 — premium dashboard UI v4

The live Pages app has the premium responsive dashboard with global search, quick-start sessions, readiness/XP/streak surfaces, study heatmap, weak-area views, timing/accuracy/confidence summaries, revision priorities, cloud-sync status and iPad/mobile navigation.

## Completed: Phase 9 — NEET-PG exam simulator

The live Pages app now includes the exam interaction layer:

- section-locked NEET-PG flow with **40 questions / 42 minutes per section**
- 5-section / 200-question engine support when at least 200 unique questions are available
- current-bank simulation mode for the existing 100-question test bank
- question palette with Answered, Marked, Answered + Marked and visited states
- Save & Next, Mark for Review & Next, Clear Response and explicit section submission
- permanent section locking after submission or timeout
- automatic section timeout
- reload/crash-safe local active-exam resume
- post-test answer/explanation review and result summary
- browser regression coverage and live GitHub Pages deployment

The project intentionally **does not expand the question bank in this phase**. Full 200-question mocks are gated until enough unique content exists. Richer per-question timing/confidence/error overlays are folded into Phase 11 analytics.

---

# Remaining roadmap

## Phase 10 — content infrastructure and medical verification

Bulk question generation/expansion is deferred by user instruction. Complete the surrounding infrastructure instead:

- medically reviewed/verified status and source/version provenance
- consistent Subject → System → Topic → Subtopic metadata support
- **System** filter in the static study app so the client matches the normalized taxonomy model
- stronger image/integrated metadata handling where needed
- keep copyrighted PYQs out unless lawful source rights exist

## Phase 11 — analytics and weakness engine v2

- Subject, system and topic weakness scores with transparent formulas
- speed × accuracy analysis and accuracy inside/outside the 63-second pace target
- time-pressure, overthinking and confidence-miscalibration signatures
- rolling performance trends and revision effectiveness
- better readiness scoring with documented inputs rather than opaque percentile claims
- “Why this question?” explanation for Smart queue prioritization
- exam-review timing/confidence/error overlays

## Phase 12 — planning and adaptive revision v2

- Daily/weekly MCQ targets tied to the user profile
- Exam countdown and rolling study plan
- SRS workload calendar and overdue-load balancing
- Automatic daily mix across due, weak, incorrect and unseen material
- 15/30/60-minute study plans and interruption-friendly micro-sessions
- Optional reminders only after the scheduling logic is reliable

## Phase 13 — production hardening and repository cleanup

- Make `main` the single source of truth for the validated Pages app instead of deploying production from a long-lived feature branch
- Reconcile diverged branch history and remove obsolete experimental deployment workflows after verification
- Add production smoke tests against the deployed Pages URL
- Add stronger sync-conflict, offline/online and active-session recovery tests
- Add accessibility, keyboard/touch and iPad-specific regression tests
- Add proper PWA icons, install/update UX and service-worker release discipline
- Add explicit account export/delete controls and device/session security UX

## Phase 14 — optional intelligence layer

Only after Phases 9–13 are stable:

- AI-generated explanation variants constrained to verified source material
- AI error-pattern coaching from the learner’s own attempts
- automatic cross-subject concept linking
- question-generation assistance with mandatory human/medical verification before promotion into the trusted bank

---

## Current next move

**Phase 10 is next**, with bulk question expansion intentionally skipped. After Phase 10, continue to Phases 11 and 12 with a 15-minute gap between completed phases, then stop as requested.
