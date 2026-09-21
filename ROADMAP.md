# NEETPG2027 Roadmap

_Last updated: 2026-09-21_

This file is the canonical product-status and roadmap document for the repository. Historical phase documents describe how features were built; this file describes what is actually available on current `main` and what is still planned.

## Status legend

- ✅ **Complete** — implemented on `main`, covered by regression tests, and part of the production path.
- 🟢 **Substantially complete** — useful production implementation exists; further depth is planned.
- 🟡 **Partially implemented / externally gated** — application code exists, but external configuration, deployment, content, or trusted backend work is still required.
- ⬜ **Planned** — intentionally queued; not part of the current production contract.

## Current production snapshot

| Area | Status | Current state |
| --- | --- | --- |
| Production source | ✅ | `main` only; GitHub Pages deploys from `main` and runs a live smoke test |
| Study bank | 🟢 | 405 normalized NEET-PG recall-derived questions covering 2021–2026 |
| Practice/QBank | ✅ | Full manifest loading, filters, adaptive sessions, bookmarks, notes, confidence/error capture |
| Revision/SRS | ✅ | Due, incorrect, bookmarked and note-driven revision with spaced repetition |
| Dashboard/UI | ✅ | Premium UI v4, responsive phone/iPad/desktop layout, global search, dark mode, exam countdown |
| Planning | ✅ | Daily/weekly targets, adaptive mix, 15/30/60-minute plans and 5/10-minute micro-sessions |
| Analytics | ✅ | Subject/system/topic weakness, timing, confidence, trends, readiness and revision effectiveness |
| Mock Exams | ✅ | 180-question preset, 5 × 36-question sections, 42 minutes/section, 210 minutes total, +4/−1 |
| NeuralVault | 🟢 | Markdown vault, wiki links/backlinks, graph, search, version history, PYQ matching and grounded Brain tools |
| Authentication | ✅ core / 🟡 providers | Auth-first launch, email/password, recovery, email link/code, logout, avatars; Google/Apple depend on provider configuration |
| Cloud sync | ✅ | Supabase auth/RLS, attempts/question state/sessions/settings sync, idle reconciliation, conflict handling |
| PWA/offline | ✅ | Service worker, offline study assets, update flow, install metadata and local-first recovery |
| AI/intelligence | 🟢 local / 🟡 remote | Deterministic Brain V1/V2 and provider-router code exist; full production generative AI service is not deployed |
| Content verification | 🟡 | Governance/provenance workflow exists; large-scale medical review and corpus expansion remain active work |

### Current mock-exam preset

The production simulator currently uses the requested **180-question** pattern:

- 180 questions
- 5 locked sections
- 36 questions per section
- 42 minutes per section
- 210 minutes total
- +4 correct, −1 incorrect, 0 unattempted
- no return to expired sections
- server-timed signed-in attempts, reload-safe resume, palette states, review, history and analytics

This is a **simulation preset**, not a claim of official NBEMS endorsement. If NEET-PG 2027 primary-source rules change, the simulator must be re-verified and updated.

## Completed foundation: Phases 1–8.5

✅ Database foundation, normalized question/PYQ data, controlled imports, taxonomy administration, media workflow, study interaction engine, offline/PWA study app, pacing timer, Supabase authentication/cloud sync and dashboard UI are implemented.

The original repository-authored 100-question synthetic/platform bank is retired from the active study app.

## Phase 9 — exam simulator

✅ Complete for the current 180-question preset.

Implemented:

- immutable full mock and section-drill presets
- 5-section locked exam workflow
- server-backed timing and response persistence
- Save & Next, Mark for Review & Next, Clear Response and palette states
- permanent section expiry
- reload/multi-tab recovery protections
- result summary, post-test review, history and timing/behavior analytics
- separate handling so mock attempts do not contaminate normal SRS counters

## Phase 10 — taxonomy, provenance and medical-content governance

✅ Infrastructure complete; 🟡 corpus review remains ongoing.

Implemented:

- `Subject → System → Topic → Subtopic` contract
- System filtering in Practice/QBank
- provenance fields and repeat keys
- `unverified / reviewed / verified / retired` workflow
- import review and duplicate handling
- browser/backend regression coverage

Automation must never self-certify medical correctness.

## Phase 11 — analytics and weakness engine v2

✅ Complete core.

Implemented:

- subject/system/topic weakness scores
- speed × accuracy analysis
- time-pressure, overthinking and confidence-miscalibration signatures
- rolling trends and revision effectiveness
- readiness scoring
- transparent Smart-queue prioritization
- mock timing/confidence/error overlays

## Phase 12 — planning and adaptive revision v2

✅ Complete core.

Implemented:

- daily/weekly targets
- user-set exam countdown
- SRS workload calendar and overdue balancing
- automatic daily mix across due, weak, incorrect, unseen and balanced material
- 15/30/60-minute plans
- 5/10-minute micro-sessions

Automated reminders remain a later feature.

## Phase 13 — production hardening

✅ Complete and continuously extended.

Implemented:

- `main` as the single production source
- Python 3.11/3.12 CI
- backend browser tests
- Chromium regression suite
- iPad-sized WebKit regression
- production-artifact tests
- GitHub Pages post-deploy live smoke
- service-worker release discipline
- offline → online recovery
- backup/export/reset/import recovery paths
- deterministic sync/conflict checks
- responsive navigation and accessibility baseline
- active-session cleanup and sync protections

