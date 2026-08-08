# Phase 4 — Follow-through and Accountability

**Phase ID:** `AICC-PHA-002`
**Parent release:** `AICC-REL-001` (Personal Execution Foundation)
**Status:** In progress — contract defined
**Starts after:** `AICC-PHA-001` (Today View) is complete
**Priority rule:** Work only on the four scope items below. Do not begin coaching intelligence, integrations, usage tracking, notifications, calendar sync, or unrelated redesign.

## Goal

Implement follow-through and accountability `(AICC-PHA-002)` as a bounded, local-first, read-mostly capability that helps the user notice blocked/stale/neglected work, surface what they committed to, and review commitments — without inventing completion, duplicating task state, or mutating the roadmap without an explicit user action.

## Exact task contract (source of truth)

These records come from the live SQLite roadmap (`executive-coach.sqlite`), table `projects` (phase) and `tasks`. Status of all four is `backlog`, priority `P1`.

### `AICC-SUB-002` — Define contract and acceptance cases

- **Description:** Define evidence and stop conditions for model commitment lifecycle.
- **Next action:** Record the contract before implementation.
- **Definition of done:** The parent task has reviewable acceptance cases.
- **Dependency:** `AICC-TSK-004`
- **Acceptance criteria:** The subtask output is attributable and reviewable.
- **Security notes:** Keep data local and minimize retained context.

### `AICC-TSK-004` — Model commitment lifecycle

- **Description:** Represent commitment states and evidence without inventing completion.
- **Next action:** Define commitment state transitions.
- **Definition of done:** The implementation is exercised with real stored data and its documented gate passes.
- **Dependency:** `AICC-PHA-002`
- **Acceptance criteria:** Model commitment lifecycle works as specified, persists correctly, and does not bypass user control.
- **Security notes:** Use real attributable data only; never request, store, or invent credentials, secrets, or provider claims.

### `AICC-TSK-005` — Surface stale and blocked work

- **Description:** Identify stale, blocked, and neglected items from stored task data.
- **Next action:** Define explainable stale and blocked rules.
- **Definition of done:** The implementation is exercised with real stored data and its documented gate passes.
- **Dependency:** `AICC-TSK-004`
- **Acceptance criteria:** Surface stale and blocked work works as specified, persists correctly, and does not bypass user control.
- **Security notes:** Use real attributable data only; never request, store, or invent credentials, secrets, or provider claims.

### `AICC-TSK-006` — Add follow-up review

- **Description:** Provide a queue where the user can acknowledge, defer, or update a commitment.
- **Next action:** Design reversible review outcomes.
- **Definition of done:** The implementation is exercised with real stored data and its documented gate passes.
- **Dependency:** `AICC-TSK-005`
- **Acceptance criteria:** Add follow-up review works as specified, persists correctly, and does not bypass user control.
- **Security notes:** Use real attributable data only; never request, store, or invent credentials, secrets, or provider claims.

## Dependency order

```text
AICC-SUB-002  →  AICC-TSK-004  →  AICC-TSK-005  →  AICC-TSK-006
```

`AICC-SUB-002` is a prerequisite contract task: it defines the commitment lifecycle rules that `AICC-TSK-004` implements.

## Commitment lifecycle contract (from AICC-SUB-002)

### What counts as a commitment

Any active task or subtask in the local roadmap. A commitment is a real, stored record — not a derived or inferred item.

### Active vs. inactive records

Exclude a record from follow-through consideration when any of the following is true:

- `status === 'done'`
- `status === 'skipped'` (treat as completed, do not surface)
- `archived === true`
- `deletedAt` is not null/empty

### Commitment states exposed by the lifecycle

The implementation reuses the existing roadmap `status` values and does not invent new task storage. The lifecycle layer exposes:

| Lifecycle signal | Derived from | Rule |
| --- | --- | --- |
| committed | any active task/subtask | record is active per the exclusion rule above |
| blocked | `status === 'blocked'` or `blockedReason` non-empty | blocked reason must be surfaced |
| in-progress | `status === 'in-progress'` | |
| scheduled | `status` is `todo` or `backlog` and due date is present | |
| overdue | `dueDate` is present and `dueDate < reference_date` | |
| stale | active, not done, and `updatedAt` older than the stale threshold | |
| neglected | active, `nextAction` is empty, and staleness applies | |

### Stale threshold

A record is stale when it is active, not completed, and its `updatedAt` (ISO date `YYYY-MM-DD`) is at least 7 calendar days before the reference date. The threshold is defined explicitly here so it is reviewable and changeable. Records with no `updatedAt` are treated as "unknown staleness" and are not reported as stale.

### Evidence rules

- Completion evidence is `status === 'done'` only. Do not treat viewing, opening, or reviewing a task as completion evidence.
- A `nextAction` value on a `done` task is ignored: done tasks never surface.
- Blocked evidence is `status === 'blocked'` or a non-empty `blockedReason`.
- Stale/neglected evidence is derived from `updatedAt` and `nextAction` only.

### What does not count as evidence

- UI focus, hover, or selection.
- Opening a task detail panel.
- A review action by itself.

### Defer and acknowledge behavior

- Acknowledge confirms the user reviewed a commitment. It does **not** set status to `done`. It is a reversible signal recorded against the review record, not against the task.
- Defer moves a commitment forward without completion. It must not erase the task. A defer action updates the task's `nextAction` and/or `dueDate` through the existing `updateTask` API, and the action is reversible.
- Update commitment opens the existing task editing flow.

## Delivered scope (to be implemented)

- `src/commitmentLifecycle.mjs` — pure, testable commitment-state derivation over roadmap records (read-only).
- `test/commitment-lifecycle.test.cjs` — derivation tests, run via `node --test`.
- `src/followThroughView.mjs` — pure, testable view that identifies stale/blocked/neglected items (read-only), reusing the `commitmentLifecycle` contract.
- `test/follow-through-view.test.cjs` — derivation tests, run via `node --test`.
- `src/main.jsx` — add a Follow-through navigation entry and grounded review queue. Read-only display plus explicit, user-triggered review actions.
- `src/styles.css` — Follow-through styling.
- Documentation updates to `.hermes/PROJECT_STATUS.md` and this plan.

## Explicit non-goals

No AI coaching, autonomous mutation, cloud sync, calendar integration, push notifications, credentials, provider API calls, usage tracking, separate task database, or Academy/Learning redesign.

## Stop condition

`AICC-SUB-002` through `AICC-TSK-006` pass automated derivation tests and an explicit manual Electron acceptance, and `.hermes/PROJECT_STATUS.md` records their verified state. Do not begin coaching, integrations, usage tracking, or later phases without explicit approval.

## Verification

```bash
npm run build
node --test
node --check electron/main.cjs
node --check electron/preload.cjs
node --check electron/database.cjs
node --check src/commitmentLifecycle.mjs
node --check src/followThroughView.mjs
git diff --check
git status --short
```

