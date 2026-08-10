---
status: active
scope: project-navigation
read_when: every coding session
last_verified: 2026-08-10
---

# Documentation index

This is a navigation map, not a document to expand into a full reading list. Read only the row that matches the user's task.

| Task | Read next | Status | Do not load by default |
|---|---|---|---|
| Any task | `PROJECT_BRIEF.md`, `git status`, relevant source/tests | active | all plans |
| Job-search debugging | `HERMES_HANDOFF_AI_JOB_SEARCH.md` | active handoff | older job-search plans |
| Job-search product/design | `plans/ai-job-search-and-application-documents.md` | reference | unless requirements are needed |
| USAJOBS retrieval | `plans/hermes-usajobs-debug-handoff.md` | reference | unrelated plans |
| Academy capture/review | `ACADEMY_CAPTURE_PHASE.md` | completed/reference | job-search plans |
| Command-center architecture | `.hermes/PRODUCT_VISION.md`, `.hermes/DECISIONS.md` | reference | completed phases |
| Current verified state | `.hermes/PROJECT_STATUS.md` | active status | historical sections |

## Loading rules

1. Start with `PROJECT_BRIEF.md` and the current task's source files.
2. Open one task document only when its row says to do so.
3. Read a narrow line range or search result before opening a long plan.
4. Treat source code and current git state as more authoritative than notes.
5. Treat dated verification as historical evidence unless the current task reproduces it.
6. Do not read dependencies, generated output, old transcripts, or every plan for context.

## Current repository note

The working tree may contain an active job-search change set. Do not discard or stage unrelated changes. Select files explicitly when committing documentation.