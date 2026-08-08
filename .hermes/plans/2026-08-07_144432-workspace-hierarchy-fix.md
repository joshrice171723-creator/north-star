# Workspace Hierarchy and Sidebar Alignment Plan

> **For Hermes:** Implement this plan task-by-task. Do not expand scope beyond the workspace/project hierarchy and the focused UI verification.

**Goal:** Make Workspaces a true top-level collection: the left panel lists only workspaces, and every workspace appears once as a corresponding top-level workspace row in the right roadmap tree; projects appear only beneath their owning workspace.

**Architecture:** Keep the existing Electron/React/SQLite architecture. Enforce the hierarchy at the database boundary and make the renderer use the same normalized workspace/project relationships for both panels. Workspaces always have `parentId = null`; projects must have a workspace parent; releases must have a project parent; phases must have a release parent; tasks must have a project ID.

**Tech Stack:** Electron, React, Vite, JavaScript/JSX, Drizzle SQLite, Lucide icons.

**Project root:** `C:/Users/joshr/OneDrive/Desktop/hermes/anthropic-certification-native`

---

## User-approved UI/data rules

1. The left box under **New Workspace** contains only a list of workspaces.
2. A workspace is the highest-level record and cannot be a child of any workspace.
3. Every workspace in SQLite appears exactly once in the left workspace list.
4. Every workspace in SQLite appears exactly once as a top-level row in the right roadmap tree.
5. A project may appear under exactly one workspace and must never appear as a workspace child unless it is actually a project record.
6. A workspace with zero projects still appears in both panels.
7. Selecting a workspace enables **Add project** using that workspace as `parentId`.
8. Selecting a project enables **Add task** using that project as `projectId`.
9. Existing records must not be deleted merely to repair the display. Invalid legacy relationships should be reported or repaired through an explicit, reversible migration decision.

## Current verified cause

- `electron/database.cjs` already normalizes workspace records to `parentId: null` and rejects a workspace with a parent.
- The screenshot shows multiple workspace rows at the right root, which is correct for top-level workspaces.
- The renderer’s left panel historically rendered workspace containers but displayed only their child projects, causing workspace records to be visually absent or mixed with project rows.
- The renderer has active-workspace state, but the display and creation controls need one canonical relationship path rather than separate ad hoc lists.
- The screenshot also shows the left panel visually mixing workspace names and project cards. The implementation must make the row types explicit and prevent project cards from being mistaken for workspace entries.

---

## Task 1: Establish a single normalized hierarchy contract

**Files:**
- Inspect/modify: `src/main.jsx`
- Inspect/modify: `electron/database.cjs`
- Inspect: `electron/main.cjs`, `electron/preload.cjs`

**Steps:**
1. Confirm the renderer roadmap payload has these collections: `workspaces`, `projects`, `releases`, `phases`, `tasks`, `subtasks`.
2. Confirm every workspace returned to the renderer has `kind/type: 'workspace'` and `parentId: null`.
3. Confirm every project has `kind/type: 'project'` and a valid workspace `parentId`.
4. Add or reuse one small renderer helper that groups projects by `parentId` without changing record ownership:
   ```js
   const projectsForWorkspace = (workspaceId) =>
     projectNodes.filter((project) => project.parentId === workspaceId);
   ```
5. Do not infer a workspace from array position, `roadmap.workspace`, or a project title. Use IDs only.

**Acceptance:** The renderer has one explicit workspace-to-project relationship helper and the database remains the authority for valid parent types.

---

## Task 2: Make the left panel workspace-only

**File:** `src/main.jsx`

**Steps:**
1. Keep the **New Workspace** button at the top.
2. Render one workspace list item for each non-archived `workspaceNodes` entry.
3. Render the workspace title and project count inside that workspace item.
4. Render child projects only in a nested area clearly owned by the workspace item, or omit child project cards from the workspace-only list if the final UI requirement is strictly “list of workspaces.” The left panel must never render a project as a peer workspace.
5. If projects remain visible for navigation, give them a separate clearly labeled `Projects` subsection inside the selected workspace—not the workspace list itself.
6. Ensure an empty workspace still renders with `0 projects` and is clickable.
7. Clicking a workspace sets `activeWorkspaceId`, clears `selectedProjectId`, exits workspace-composer mode, and does not mutate database data.

