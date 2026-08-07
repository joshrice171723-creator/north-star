# Phase 2 — Local Projects, Tasks, and Basic Kanban

**Status:** Active board improvement phase — baseline runtime acceptance passed; priority, due-date, search, and filtering improvements implemented and awaiting user runtime acceptance.

**Goal:** Finish and verify the smallest useful local-first Projects + Tasks + Kanban workflow without changing Learning & Development or Academy contracts.

**Priority rule:** No Today/Focus, coach intelligence, integrations, usage tracking, advanced task metadata, or unrelated redesign work starts until this phase's runtime acceptance passes.

## Delivered scope

- Added Projects navigation under Command Center.
- Added local project creation and selection.
- Added local task creation, editing, deletion, and status movement.
- Added four fixed Kanban statuses: Backlog, To do, In progress, Done.
- Added truthful empty states with no seed or fake records.
- Added separate versioned localStorage persistence.
- Prevented deletion of projects that still contain tasks.
- Preserved the existing Electron, preload, Academy IPC, BrowserView, splitter, learning storage key, and learning behavior boundaries.

## Persistence

New renderer-only key:

`executive-command-center-workspace-v1`

Envelope:

```js
{ schemaVersion: 1, projects: [], tasks: [] }
```

Existing learning key remains unchanged:

`claude-architect-study-workspace-v1`

Malformed or unsupported new state restores to empty Projects data and does not touch learning state.

## Explicit exclusions

No authentication, cloud sync, provider integrations, credentials, AI coaching, usage analytics, network behavior, destructive migration, external task metadata, or changes to Academy contracts were added.

## Verification

Passed:

- `npm run build`
- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `git diff --check`

Build emitted only the pre-existing Vite CommonJS/ESM configuration warning.

## Board-focused improvement completed

Task editing now uses the visible in-board edit state rather than a browser `prompt()`. Editing is keyboard-friendly, offers Cancel/Save, preserves stable task IDs and the same local persistence envelope, and keeps the board ready for a future Hermes/OR document context layer without adding AI or document integration in this phase.

## Runtime acceptance — passed by user

The user manually verified the production Electron workflow:

- Projects opened.
- Project created and selected.
- Task created.
- Inline task editor appeared.
- Task renamed and saved.
- Task moved through all four columns.
- Data persisted after reload.
- Task deleted.
- Empty project deleted.
- Empty state returned.
- Learning path opened.
- Academy pane appeared.
- Splitter resized the Academy pane.
- Academy close/open worked.
- Board still worked after returning from Learning.

This is user-provided interactive verification evidence. Build and syntax checks remain separately recorded. Phase 2 runtime acceptance passes; stop here until the user explicitly approves the next phase.

## Stop condition

Do not begin Today/Focus, coach intelligence, integrations, usage tracking, advanced task metadata, or additional workflow modules without a separately approved phase.
