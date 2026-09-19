# NeuralVault

NeuralVault is the local-first knowledge layer for NEETPG2027. It keeps Markdown portable while connecting notes to the existing question bank, SRS, attempts and analytics rather than duplicating those systems.

## Current implementation

### Knowledge workspace

- Obsidian-style three-pane workspace
- Markdown notes with folder paths
- multi-file Markdown import
- Obsidian-folder import through directory selection
- `[[Wiki Links]]`
- automatic backlinks
- outgoing-link inspection and unresolved-link creation
- rename-safe wiki-link refactoring
- full-vault text search
- interactive knowledge graph
- current-note neighborhood graph
- YAML/frontmatter property reading
- hashtag extraction
- local related-note ranking
- daily notes
- structured medical-note template
- command palette and keyboard shortcuts
- responsive iPad/mobile navigation

### Durable local data

NeuralVault uses two local layers:

```
Markdown-compatible note model
        ↓
IndexedDB durable snapshot + note revisions
        ↓
localStorage fast bootstrap/cache
```

IndexedDB is used for resilient vault recovery and version history. The localStorage copy is not treated as the only durable store.

Recovery features include:

- autosave
- note revision checkpoints
- restoreable version history
- checkpoint before delete, rename, restore and import replacement
- complete JSON vault backup/restore
- individual `.md` export
- direct folder writing through the File System Access API when the browser supports it
- portable fallback workflows for Safari/iPad where direct folder writing is unavailable

### NEET-PG integration

The existing question bank remains authoritative.

NeuralVault reads the repository PYQ manifest and matches the current note against question metadata using:

- note title
- subject
- system
- topic/subtopic terms
- shared high-signal tokens

The PYQ panel shows matched questions and, when the existing study IndexedDB is available, the current note's:

- matched PYQ count
- attempted matched questions
- attempt accuracy

A matched question deep-links directly into a one-question Study Engine session. A note can also open the Question Bank filtered from its subject/topic context.

No question, attempt, SRS or analytics state is duplicated into NeuralVault.

## Offline contract

GitHub Pages deploys and the service worker caches:

- NeuralVault HTML
- styles
- vault controller
- IndexedDB module
- medical/PYQ matcher
- PYQ manifest and bundled question files

Offline navigation preserves the `/neuralvault/` route instead of falling back to the Study Engine homepage.

## Browser support strategy

### iPad / Safari

- Markdown import
- directory import where exposed by the browser
- IndexedDB storage
- JSON backup/restore
- PWA/offline use
- touch-responsive workspace

### Chromium desktop

All of the above plus direct write-back of the vault to a user-selected folder through the File System Access API.

### Future native shell

Tauri remains the preferred later shell for direct filesystem access on Windows/macOS/Linux and deeper native mobile integration. The browser data contracts should remain reusable.

## Next high-value phases

### Knowledge engine

- heading and block references
- aliases
- attachments and embedded media
- JSON Canvas compatibility
- richer Markdown parsing/editor
- safe note move/rename across folders
- trash/recycle bin
- scalable IndexedDB full-text index

### Learning engine

- note-to-flashcard extraction
- concept-level SRS separate from question SRS
- error-note linking
- note mastery computed only from retrieval evidence
- image/spotter note objects
- revision queue combining questions, cards, errors and notes

### AI layer

AI should sit above deterministic storage/provenance:

- vault-grounded Q&A with note citations
- semantic search
- cross-subject link suggestions
- duplicate/contradiction detection
- diff-preview note edits
- source-traceable flashcard/question assistance
- personalized error-pattern coaching
- optional local model for private/offline workflows
- cloud model router for stronger reasoning and vision

## Design constraints

1. Markdown must remain exportable.
2. AI-generated metadata must never be required to open a note.
3. Existing question/SRS/analytics stores remain authoritative.
4. Destructive changes require recovery paths.
5. Medical content provenance and verification states must remain visible.
6. The system should optimize retrieval and exam performance, not maximize note volume.


## Intelligence layer implemented

The current branch adds a deterministic, local-first intelligence layer before any cloud LLM dependency:

- **Mastery graph mode** driven by real matched-PYQ performance
- transparent evidence score: **70% matched-PYQ accuracy + 30% matched-PYQ coverage**
- readiness bands: unmeasured, weak, building, strong, mastered
- current-note learning intelligence with one-tap matched concept practice
- combined local search across vault notes and the bundled PYQ corpus
- exportable evidence bundles designed for grounded AI prompting
- command-palette action for the next best study target
- Safari/iPad progress mirror so study evidence remains visible when IndexedDB database enumeration is unavailable

The evidence score is a study-prioritization metric only. It is not treated as proof of clinical competence or medical correctness.

