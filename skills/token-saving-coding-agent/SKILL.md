---
name: token-saving-coding-agent
description: Reduce unnecessary context, tool usage, and response verbosity during coding-agent sessions while preserving correctness and verification.
---

# Token-Saving Coding Agent

Use this skill for Claude/Cline-style coding sessions when context-window cost, latency, or output volume matters. Optimize for **useful information per token**, not minimal text at any cost.

## Operating principles

- Lead with the result, decision, or next action.
- Do not repeat the request, established context, or unchanged findings.
- Be concise by default; expand when ambiguity, implementation risk, security, or failed verification requires it.
- Preserve correctness, safety, and required verification even when saving tokens.

## Gather context efficiently

1. Inspect the repository shape, status, package metadata, and task-specific conventions before editing.
2. Search for symbols, filenames, configuration, tests, and existing patterns before opening files.
3. Read only relevant files and narrow line ranges. Start with entry points, interfaces, and nearby tests.
4. Batch independent searches, reads, and checks in one tool turn.
5. Do not reload content already available in the conversation unless the file may have changed.
6. Avoid dependency directories, generated output, build artifacts, large logs, old transcripts, and unrelated history.
7. For long documents, inspect headings or search hits first; load the smallest section that answers the question.

## Control context growth

- Summarize a large result immediately into decisions, relevant paths, constraints, and open risks.
- Keep references such as `path/to/file:line` instead of copying unchanged source or logs into responses.
- Prefer filtered command output (`--stat`, selected files, focused test names, relevant log lines) over raw output.
- Maintain a short working checklist: objective, constraints, files to change, validation, and unresolved risks.
- Remove stale hypotheses from the working summary when source or tests disprove them.

## Plan and implement minimally

- Clarify only ambiguity that blocks a safe implementation; otherwise make a stated, conservative assumption.
- Identify the smallest coherent change and the files it requires before editing.
- Follow existing framework, naming, formatting, persistence, IPC, and testing conventions.
- Reuse confirmed libraries and patterns. Do not introduce dependencies or speculative abstractions.
- Avoid unrelated refactors, drive-by formatting, duplicated documentation, and premature generalization.
- Protect unrelated working-tree changes: inspect status, edit intentionally, and stage explicit paths.

## Adaptive verification

Use risk to choose verification effort; token savings never justify skipping a required gate.

| Change | First check | Broader check |
|---|---|---|
| Documentation or copy only | Markdown/whitespace/diff review | Repository-required docs validation |
| Pure local logic | Focused unit test or direct assertion | Related test set before merge |
| Persistence, IPC, shared state, or security | Focused regression test plus syntax check | Full applicable suite and migration/runtime checks |
| UI or Electron behavior | Build, focused tests, and relevant runtime interaction | Production-style acceptance before merge |
| Network/provider behavior | Mocked focused tests, redaction/security checks | Full provider-related tests and manual acceptance when required |

- Do not automatically create tests or run the full suite after every exploratory act.
- Batch related implementation work, then validate at meaningful checkpoints.
- Add or update regression tests for completed behavior when the repository policy and risk justify them.
- Before commit, run focused checks and inspect the final diff. Before merge, run the full applicable verification.
- If a check is skipped, say why. If it fails, report the failure and do not claim success.

## Tool-use rules

- Before a tool turn, identify all independent reads, searches, checks, or edits needed next and batch them.
- Do not issue speculative tool calls merely to appear thorough.
- Use the most targeted tool available: search for discovery, file reads for known content, and commands for executable validation.
- After editing, reread the changed sections and inspect the diff. Verify that only intended files changed.
- Never print, copy, commit, or include secrets, credentials, cookies, tokens, or authorization headers.

## Response style

### Progress updates

Use short updates containing only:

1. what was learned or changed;
2. the immediate next action;
3. a blocker or risk, if any.

Do not narrate routine tool usage or reproduce full command output.

### Final response

Keep the final response compact and structured:

- **Changed:** brief file- or behavior-level summary;
- **Validated:** checks that actually ran and their results;
- **Not run / limitations:** relevant omissions or failures;
- **Follow-up:** only if a next action is genuinely needed.

Include commit, branch, or deployment identifiers when applicable. Do not include full diffs unless requested.

## Stop conditions

Stop when the approved objective is complete, its applicable verification has run, and the final diff is understood. Do not silently begin adjacent work or load more context after the answer is already supported.