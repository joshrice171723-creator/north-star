# North Star Codex Integration Handoff

## Objective

Add an optional, practical Codex workspace to North Star without making Codex a requirement for ordinary users.

## Product decisions

- North Star's normal AI features continue using the existing OpenRouter path.
- Codex is an optional advanced/developer feature, not the core assistant for the public product.
- The initial UI is a dedicated sidebar tab named `Codex workspace`.
- The first safe slice provides a clear availability state and a scoped workspace/file-navigation surface.
- Codex must never receive unrestricted access to the user's computer by default.

## Technical constraints

- The application is Electron + React with a narrow preload bridge.
- Privileged work belongs in `electron/main.cjs`; the renderer must not receive secrets or direct filesystem access.
- Preserve the current architecture and dependency choices unless the Codex SDK is explicitly implemented.
- Do not change OpenRouter behavior.
- Any future Codex execution must use an explicit workspace root, approval gates, and a disabled/unavailable state when the local Codex runtime is absent.

## Implementation sequence

1. Add the Codex workspace navigation entry and a practical empty/unavailable view.
2. Add the renderer-to-main capability/status contract without exposing credentials.
3. Add scoped file listing only after the workspace root is explicitly selected and validated.
4. Add Codex thread execution, streamed events, and approval handling as a separate follow-up slice.
5. Add tests for path isolation, unavailable runtime behavior, and renderer IPC contracts.

## Out of scope for the first slice

- Replacing OpenRouter.
- Embedding the Codex desktop UI or using an iframe.
- Automatic file edits, shell commands, commits, or network access.
- Requiring customers to install Codex to use North Star's core features.

## Handoff acceptance criteria

- A normal user can use North Star without Codex installed.
- The Codex tab explains its optional status and does not fail noisily when unavailable.
- The UI establishes the intended location for future file navigation and approvals.
- Existing tests and OpenRouter-powered workflows remain unchanged.
