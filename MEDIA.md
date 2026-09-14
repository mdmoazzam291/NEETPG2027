# Phase 4B: question image/media workflow

Open `/media` after importing questions. Phase 4B uses the existing `question_media` table and therefore requires no new database migration.

## Supported files

Initial ingestion is intentionally limited to safe raster formats used for exam visuals:

- PNG (`image/png`)
- JPEG (`image/jpeg`)
- WebP (`image/webp`)

Each upload is limited to 5 MiB. The server decodes base64 strictly, verifies file magic against the declared MIME type, computes SHA-256, and stores bytes under the local media root using the digest as the filename. SVG and arbitrary HTML are not accepted.

Set `NEETPG2027_MEDIA_ROOT` to override the default `instance/media` directory. `instance/` is git-ignored, so local question images are not committed accidentally.

## Data model

Every attachment remains linked to one canonical question and can optionally target one answer option. The existing `QuestionMedia` record stores:

- media classification: `image`, `diagram`, or `table`
- content-addressed storage reference
- SHA-256 content hash
- required alt text
- optional caption
- stable position within the question
- optional `question_option_id`

The same file may be reused across different questions without duplicating bytes on disk. Attaching the same image twice to one question is rejected.

## API

- `GET /api/questions/{question_id}/media`
- `POST /api/questions/{question_id}/media`
- `PATCH /api/questions/{question_id}/media/{media_id}`
- `GET /api/media/{media_id}/content`

The normal question-detail endpoint now returns option IDs and attached media metadata so the UI can target an image to a specific answer option.

## Safety and provenance

Media uploads do not change medical verification state. They remain part of unverified question content until reviewed. Phase 4B does not expose destructive media deletion; metadata can be corrected without losing the audit-linked question record.
