# NEETPG2027 Roadmap

This roadmap tracks the project as it exists today. The repository now contains two complementary application paths:

- **FastAPI/local backend path** for normalized imports, taxonomy, media and server-side study APIs.
- **GitHub Pages study app** for the current day-to-day NEET-PG/INI-CET experience, with IndexedDB offline storage, Supabase authentication/cloud sync, adaptive practice, SRS, analytics and the premium UI.

## Completed: Phase 1 — database foundation

Project configuration, SQLAlchemy entities, Alembic migrations, database integrity constraints/indexes, FastAPI startup and health checks, tests and documentation are present.

## Completed: Phase 2 — question/PYQ data foundation

Canonical question content, answer options, media references, examination administrations, sources, taxonomy tags, verification states and import audit records are normalized. Imported material is not automatically medically verified.

## Completed: Phase 3 — controlled question imports

CSV/JSON preview, per-row validation, duplicate review, transactional/idempotent commit, source registration, question inspection and CI are implemented. The responsive import workspace supports upload/paste, duplicate comparison, review decisions, confirmation and saved-batch history. See `IMPORTS.md`.

## Completed: Phase 3.5 — 100-question realistic test bank

A repository-authored bank of 100 original NEET-PG/INI-CET-style single-best-answer questions spans all 19 MBBS subjects. It is explicitly test content rather than copied PYQs. Regression tests validate import and browser use of the bank.

## Completed: Phase 4A — taxonomy administration

Subjects, systems, topics and subtopics can be managed through the normalized taxonomy model. Stable IDs, many-to-many topic relationships and non-destructive archiving are supported. See `TAXONOMY.md`.

## Completed: Phase 4B — question image/media workflow

Validated PNG/JPEG/WebP media can be attached to questions/options with MIME/magic validation, file-size limits, SHA-256 content addressing and metadata management. See `MEDIA.md`.

## Completed: Phase 5 — study interaction engine

The FastAPI `/study` path provides server-scored SBA practice, attempt persistence, confidence, elapsed time, mistake categories, notes, bookmarks, deterministic queues, history and summary metrics. The GitHub Pages client also provides a full local-first practice loop.

## Completed: Phase 6 — GitHub-only offline study app

The current static app includes:

- Dashboard, Practice, Review & SRS, Question Bank, Analytics and Settings.
- IndexedDB persistence for question state, attempts, sessions, notes and custom questions.
- Unseen, due, incorrect, bookmarked, all and adaptive Smart queues.
- Subject/topic/difficulty/clinical/integrated filters and configurable session planning.
- Instant-feedback and exam-feedback modes.
- Confidence tracking, mistake classification, notes, bookmarks, flags and elimination mode.
- Spaced repetition with Again/Hard/Good/Easy scheduling.
- Backup export/import and offline PWA caching.

## Completed: Phase 7 — NEET-PG pacing timer

The browser app supports a **63-second/question pacing target** together with the current **42-minute / 40-question section pace**. Crossing 63 seconds warns the learner but does not incorrectly hard-submit the question. Legacy per-question and whole-session timers remain available.

## Completed: Phase 8 — authentication and cloud sync

Supabase integration provides email/password authentication, Google OAuth support when the provider is enabled, profile settings, Row Level Security and per-user cloud storage for:

- question state/SRS
- attempts
- completed study sessions
- active-session resume state
- preferences/profile data

The app remains usable in guest/offline mode through IndexedDB and syncs when authenticated/online.

## Completed: Phase 8.5 — premium dashboard UI v4

The live GitHub Pages app now has the premium responsive dashboard with global search, quick-start sessions, readiness/XP/streak surfaces, study heatmap, weak-area views, timing/accuracy/confidence summaries, revision priorities, cloud-sync status and iPad/mobile responsive navigation. The browser suite currently validates the legacy study engine, timer, Supabase/RLS behavior and v4 interactions.

---

# Remaining roadmap

## Phase 9 — full NEET-PG exam simulator

**Highest-priority product gap.** Build the real examination interaction layer rather than only a practice-session wrapper.

- 5 sections × 40 questions and 42 minutes/section.
- 200-question Grand Test support once the bank is large enough.
- Question palette with Answered, Unanswered, Marked for Review and Answered + Marked states.
- Previous, Clear Response, Mark for Review & Next, Save & Next and explicit section transition controls.
- Correct section locking/end-of-section behavior.
- Crash/reload-safe active exam resume.
- Detailed post-test review with time, confidence and error-type overlays.

## Phase 10 — content expansion and medical verification

The current 100-question bank is only a platform test set.

- Expand to **500+ high-yield topics/questions first**, then thousands of reusable items.
- Add medically reviewed/verified status and source/version provenance.
- Add more image-based and integrated clinical questions.
- Connect questions to Subject → System → Topic → Subtopic consistently.
- Add a **System** filter to the static study app so the client matches the normalized taxonomy model.
- Keep copyrighted PYQs out unless the project has lawful source rights; use original PYQ-pattern questions where appropriate.

## Phase 11 — analytics and weakness engine v2

The app already has useful analytics; this phase makes them deterministic and decision-oriented.

- Subject, system and topic weakness scores with transparent formulas.
- Speed × accuracy analysis and accuracy inside/outside the 63-second pace target.
- Time-pressure, overthinking and confidence-miscalibration signatures.
- Rolling performance trends and revision effectiveness.
- Better readiness scoring with documented inputs rather than opaque percentile claims.
- “Why this question?” explanation for Smart queue prioritization.

## Phase 12 — planning and adaptive revision v2

- Daily/weekly MCQ targets tied to the user profile.
- Exam countdown and rolling study plan.
- SRS workload calendar and overdue-load balancing.
- Automatic daily mix across due, weak, incorrect and unseen material.
- 15/30/60-minute study plans and interruption-friendly micro-sessions.
- Optional reminders only after the underlying scheduling logic is reliable.

## Phase 13 — production hardening and repository cleanup

- Make `main` the single source of truth for the validated Pages app instead of deploying production from a long-lived feature branch.
- Merge/reconcile the currently diverged UI/Supabase branch history and remove obsolete experimental deployment workflows after verification.
- Add production smoke tests against the deployed Pages URL.
- Add stronger sync-conflict tests, offline/online transition tests and active-session recovery tests.
- Add accessibility checks, keyboard/touch regression tests and iPad-specific viewport tests.
- Add proper PWA icons, install/update UX and service-worker release/version discipline.
- Add explicit account export/delete controls and device/session security UX.

## Phase 14 — optional intelligence layer

Only after Phases 9–13 are stable:

- AI-generated explanation variants constrained to verified source material.
- AI error-pattern coaching from the learner’s own attempts.
- Automatic cross-subject concept linking.
- Question-generation assistance with mandatory human/medical verification before promotion into the trusted bank.

---

## Current next move

**Phase 9 should be next:** upgrade the Practice screen into a true NEET-PG exam interface with question palette, section logic, Save & Next / Mark for Review controls and reliable active-session resume. In parallel, Phase 10 should expand the bank beyond the current 100 test questions so full 200-question mocks become meaningful.
