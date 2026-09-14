# Phase 4A: taxonomy administration

Open `/taxonomy` after running migrations and starting the FastAPI app. The screen manages the existing normalized taxonomy tables; Phase 4A requires no new database migration.

## Model

- **Subject**: MBBS discipline used for coverage auditing, for example Medicine or Pathology.
- **System**: integrated body-system axis, for example Cardiovascular or Renal.
- **Topic**: reusable concept/disease layer. A topic can link to multiple subjects and multiple systems.
- **Subtopic**: fine-grained child of one topic.

Subjects and systems may also be linked directly. This supports a graph-like study structure rather than forcing every concept into a single subject tree.

## API

`GET /api/taxonomy` returns a complete local snapshot with stable numeric IDs and relationships.

Writes:

- `POST /api/taxonomy/subjects`
- `PATCH /api/taxonomy/subjects/{id}`
- `POST /api/taxonomy/systems`
- `PATCH /api/taxonomy/systems/{id}`
- `POST /api/taxonomy/subject-systems`
- `POST /api/taxonomy/topics`
- `PATCH /api/taxonomy/topics/{id}`
- `POST /api/taxonomy/subtopics`
- `PATCH /api/taxonomy/subtopics/{id}`

Topic create/edit payloads accept `subject_ids` and `system_ids`. Supplying either list during `PATCH` replaces that relationship set, including an empty list. Unknown IDs return 404; uniqueness conflicts return 409; repeated IDs in one request return 422.

## Safety and lifecycle

Phase 4A intentionally has **no delete endpoints**. Questions can already reference taxonomy IDs, so destructive deletion is deferred. Topics and subtopics can instead be archived and later reactivated. Existing references remain intact.

## Question imports

The Phase 3 import contract already accepts `subject_ids`, `system_ids`, `topic_ids`, and `subtopic_ids`. Create taxonomy first, then use the stable IDs in CSV/JSON imports. Import validation verifies that referenced IDs exist; all imported taxonomy tags remain unverified until separately reviewed.

No medical taxonomy is automatically seeded. This keeps repository data provenance explicit and allows the study architecture to evolve before a canonical taxonomy is adopted.
