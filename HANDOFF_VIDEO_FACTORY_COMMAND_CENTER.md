# Handoff: Command Center Video Factory

## Objective

Add a low-cost, approval-gated Video Factory workflow to the North Star command center. The user should be able to request one news/explainer video per day from the command center, review the research/script/storyboard/cost, render a draft locally, and approve it before publishing.

The target format is a faceless AI news/explainer video similar to the referenced Galbot ET1 video: narrated script, source-backed claims, screenshots/images/product footage, light motion graphics, captions, music, and only a small number of generated cinematic clips.

## Hard constraints

- Optimize for the lowest sustainable cost while maintaining decent viewer-facing quality.
- Do not generate all 10 minutes as AI video. Use Seedance selectively for short attention-grabbing B-roll.
- Prefer local rendering and deterministic templates over cloud video editors.
- Reuse existing provider and encrypted-credential patterns. Never expose API keys to the renderer, logs, generated scripts, or handoff artifacts.
- Research and script generation must retain source URLs and publication dates.
- Publishing must remain approval-gated in the first release.
- Preserve existing user work and avoid unrelated refactors.
- Do not add a subscription, service, or dependency unless the MVP requires it.

## Recommended architecture

### Command center / renderer

Add a `Video Factory` area to the existing command center. It should expose:

1. `Create today's video` input/action.
2. Queue of video jobs and their current stage.
3. Topic brief and source list.
4. Script editor with citation markers.
5. Scene/storyboard list with a per-scene generation toggle.
6. Cost estimate before paid generation.
7. Voice preview and draft video preview.
8. Actions: regenerate scene, revise script, render draft, approve, schedule/publish.
9. Monthly usage/cost summary.

The renderer should only call narrow preload methods. It must not access provider credentials, the filesystem, raw API responses, or arbitrary shell commands.

### Electron main process / worker

Implement the pipeline in the main process or a small local worker launched by the main process:

`topic -> research -> script -> fact check -> asset plan -> voice -> selected B-roll -> local render -> review -> publish`

Keep long-running work resumable. Each stage should write a small status record and artifact path so an interrupted job can continue instead of paying for completed generations again.

Suggested narrow IPC surface:

- `video-factory:list`
- `video-factory:create`
- `video-factory:get`
- `video-factory:research`
- `video-factory:generate-script`
- `video-factory:estimate-cost`
- `video-factory:generate-voice`
- `video-factory:generate-scene`
- `video-factory:render`
- `video-factory:approve`
- `video-factory:publish` (disabled until explicit approval)
- `video-factory:cancel`

Use the existing encrypted credential flow for OpenRouter and any future video provider. Do not put provider keys in `.env` examples, renderer state, or generated output.

## Cheapest acceptable production model

For a nominal 8–10 minute video:

- 1,000–1,400-word script generated and then reviewed.
- OpenRouter text model for research synthesis and script drafting.
- Existing OpenRouter voice pipeline for narration, or the cheapest reliable TTS model available through the configured provider.
- 20–40 still/reference assets from public-domain, licensed, user-provided, or source-page material.
- 3–8 Seedance clips, generally 5–10 seconds each, only where motion materially improves the story.
- Local FFmpeg/Remotion-style assembly for voice, stills, clips, captions, music, transitions, and branding.
- One thumbnail generated from the same approved visual package.

Indicative external generation budget, subject to provider changes:

- Narration, script, and transcription: usually cents to low dollars per video.
- Seedance Fast at the currently listed 720p rate of about `$0.2419/second`: approximately `$3.60–$19.35` for 15–80 seconds of accepted B-roll per video.
- 30 videos/month: approximately `$110–$580` for Seedance alone if every generated clip is paid for once. Cache accepted clips and cap retries to stay near the low end.
- Target operating budget for the first version: `$150–$300/month`, excluding the user's time and any paid source/licensing costs.

The cost controller must show an estimate and require confirmation when a job exceeds the configured per-video cap. Initial default cap: `$10` for generation and `$15` total provider usage per video. The user can raise it per job.

