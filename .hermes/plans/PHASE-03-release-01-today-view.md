# Phase 3 — Release 1: Today View

**Status:** Implementation complete; automated verification passed. Interactive Electron acceptance is a manual handoff.

**Goal:** Deliver the grounded Today View for Release 1 (`AICC-REL-001`, phase `AICC-PHA-001`) — Surface prioritized, explainable next actions that are derived from the persisted roadmap without inventing, duplicating, or mutating data.

**Priority rule:** Only the three Today View tasks (`AICC-TSK-001`–`AICC-TSK-003`) are in scope. Do not begin Follow-through/Accountability, Task Initiation, Focus Mode, coach intelligence, integrations, usage tracking, or unrelated redesign.

## The three tasks

1. **`AICC-TSK-001` — Preserve roadmap foundation** (`done`): Retain the current local roadmap contract and database as the single source of truth. No feature work.
2. **`AICC-TSK-002` — Define Today view contract** (`done`): Record the derived-view contract (see decision `D013`): read-only derivation over roadmap records; stable IDs; exclude completed/archived; ordering = blocked → in-progress → to-do → backlog, weighted by priority (P0/P1/P2/P3/P4 and urgent/high/medium/low), due date, then title; surface blocked reason and next action.
3. **`AICC-TSK-003` — Assemble grounded next actions** (`done`): Prototype the derived view from roadmap records.

## Delivered scope

- `src/todayView.mjs` — pure, testable Today View derivation.
- `src/main.jsx` — `Today` navigation entry (default view), Today render with intros, counts, ordered next-actions list, and truthful empty/loading/error states.
- `src/styles.css` — Today View styling.
- `test/today-view.test.cjs` — automated derivation tests (run via `node --test`).

## Explicit exclusions

No autonomous writes, no separate task store, no fake metrics, no deadlines that mutate state, no coach intelligence, no cloud sync, no credentials, no changes to Learning & Development or Academy contracts.

## Verification

Passed: `npm run build`; `node --test` (14 tests); `node --check electron/main.cjs`; `node --check electron/preload.cjs`; `git diff --check`. Manual handoff: open Today in the production Electron app and confirm the derived list matches the SQLite roadmap and that Projects/Learning/Academy still work.

## Stop condition

Today View acceptance passes and no later-phase work begins without separate approval.
