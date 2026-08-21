# AI Executive Coach Command Center — Project Brief

> **Read this file first in every new session.** It is the compact project index. Do not read every linked document; use `.hermes/DOCUMENT_INDEX.md` to select one relevant document.

**Last updated:** 2026-08-10
**Active project:** `C:/Users/joshr/OneDrive/Desktop/north-star/anthropic-certification-native`

## Product identity

This is a local-first Electron desktop **AI Executive Coach Command Center**. The AI Executive ADHD Coach is intended to become the intelligence layer across projects, goals, tasks, focus, decisions, reviews, notes, learning, and AI resource usage.

The product is not primarily a learning app. Existing Anthropic certification and Academy functionality is preserved as one integrated Learning & Development capability inside the broader command center.

## Current technology

- **Stack:** Electron, React, Vite, JavaScript/JSX, Lucide icons
- **Electron entry:** `electron/main.cjs`
- **Preload:** `electron/preload.cjs`
- **Renderer entry:** `src/main.jsx`
- **Styles:** `src/styles.css`
- **Build:** `npm run build`
- **Desktop production run:** `npm run desktop:prod`
- **Documentation rule:** This file contains stable rules and navigation, not a session transcript. `.hermes/PROJECT_STATUS.md` contains current verified state.

## Product vision

The command center should help the user:

- See what matters now
- Choose one realistic next action
- Manage multiple projects without losing context
- Identify blocked, stale, or neglected work
- Plan, execute, and review progress
- Make and revisit decisions
- Use ADHD-aware structure to reduce overwhelm and context switching
- Understand AI API, token, cache, and estimated-cost usage from real data
- Eventually receive grounded, explainable coaching based on the command-center state

Read `.hermes/PRODUCT_VISION.md` for the long-term model and principles.

## Current work selection

The user decides the active objective. The current working tree contains an in-progress job-search change set; for that work, read `HERMES_HANDOFF_AI_JOB_SEARCH.md`. For another task, use `.hermes/DOCUMENT_INDEX.md` and load only the matching reference.

Completed phases and older plans are historical references, not automatic instructions.

## Must preserve

- Electron + React + Vite architecture unless a justified decision approves otherwise
- Existing resizable three-pane desktop shell
- Native Anthropic Academy BrowserView/pane and its resize behavior
- Existing learning navigation and working learning features
- Existing curriculum, notes, captures, practice, flashcards, review behavior, localStorage keys, JSON schemas, and IPC contracts
- Separation between official Anthropic data, Academy-derived captures, and app-created practice
- Existing user data; no destructive migration

## Non-negotiable safety rules

- Never expose credentials, cookies, passwords, authorization headers, or secrets to the renderer, logs, documents, commits, or tool output. Provider credentials may be stored only when explicitly approved, encrypted by the operating system in the Electron main process, and kept out of renderer state and diagnostics.
- Do not add authentication, cloud sync, scraping, automated crawling, or new network behavior without an explicit approved decision.
- Do not claim provider-wide API usage unless a real, verified source exists. A safe initial usage tracker may record only requests made by this app.
- Do not fabricate projects, progress, usage, costs, coach insights, integrations, or official content.
- Coach recommendations must eventually be explainable, reviewable, reversible, and user-approved before data mutation.
- ADHD-aware design must not make medical diagnoses or clinical claims.
- Prefer additive, local-first, reversible changes.

## Working protocol

1. Read this file, `.hermes/DOCUMENT_INDEX.md`, git status, and only the task-specific source/docs required.
2. Inspect the actual source and git state; source code outranks stale notes.
3. Work on one bounded objective only.
4. State the smallest safe approach before editing.
5. Make focused changes and validate at meaningful checkpoints.
6. Do not automatically create tests or run the full suite after every exploratory act. Batch related work; use focused checks for behavior, persistence, networking, security, and shared logic.
7. Before commit, add/update regression tests for completed behavior and run relevant focused validation. Before merge, run the full applicable verification suite.
8. Update `.hermes/PROJECT_STATUS.md` and `.hermes/DECISIONS.md` only when durable state changes.
9. Update this brief only when product direction, constraints, navigation, or stable current state changes.
10. Stop when the approved objective is complete. Do not silently begin the next phase.

## Standard verification

```bash
npm run build
node --check electron/main.cjs
node --check electron/preload.cjs
git diff --check
```

When UI or Electron behavior changes, also run `npm run desktop:prod` and verify the relevant behavior in the running app.

## Authority order

When project documents disagree, use this order:

1. Current explicit user instruction
2. This `PROJECT_BRIEF.md`
3. `.hermes/DECISIONS.md`
4. The active phase document
5. `.hermes/PRODUCT_VISION.md`
6. `.hermes/PROJECT_STATUS.md`
7. Older session transcripts

## Stop condition

Do not start a later major feature until the active phase acceptance criteria pass, verification results are recorded, unresolved risks are visible, and the user explicitly approves the next phase.

## Obsolete historical context

The previous product direction centered on Anthropic certification study. That functionality remains valuable and must remain intact, but it is now a module rather than the product identity. Historical certification details and prior implementation notes remain available in git history and older session records; do not let them override this brief.
