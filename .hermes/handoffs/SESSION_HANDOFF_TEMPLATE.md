# New Session Handoff Template

Copy this prompt into a new session after replacing the bracketed objective.

```text
You are continuing work on the AI Executive Coach Command Center.

Work only in:
C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native

Do not modify or use:
C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification

Before making changes:

1. Read PROJECT_BRIEF.md.
2. Read .hermes/PRODUCT_VISION.md.
3. Read .hermes/PROJECT_STATUS.md.
4. Read .hermes/DECISIONS.md.
5. Read the active phase document under .hermes/plans/.
6. Inspect git status, recent commits, and the actual source files relevant to this task.
7. Confirm that the requested work belongs to the active phase.

Current objective:
[ONE bounded objective. State exactly what should be delivered and what is out of scope.]

Rules:

- Do not start another major feature phase.
- Preserve existing learning data and behavior.
- Preserve the native Anthropic Academy pane and resizable desktop shell.
- Do not request, store, expose, or add credentials, cookies, passwords, tokens, authorization headers, or secrets.
- Do not add authentication, cloud sync, scraping, crawling, or new network behavior without an explicit approved decision.
- Do not invent data, usage, costs, coach insights, integrations, or official content.
- Prefer additive, local-first, reversible changes.
- Keep coach behavior explainable, reviewable, and user-approved before mutations.
- Use the smallest safe change and touch only intentional files.

Before finishing:

1. Run the narrowest useful verification.
2. Run the standard build/syntax/diff checks when code changes.
3. If UI or Electron behavior changes, run the production desktop app and verify the relevant behavior.
4. Update .hermes/PROJECT_STATUS.md with the new verified state.
5. Add a decision to .hermes/DECISIONS.md only if a durable choice was made.
6. Report what changed, what was preserved, verification results, risks, and the next safest phase.
7. Stop when this objective is complete.
```

## Good objective examples

- Define the additive project/task persistence schema without changing the learning schema.
- Add a minimal Projects view using real local data, without implementing the coach.
- Add the first Kanban interaction for existing project tasks, with persistence and tests.
- Add an app-originated usage-event ledger using real response metadata only.

## Bad objective examples

- Build the whole command center.
- Add projects, Kanban, AI coaching, analytics, integrations, and sync together.
- Make the app intelligent.