Reference pricing: [fal.ai Seedance 2.0 pricing](https://fal.ai/models/bytedance/seedance-2.0/text-to-video). Treat this as an indicative provider rate, not a hard-coded contract. Query current provider pricing when practical.

## Data model

Prefer a small local SQLite-backed model consistent with the existing application:

### `video_jobs`

- `id`
- `title`
- `topic`
- `status`
- `currentStage`
- `createdAt`
- `updatedAt`
- `scheduledFor`
- `approvedAt`
- `publishedUrl`
- `estimatedCostCents`
- `actualCostCents`
- `outputDirectory`
- `errorMessage`

### `video_sources`

- `id`
- `jobId`
- `url`
- `title`
- `publisher`
- `publishedAt`
- `retrievedAt`
- `notes`
- `usedInScript`

### `video_scenes`

- `id`
- `jobId`
- `sequence`
- `narrationText`
- `visualDirection`
- `assetType` (`image`, `source-footage`, `seedance`, `chart`, `title-card`)
- `generationEnabled`
- `status`
- `assetPath`
- `providerCostCents`
- `retryCount`

Do not store raw microphone/audio request payloads in general API audit logs. Store only artifact paths, durations, provider/model identifiers, and cost metadata.

## Quality and safety gates

Before rendering:

- Every factual claim must map to at least one saved source.
- The script must clearly separate facts, estimates, and commentary.
- The system must flag uncertain dates, prices, rankings, and claims involving living people or companies.
- Generated visuals must not be presented as authentic news footage.
- User must be able to inspect and edit the script and source list.

Before publishing:

- Video has playable audio and no missing scene assets.
- Captions fit within safe margins and are readable.
- No unresolved fact-check warnings remain.
- Total cost is visible.
- Explicit approval has been recorded.

## Phased implementation plan

### Phase 1 — Local draft pipeline

- Add the Video Factory screen/card to the command center.
- Create and persist a video job with topic, status, stages, and artifacts.
- Add a mock/deterministic storyboard and local render path.
- Render a draft from supplied images, narration, and a branded template.
- Add cost estimate and approval state.

Success condition: a user can create a job, inspect its storyboard, render a local draft, and approve it without any paid provider call.

### Phase 2 — Research and script

- Add source collection through the existing network/main-process boundary.
- Generate a cited script through the existing OpenRouter integration.
- Add editable script and source review.
- Add retry/resume behavior and artifact caching.

Success condition: one topic produces a source-backed script with no secrets in renderer state or artifacts.

### Phase 3 — Voice and selective Seedance

- Add TTS generation with cached output.
- Add per-scene Seedance enablement.
- Add preflight cost estimate and hard cap.
- Limit retries and require confirmation before exceeding the cap.

Success condition: one approved 8–10 minute draft uses mostly low-cost/local assets and a small number of paid generated clips.

### Phase 4 — Daily automation and optional publishing

- Add a daily schedule and topic queue.
- Let the worker prepare drafts unattended.
- Send a command-center notification when review is ready.
- Add YouTube upload/scheduling only after explicit approval and a separate credential review.

Success condition: a month-long run can prepare one reviewable draft per day without silently publishing or silently exceeding budget.

## What not to build initially

- Full text-to-video generation for every second.
- Real-time avatar presenter.
- Automatic publishing without review.
- Multi-platform distribution.
- Custom training or fine-tuning.
- A new cloud backend.
- A large media library or complex asset marketplace.

## Acceptance criteria for MVP

- A Video Factory entry point is available in the command center.
- User can create a daily video job from one command/topic.
- Job state survives app restart.
- Sources, script, storyboard, estimated cost, and generated artifacts are inspectable.
- Paid generation is opt-in and budget-capped.
- Local draft rendering works with a repeatable template.
- Regenerating one scene does not regenerate the entire video.
- Approval is required before any publishing action.
- `npm run build` passes, `git diff --check` passes, and the requested UI states are exercised in the running app.

## Next implementation step

Start with Phase 1 in the Hermes checkout. Locate the existing command-center navigation/state pattern, add the smallest Video Factory card/view, and implement a local draft job with fake assets before connecting research, TTS, or Seedance. This gives the user a visible end-to-end control surface without spending money during development.
