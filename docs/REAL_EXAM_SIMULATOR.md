# Real Exam Simulation — implementation and operations

## Scope and audit (20 September 2026)
The production app is GitHub Pages, with vanilla JS, IndexedDB study storage and Supabase auth/sync. The FastAPI import/study backend is a separate deployment. The previous `assets/exam-v9.js` used localStorage, 200 questions, a 40-question section, early submission, client-only locks, delayed-transition time grants, subject/topic labels and percentage-only results. Existing sidebar, QBank IDs, themes, study storage, notes/bookmarks and Revision are reused. No existing user table is rewritten or removed.

## Rule evidence
Verification attempted on 20 September 2026:
- https://natboard.edu.in/viewnbeexam?exam=neetpg — current official page; retrieval returned 403.
- https://nbe.edu.in/ — accessible but retrieved content exposed older archive links.
- https://nbe.edu.in/IB/IB%20NEET-PG%202026.pdf — inaccessible.
- https://medicine.careers360.com/articles/neet-pg-2026-information-bulletin-out — reports 180 questions, 210 minutes, +4/−1; links to the July 2026 bulletin behind its registration page.
- https://kinaseapp.com/neet-pg-exam-pattern — secondary report describes 5 × 36 and 42 minutes.

The complete current primary bulletin and official demo could not be inspected. Therefore the full preset is **UNVERIFIED_PRIMARY_SOURCE**, not asserted to be NBEMS-certified/current-official. It implements the user's requested simulation rules. Early-exit prohibition and other details remain simulation settings pending primary verification. No logos, styling, source, candidate-login or scorecard design were copied. No official content-type percentages or ranks are claimed. Future verified changes require a NEW preset version; existing attempts keep their full preset snapshot.

## Authority and state
`supabase/exam.sql` is additive. Private schema tables hold preset versions, a generated deployment cache of the canonical `data/pyq` bank, and immutable paper snapshots plus responses/events. Clients have no direct table privileges. `public.exam_call` is a SECURITY INVOKER wrapper around a narrowly granted private SECURITY DEFINER gateway with an empty search path, an `auth.uid()` check, explicit owner scoping and row locks. Anonymous execute is revoked.

States: instructions (UI) → active section 0..4 (server) → completed. A single transaction reconciles all elapsed section boundaries, validates the mutation and persists it or returns a stale/locked response. The final score and completion are committed atomically before optional client analysis/study integration. Completed responses cannot be mutated. There is no early-submit API. All boundaries derive from the original start, not from the moment the user reconnects. Expired dormant attempts finalize lazily on the next read; their deadline and effective completion timestamp do not change.

An advisory lock plus a unique active-user index prevents simultaneous start requests creating duplicate active attempts. Expected versions reject stale tab edits. Browser rendering uses server time anchored to the monotonic performance clock; server time alone authorizes edits. A refresh re-fetches the existing attempt. Browser storage holds only an account-scoped attempt ID, never an authoritative deadline. Existing v9 localStorage data is retained; it is not promoted into a trusted attempt or deleted.

## Paper assembly and content
`python scripts/build_exam_bank.py` generates `supabase/exam-bank.sql` from the existing manifest, rejects duplicate IDs/content and malformed questions, and records the source revision. This cache is not an independently editable QBank. Publish a freshly generated cache transactionally whenever canonical bundles change. Existing attempt paper snapshots never change.

A server-generated seed gives deterministic question and option ordering. Subject strata are interleaved, with diversity across system, difficulty and available question-type tags, then distributed through mixed sections. These are product choices, not official quotas. Current bank validation found 405 unique structurally eligible questions. Existing medical verification labels remain unchanged: structural validity does not establish clinical accuracy. Unknown type labels remain broad or unclassified rather than invented. Recent-question avoidance and configurable target proportions are not implemented in this version.

Exam payloads contain only the current section's stem, neutral options, table and opaque image reference; keys and metadata arrive only after completion. The general QBank remains public in this local-first app, so this is a practice simulator, not a secure proctoring product. Image references must use `/exam-media/<opaque UUID or hex ID>.png|jpg|webp`; diagnostic filenames/URLs are rejected. Future image ingestion must supply anonymized assets with stripped metadata. Current bank has no verified image coverage guarantee.

## UI and integration
`exam-v9.js` retains the existing public launch API but replaces the flawed engine with the server gateway. It hides/inerts the study shell, uses semantic radios, focus trapping, responsive palette, exit confirmation and an isolated clock. Keyboard and pointer actions share the same validated mutation path. There is no correctness feedback while active. Custom Test opens the existing study test builder; it does not alter the full-mock preset. Tutorial questions do not create attempts.

Results show raw marks, C/I/U, positive/negative marks, accuracy and attempt rate, per-section results, observed dwell buckets, answer changes, final-window answer telemetry, subject/system/topic/type/difficulty aggregates and a separate full-mock score trend. No cognitive error causes are inferred. Connected visible dwell is capped per heartbeat; absent intervals are explicitly unknown. This is observed use, not a claim of perfect attention measurement.

Completed results sync to local study attempts/sessions in an idempotent IndexedDB transaction. SRS is not automatically populated with 180 questions. Post-result review lets users add one selected question to Revision, bookmark it or save a note. Bulk weakness queues, AI explanation invocation, all proposed cross-tabular trend visualizations and cognitive error annotation are future work; no fake outputs stand in for them.

## Deployment / rollback
1. Run Node scoring tests and `tests/exam_server.sql` in a transaction after the schema, followed by ROLLBACK. The SQL suite creates only temporary synthetic data inside that transaction.
2. Apply `exam.sql` plus generated `exam-bank.sql` in one transaction. Existing data is preserved. Keep private tables unexposed.
3. Run Supabase security advisors and privilege checks.
4. Build `python scripts/build_static.py`. Publish through existing Pages workflow after browser CI passes.
5. Verify the live sidebar → rules → tutorial; authenticated flow must also pass contract browser tests plus real SQL tests.

To roll back the frontend, revert the simulator commit. Retain private attempt tables so newly completed data is preserved. Do not drop schemas or tables as routine rollback. The prior v9 simulator is not server-trusted. No Supabase service key belongs in browser assets.

## Tests
- `node --test tests/exam_analytics.test.cjs`: marking extremes, review marking, zero attempt division, answer-change categories and no active analysis.
- `tests/exam_server.sql`: all score vectors, ownership, no anonymous access, version conflicts, no early exit, past/future locks, multi-boundary catch-up and immutable/idempotent completion. Run inside a rollback transaction.
- `tests/exam_v9.spec.js`: browser API-contract tests for full lifecycle, selection/review/clear, refresh, offline recovery, concurrent tabs, 8 viewport sizes and both themes. RPC fixture is test-only and is not included by build_static.py.
- `tests/production_artifact.spec.js`: real production build wiring, durable result integration and existing feature regressions.

Limitations must remain explicit: primary rules unverified; content medically unverified; no offline response backdating; no proctoring; no assumption that unavailable image/type metadata exists. CI mocks validate the frontend contract, not a live signed-in Supabase browser session.