### Post-Phase-13 production upgrades

✅ Also complete on current `main`:

- auth-first startup gate
- redesigned Google/Apple/email login UI
- forgot-password and email-link/code flows
- signed-in account view and logout
- provider-profile avatars with initials fallback
- responsive editorial login redesign
- mobile search geometry hardening
- auth dialog/focus accessibility hardening
- imported metadata escaping
- NeuralVault recent-note refresh
- mock-exam mobile palette geometry fix
- analytics neutral state for unknown accuracy
- iOS touch-icon declaration

## Phase 14 — intelligence layer

The earlier roadmap incorrectly marked all of Phase 14 as “not started.” The current implementation is more advanced:

### 14A — deterministic/local learning intelligence

✅ Complete.

- mastery graph derived from retrieval evidence
- matched-PYQ coverage/accuracy scoring
- next-study prioritization
- local cross-subject concept suggestions
- evidence bundles for grounded prompting

### 14B — NeuralVault Brain V1/V2

🟢 Substantially complete.

- local grounded Q&A over notes + cached PYQs
- exact source/evidence IDs
- hybrid concept retrieval
- cross-subject note suggestions
- recall-card candidates derived from source text
- safe note-patch previews with explicit apply/cancel
- local/offline operation for deterministic tools

### 14C — secure provider router

🟡 Code implemented, production service not activated.

The FastAPI backend contains optional adapters for OpenAI, Gemini, Anthropic and OpenAI-compatible/local providers. Provider keys belong on a trusted backend, never in GitHub Pages/browser storage.

Remaining before production activation:

- deploy/authorize the backend boundary
- configure provider/model selection
- define quotas/rate limits
- production privacy/telemetry policy
- regression/evaluation set for medical answers

### 14D — personalized generative coaching

⬜ Planned.

- “why am I getting this wrong?” synthesis
- evidence-grounded explanation variants
- contradiction/gap detection
- personalized error-pattern coaching
- medically reviewed AI-assisted content workflows

The generative layer must remain subordinate to deterministic SRS, analytics, provenance and medical-review controls.

---

# Next roadmap

## Phase 15 — content expansion and verification

**Priority: NEXT**

The largest current bottleneck is content depth rather than UI infrastructure.

Planned:

- expand source-backed NEET-PG recalls toward a broader 8–10+ year corpus
- add INI-CET recall-derived/source-backed coverage
- increase subject/system balance
- add image/IBQ material where provenance and reuse rights permit
- verify answer keys, explanations, references and duplicates
- keep unverified material visibly labelled
- build review queues for human/medical verification

## Phase 16 — integrated master curriculum

**Priority: PLANNED**

- 500+ high-yield topic master checklist
- map every topic to subject, system, presentation, PYQ, note and revision objects
- reduce duplicate learning across MBBS subjects
- preserve subject views for coverage auditing while learning through integrated systems

## Phase 17 — NeuralVault learning engine

**Priority: PLANNED**

- heading/block references and aliases
- attachments/media objects
- richer Markdown/editor support
- trash/recycle bin
- note-to-flashcard extraction
- concept-level SRS separate from question SRS
- error-note linking
- combined revision queue across questions, cards, errors and notes
- image/spotter note objects

## Phase 18 — Account & Security Center

**Priority: PARTIALLY IMPLEMENTED**

Implemented:
- ✅ permanent account deletion from Settings → Danger zone
- ✅ email-confirmed destructive flow
- ✅ trusted Supabase Edge Function using server-side admin deletion
- ✅ cloud study/settings data deletion through auth-user cascades
- ✅ server-stored mock history deletion through auth-user cascade
- ✅ no service-role credential exposed in the browser

Still planned:
- connected login-method display
- password-management surface
- session/device view
- explicit sign-out-all-devices/session revocation UI
- account/security activity UX

## Phase 19 — reminders and notifications

**Priority: LATER**

- due-review reminders
- daily-plan reminder
- mock scheduling
- overdue workload nudges
- user-controlled quiet hours/frequency

Do not enable aggressive reminders until scheduling behavior is reliable and user-configurable.

## Phase 20 — production AI activation

**Priority: LATER**

- deploy secure provider gateway
- grounded citations and evidence tracing
- model/evaluation policy
- medical hallucination/contradiction checks
- optional local/offline model path
- personalized coaching using existing analytics rather than replacing it

## Phase 21 — native shell / deeper filesystem integration

**Priority: LATER**

Tauri remains the preferred desktop-shell direction for direct filesystem access while reusing the browser data contracts. Native mobile packaging is optional and should follow demonstrated need.

---

# Ongoing maintenance queue

These are maintenance tasks, not missing core features:

- consolidate duplicate CSS/selectors and reduce `!important` debt in controlled passes
- keep OAuth provider configuration verified after Google/Apple console changes
- expand medical-content verification coverage
- keep simulator rules synchronized with future official primary-source changes
- maintain PWA cache/version discipline
- keep stale branches as historical references unless deliberate branch cleanup is later approved

## Repository status policy

1. `main` is the only production source of truth.
2. `ROADMAP.md` is the canonical feature-status document.
3. Historical phase docs should not override current `ROADMAP.md`.
4. Open pull requests should represent active work only.
5. Superseded PRs are closed with an audit comment; historical branches are retained unless branch deletion is explicitly approved.
6. Production claims should be backed by current code/tests, not old branch descriptions.
