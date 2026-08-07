# Project Status

**Last updated:** 2026-08-06

**Future-facing constraint:** The Kanban data model is intentionally structured for a later Hermes AI layer to read board state alongside OR documents. No AI, document ingestion, cloud sync, credentials, or autonomous writes are added in Phase 2.
**Active project:** `C:/Users/joshr/OneDrive/Desktop/hermes/anthropic-certification-native`
**Branch observed:** `main`
**Current phase:** SQLite persistence migration — database foundation exists; renderer hookup and Electron runtime verification remain.

## Night handoff — 2026-08-06

Phase 2 was implemented and pushed to the active feature branch. The renderer now includes a bounded local-first Projects workspace with project creation/selection/rename/delete, task creation/edit/delete, four fixed Kanban statuses, truthful empty states, isolated local persistence, and confirmation-based cascading project deletion.

Protected boundaries were preserved: the existing Learning & Development localStorage key/schema, Academy IPC/preload contracts, native Academy BrowserView, and resizable three-pane layout were not intentionally changed. No authentication, cloud sync, credentials, provider integration, AI coaching, analytics, fake data, or destructive migration was added.

Verification completed:

- `npm run build` passed.
- `node --check electron/main.cjs` passed.
- `node --check electron/preload.cjs` passed.
- `git diff --check` passed.
- Build emitted only the existing Vite `configLoader: 'native'` CommonJS/ESM warning.

Runtime interaction acceptance was completed by the user. The user confirmed project creation/selection, task creation, visible inline editing and save, movement through all four Kanban columns, reload persistence, task deletion, project deletion, empty state recovery, Learning & Development navigation, Academy pane visibility, splitter resizing, Academy close/open behavior, and board operation after returning from Learning. Do not expand scope until the user explicitly approves the next phase.

## Verified repository baseline

- Git repository exists at the active project root.
- Recent baseline commits include `feat: add learning command center` and `chore: establish North Star project baseline`.
- The project is an Electron + React + Vite desktop app.
- The existing brief records substantial working learning, persistence, native Academy, capture, practice, flashcard, review, and resizable-shell behavior. Future sessions must inspect source and verify behavior rather than treating historical notes as proof of current runtime state.

## Current product state

- Product direction has changed from a certification-first app to an AI Executive Coach Command Center.
- Existing learning/certification functionality remains a protected module.
- Phase 1 now provides the broader product shell and truthful command-center landing state.
- The left navigation is organized into Command Center and Learning & Development sections.
- The landing view explicitly labels future executive workflows as planned rather than simulated.
- Existing learning curriculum, local state, Academy IPC, native BrowserView, and splitter code remain in place.
- The local Projects + Tasks + Kanban workflow is implemented and is the active priority for runtime acceptance and board-focused fixes.
- No coach engine, usage integration, authentication, or cloud behavior was added.
- The long-term vision is documented in `.hermes/PRODUCT_VISION.md`.
- Cross-session decisions are documented in `.hermes/DECISIONS.md`.
- The active implementation boundary is documented in `.hermes/plans/PHASE-02-projects-tasks-kanban.md`.
- Phase 1 remains historical context only; its acceptance note is not the current stop condition.

## Completed in this phase

- Replaced the oversized, learning-centric project brief with a concise project-wide source of truth.
- Added the long-term product vision.
- Added a current-status ledger.
- Added a durable decision log.
- Added a reusable session handoff template.
- Defined the first implementation phase and its stop conditions.
- Reframed the app identity and top-level navigation around Executive Coach Command Center.
- Preserved Learning & Development as a distinct module.
- Added truthful planned-state messaging for future executive workflows.

## Current next task

Complete the SQLite migration end-to-end: wire `src/main.jsx` to `coachBootstrap` and CRUD IPC, display the canonical roadmap from `C:/Users/joshr/OneDrive/Desktop/canonical-ai-executive-coach-roadmap.csv`, preserve Learning & Development/Academy behavior, resolve or document Electron `better-sqlite3` compatibility, and verify persistence through a real Electron restart.

## Not started

- Today/focus workflow
- Coach context layer
- Coach guidance or approval workflow
- App-originated API/token/cache usage ledger
- Provider-wide usage integrations

## Historical Phase 1 verification

- `npm run build` passed on 2026-08-06; Vite emitted only the pre-existing CommonJS/ESM configuration warning.
- `node --check electron/main.cjs` passed.
- `node --check electron/preload.cjs` passed.
- `git diff --check` passed.
- Production desktop launch was started with `npm run desktop:prod`; Electron processes were observed running.
- Native Academy visual interaction was not independently exercised in that session; preserve the recorded BrowserView behavior as prior evidence, not current Kanban verification.
- Phase 1 acceptance is historical context; the active verification target is Phase 2 Kanban runtime acceptance.

## Active database-migration stop condition

Do not begin Today/Focus, coach intelligence, integrations, usage tracking, authentication, cloud sync, provider connections, or unrelated redesign. Stop only after the database-backed roadmap is visible, project/task CRUD works through secure IPC, persistence survives a complete Electron restart, protected Learning & Development/Academy behavior is checked, and exact verification evidence is recorded. If a native build prerequisite blocks `better-sqlite3`, keep working through verified alternatives and report the precise external dependency only after exhausting them.

## Scope note

The implementation changes only the product shell, navigation labels/grouping, command-center landing copy/cards, truthful planned-state messaging, and related styling. Existing learning state, localStorage schema, Academy IPC, native BrowserView, capture/material/review persistence, and splitter geometry were not intentionally changed.

## Not included in verification

No automated test suite is defined in `package.json`; build and syntax checks are the available project gates.
## Explicitly deferred

- Autonomous agent behavior
- Broad external integrations
- Authentication and cloud sync
- Provider-wide usage retrieval requiring credentials
- Medical or clinical ADHD functionality
- Full replacement of the existing learning experience
- Large-scale database migration

## Verification status

Phase 1 source changes, build checks, syntax checks, diff checks, and a production Electron launch were completed. See the Phase 1 verification section above for exact evidence and limitations.

## How to update this file

Replace stale state; do not append a chat transcript. Keep only durable facts, the current bounded objective, meaningful blockers, and verification results. If a decision changes, update `.hermes/DECISIONS.md` and reference the decision here.
