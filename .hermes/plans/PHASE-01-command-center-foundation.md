# Phase 1 — Command Center Foundation

> **For Hermes:** Implement only this phase after the user explicitly approves the implementation scope. Read `PROJECT_BRIEF.md`, `.hermes/PRODUCT_VISION.md`, `.hermes/PROJECT_STATUS.md`, and `.hermes/DECISIONS.md` first.

**Goal:** Introduce a safe executive-coach command-center shell and information architecture while preserving the existing learning experience, native Academy pane, data, and desktop behavior.

**Architecture:** Keep Electron + React + Vite. Make additive renderer and local-state changes only where possible. Treat existing learning persistence and IPC contracts as compatibility boundaries. Do not build the AI coach, external integrations, or provider-wide usage tracking in this phase.

**Tech stack:** Electron, React, Vite, JavaScript/JSX, existing localStorage/IPC architecture, existing styling system.

---

## Phase status

**Status:** Planning only — not authorized for implementation by this document alone.  
**Start condition:** User approves Phase 1 after repository inspection confirms the scope is safe.  
**Stop condition:** Acceptance criteria and verification pass; do not continue into Projects/Kanban or coach intelligence unless separately approved.

## Product outcome

The app should visibly and truthfully become the foundation of an AI Executive Coach Command Center. A user should be able to understand that the application will organize broader executive work while still being able to access the preserved Learning & Development capability.

This phase is a product-shell foundation, not a full productivity suite.

## Scope

1. Inspect the actual current repository, UI, navigation, persistence, IPC, and native Academy implementation.
2. Define the minimum safe top-level navigation for the broader product.
3. Add or refine a Command Center landing view without fabricating project, task, usage, or coaching data.
4. Reframe existing learning as a clearly named module.
5. Preserve existing learning views and behavior.
6. Add clearly labeled future-capability states only when they improve navigation clarity; they must not pretend to be implemented.
7. Preserve the three-pane shell, Academy BrowserView, and splitter/resizing.
8. Document the resulting state and any decisions.

## Default navigation direction

Use the smallest subset supported by the current app. Do not add every future module at once.

Potential first-level structure:

- Command Center
- Today / Focus — planned unless a real first version is included in approved scope
- Projects — planned for Phase 2 unless explicitly pulled forward
- Decisions — planned
- Review — planned or existing only
- Learning & Development — existing learning functionality
- Notes / Knowledge — existing notes only if safely reusable
- Settings — only if already present or required

Do not expose dead-end navigation solely to make the product appear larger.

## Explicit non-goals

- No full AI coach or chat experience
- No autonomous recommendations engine
- No project database or Kanban board unless separately approved
- No API/token/cache provider integration
- No provider-wide usage dashboard
- No authentication, cloud sync, or backend
- No new credentials or secret handling
- No scraping, crawling, or automated Academy capture
- No destructive migration or storage-key rename
- No replacement of the current learning UI
- No fake projects, tasks, metrics, progress, or coaching output
- No unrelated visual redesign

## Required discovery before implementation

Inspect and record facts from:

- `package.json`
- `README.md`
- `PROJECT_BRIEF.md`
- `.hermes/` documents
- `src/main.jsx`
- `src/styles.css`
- `electron/main.cjs`
- `electron/preload.cjs`
- Relevant components and data files
- Existing localStorage keys and JSON schemas
- Existing IPC channels
- Existing BrowserView and resize code

Confirm:

- Which view is currently the app entry point
- How navigation state is represented and persisted
- How the Academy pane is created, shown, hidden, and resized
- Which learning actions are read-only versus mutating
- Whether a safe Command Center shell can be added without changing learning contracts

## Data and persistence rules

- Do not migrate or delete existing learning data.
- Do not rename existing localStorage keys.
- If a saved view becomes invalid, fall back safely while leaving the original saved value untouched or preserving it through a compatibility path.
- New command-center state must be versioned and additive.
- Do not create fake records for empty states.
- Do not mix official Anthropic content with app-created planning data.
- Do not add a data model merely for future speculation.

