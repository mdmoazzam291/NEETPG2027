# Content governance and provenance

Phase 10 adds a client-compatible metadata contract without promoting any question to medically verified status.

## Taxonomy contract

Every study item should resolve to:

`Subject → System → Topic → Subtopic`

- `subject`: MBBS discipline.
- `system`: organ/system or cross-system bucket.
- `topic`: reusable exam concept grouping.
- `subtopic`: most specific reusable concept label.

The current 100-item platform bank predates explicit system/subtopic fields. The Phase 10 browser layer therefore derives a deterministic system and uses the existing topic as a conservative subtopic fallback. Future imports should provide explicit fields rather than depend on inference.

## Verification states

Trusted content must use an explicit status. Supported workflow states are:

- `unverified` — default for imported or repository-authored material until medical review.
- `reviewed` — checked by an identified reviewer but not yet promoted to the trusted bank.
- `verified` — medically reviewed, provenance recorded, and approved for trusted study use.
- `retired` — retained for audit/history but excluded from normal study queues.

Phase 10 intentionally leaves the existing 100 questions `unverified`; no automated process is allowed to self-certify medical correctness.

## Provenance contract

Each item should carry:

- `origin`: repository-authored, custom import, licensed source, or other explicit origin.
- `source_kind`: original exam-style, licensed PYQ, guideline-derived, textbook-derived, etc.
- `content_version`: monotonically increasing integer for substantive content edits.
- `reviewed_by`: reviewer identity/reference when reviewed.
- `reviewed_at`: review timestamp when reviewed.
- optional source title/edition/version/URL or internal source identifier where lawful and useful.

The browser compatibility layer supplies safe defaults for legacy items: repository-authored/custom-import origin, source kind inferred only when the existing text explicitly says the item is original/not a recalled PYQ, version 1, and no reviewer.

## Promotion rule

Automation may normalize metadata, detect missing provenance, and prepare review queues. It must not change `unverified` to `verified` without an explicit medical-review event and reviewer record.