**Acceptance:** The left panel visibly contains workspace entries only. `test 34`, `test`, and other workspace records appear as workspace entries; `testrt` appears only as a project beneath its owning workspace if project navigation is retained.

---

## Task 3: Make the right roadmap tree strictly top-level by workspace

**File:** `src/main.jsx`

**Steps:**
1. Render `workspaceNodes.map(tree)` as the only root collection for the roadmap tree.
2. Ensure the `children(workspace.id)` function can return only records whose `parentId` equals that workspace ID.
3. Ensure a workspace cannot be returned from `children(otherWorkspace.id)`; if malformed legacy data exists, filter it from child rendering and surface a database error rather than nesting it.
4. Render projects beneath their workspace, releases beneath projects, and phases beneath releases.
5. Keep each workspace as a top-level row with no workspace parent.
6. Add a focused defensive assertion/helper in development or a test so a workspace with `parentId !== null` is detected.

**Acceptance:** The right tree shows:
```text
workspace A
  project A1
workspace B
  project B1
workspace C
  project C1
```
Never:
```text
workspace A
  workspace B
```

---

## Task 4: Restore creation behavior by selected record type

**File:** `src/main.jsx`

**Steps:**
1. Selecting a workspace sets `activeWorkspaceId` and leaves `selectedProjectId` null.
2. With a workspace selected, the toolbar’s primary creation action is **Add project** and uses `parentId: activeWorkspaceId`.
3. Selecting a project sets both `activeWorkspaceId = project.parentId` and `selectedProjectId = project.id`.
4. With a project selected, the toolbar exposes **Add task** and sends `projectId: selectedProjectId`.
5. Do not allow `makeTask` to run without a selected project.
6. Do not allow `makeProject` to run without a selected workspace.
7. Creating a workspace selects it and refreshes both panels from SQLite.

**Acceptance:** Workspace → Add project → select project → Add task works without relying on the default/root workspace.

---

## Task 5: Add focused hierarchy regression coverage

**Files:**
- Test location: use the project’s existing test convention if one exists; otherwise add a narrowly scoped test or validation script under `tests/` only if the project supports it.
- Likely source target: `electron/database.cjs`

**Required cases:**
1. Workspace creation forces/stores `parentId = null`.
2. Workspace creation with a parent is rejected or normalized to null according to the chosen explicit contract; do not silently create nesting.
3. Project creation requires a workspace parent.
4. Release creation requires a project parent.
5. Phase creation requires a release parent.
6. A new workspace with zero projects appears in both normalized renderer collections.
7. Multiple workspaces remain siblings in the roadmap root.
8. The existing `AICC-WS-001` workspace and its project remain valid.

**Acceptance:** Focused tests or a deterministic validation script pass and cover the regression that produced the screenshot.

---

## Task 6: Visual and runtime verification

**Commands:**
```bash
npm run build
node --check electron/main.cjs
node --check electron/preload.cjs
git diff --check
npm run desktop:prod
```

**Manual acceptance in the running Electron app:**
1. Confirm the left panel has **New Workspace** plus workspace entries only.
2. Confirm every left workspace has exactly one matching top-level row in the right tree.
3. Confirm no workspace is indented beneath another workspace.
4. Confirm projects are indented beneath their workspace only.
5. Click a zero-project workspace and add a project.
6. Select that project and add a task.
7. Restart the app and confirm the hierarchy persists from SQLite.
8. Confirm no gray unreadable box or default browser button styling remains.
9. Confirm the Academy pane and unrelated learning features remain unchanged.

**Stop condition:** Stop after the focused hierarchy behavior works, the build/syntax/diff checks pass, and the manual workspace → project → task flow is verified. Do not start unrelated dashboard, coaching, integration, or learning changes.

---

## Risks and explicit non-goals

- Do not reset or delete the SQLite database to make the screenshot look correct.
- Do not silently reassign existing projects or workspaces without identifying the records and choosing a reversible migration.
- Do not add a new persistence layer.
- Do not redesign the whole roadmap screen.
- Do not modify Academy navigation, credentials, network behavior, or unrelated task features.
- If the database contains malformed workspace parent IDs, stop after reporting the exact records and propose a separate migration rather than guessing.

## Final response format after implementation

- **Result:** concise description of the hierarchy fix.
- **Files affected:** names only.
- **Verification:** exact commands and manual flow passed.
- **Blockers:** only real blockers.