## Security and privacy gates

Before implementation is considered complete, verify:

- No credentials, cookies, passwords, tokens, authorization headers, or secrets were added.
- No new network calls were introduced.
- No provider-wide usage claims were added.
- No coach prompt or local state exposes sensitive values unnecessarily.
- Any future capability is labeled planned or unavailable rather than simulated.

## UX requirements

- The command center should communicate one clear product identity.
- Empty states should tell the truth and provide a useful next step.
- Avoid dashboard overload.
- Keep the existing visual language unless a focused change is needed.
- Preserve keyboard, focus, and resize behavior where currently functional.
- Do not imply the coach has context or intelligence that has not been implemented.
- Use ADHD-aware language only as practical workflow support, never as medical treatment or diagnosis.

## Likely files

The exact files must be confirmed during discovery. Likely files include:

- Modify: `src/main.jsx`
- Modify: `src/styles.css`
- Modify: `PROJECT_BRIEF.md` only if stable current state changes
- Modify: `.hermes/PROJECT_STATUS.md`
- Modify: `.hermes/DECISIONS.md` only for durable decisions
- Do not modify `electron/main.cjs` or `electron/preload.cjs` unless discovery proves a minimal, necessary, safe change is required.

## Acceptance criteria

- The product is visibly framed as an AI Executive Coach Command Center.
- Learning/certification is accessible as a distinct integrated module, not the product identity.
- Existing learning navigation and working learning behavior remain accessible.
- Existing curriculum, notes, captures, practice, flashcards, review, persistence, and Academy behavior are not intentionally removed or corrupted.
- Empty or future areas are truthfully labeled and do not contain fake data.
- The native Academy pane remains native and the resizer still works.
- No credentials or secrets are requested or stored.
- No new unapproved network behavior exists.
- No destructive persistence migration occurs.
- The change is limited to the approved Phase 1 scope.

## Verification commands

Run from the active project root:

```bash
npm run build
node --check electron/main.cjs
node --check electron/preload.cjs
git diff --check
git status --short
```

If renderer or Electron runtime behavior changes:

```bash
npm run desktop:prod
```

Verify in the running app, as applicable:

- Command Center entry point renders
- Learning module opens
- Existing learning state remains available
- Academy BrowserView loads natively
- Pane splitter has a live usable region
- Saved navigation state does not produce a blank or broken screen
- No runtime errors are recorded during the relevant workflow

## Commit guidance

Use a feature branch dedicated to the phase. Make small focused commits. Do not combine documentation, navigation, persistence, and unrelated polish into one unreviewable change.

## Rollback strategy

- Revert the focused phase commits.
- Do not delete user data as part of rollback.
- Preserve old navigation state and storage keys.
- If a new view is invalid, remove only its routing/entry point and leave existing learning state untouched.
- Record rollback or partial completion in `.hermes/PROJECT_STATUS.md`.

## Handoff after completion

Update:

- `.hermes/PROJECT_STATUS.md` with verified behavior, files changed, and remaining risks
- `.hermes/DECISIONS.md` with any durable architecture/product decisions
- `PROJECT_BRIEF.md` only if the stable product direction or current phase changed

Then stop. The next phase should be separately planned and approved.

## Safest next phase after Phase 1

Phase 2 should define and implement the smallest useful local Projects + Tasks + Kanban workflow. It must first specify the data model, persistence compatibility strategy, empty-state behavior, and coach-read boundary before adding a board.

## Open questions requiring user decision before later phases

- Whether the first board should resemble Pivotal Tracker, Trello, Linear, or a custom executive Kanban.
- Whether the coach is initially read-only or may draft changes for approval.
- Which providers/models are in scope for app-originated usage tracking.
- Whether usage tracking records only this app’s calls or later connects to provider dashboards.
- Which personal data categories the future coach may access.
- What the single highest-value daily workflow is.
