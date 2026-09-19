# NeuralVault

NeuralVault is the local-first knowledge layer for NEETPG2027. It is intentionally Markdown-compatible and starts as a dependency-free browser app so it can ship on the existing GitHub Pages deployment without destabilizing the study engine.

## V1 implemented on `feature/neuralvault-v1`

- Obsidian-style three-pane workspace
- portable Markdown notes
- multi-file and folder import for existing `.md` vaults
- `[[Wiki Links]]`
- automatic backlinks
- full-vault text search
- knowledge graph
- current-note neighborhood graph
- YAML/frontmatter property reading
- hashtag extraction
- offline smart-related-note ranking
- local autosave
- JSON vault backup
- individual Markdown export
- command palette and keyboard shortcuts
- responsive iPad/mobile sidebar
- direct navigation between NeuralVault and the NEETPG2027 study engine
- Chromium and iPad/WebKit regression coverage

## Storage contract

V1 stores the browser workspace under `localStorage["neuralvault:v1"]` and preserves imported Markdown content verbatim. This is deliberately a bootstrap layer, not the final large-vault storage architecture.

The source-of-truth direction is:

```
Markdown files
    +
IndexedDB / SQLite metadata index
    +
link graph
    +
semantic index
```

The application must keep Markdown exportable and avoid making AI-generated metadata mandatory for portability.

## Phase 2: durable vault engine

1. Move large-vault metadata/content cache from localStorage to IndexedDB.
2. Add File System Access API where supported, with import/export fallback on iOS.
3. Preserve folders, aliases, tags, headings and block references.
4. Add rename-safe link refactoring and unresolved-link detection.
5. Add note history, trash and conflict-safe recovery.
6. Add full-text index and search ranking.
7. Add Canvas / JSON Canvas interoperability.

## Phase 3: medical knowledge layer

Add canonical concept entities that connect one note to multiple MBBS views:

```
Concept
├── subjects
├── system
├── disease / drug / investigation / organism / sign
├── related questions
├── PYQ occurrences
├── flashcards
├── errors
└── mastery
```

The existing question-bank taxonomy remains authoritative for question data. NeuralVault references it rather than duplicating it.

## Phase 4: adaptive learning integration

- create flashcards from selected note blocks
- attach MCQs/PYQs to notes
- show question performance inside concept notes
- surface weak concepts from existing attempt analytics
- calculate note/concept mastery from retrieval evidence
- build a daily revision queue from due cards, weak concepts and recent errors
- support image-based medical notes and spotters

## Phase 5: AI layer

AI must sit above deterministic storage and provenance rather than replacing them.

Planned capabilities:

- vault-grounded Q&A with citations to local notes
- semantic search
- cross-subject concept-link suggestions
- duplicate/contradiction detection
- note cleanup with diff preview
- question and flashcard generation with source traceability
- personalized error-pattern coaching
- local-model option for private/offline workflows
- cloud model router for stronger reasoning/vision tasks

## Platform path

The static V1 remains deployable through GitHub Pages. Once the vault engine is mature, the same data contracts can be wrapped by Tauri for desktop/mobile filesystem access while retaining the browser version.

## Non-goals for V1

V1 does not claim complete Obsidian plugin compatibility, native filesystem synchronization, CRDT collaboration, cloud AI, or production-scale semantic indexing. Those require the durable storage/plugin layers above rather than cosmetic UI duplication.
