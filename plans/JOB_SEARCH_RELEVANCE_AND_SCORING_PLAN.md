# Job Search Relevance and Scoring Repair Plan

## Confirmed defects from the attached run

1. The final AI call failed with `selection_invalid_json` after receiving 50 candidates in an 84,257-character prompt but only 1,600 output tokens. The UI therefore showed deterministic fallback results, not AI selections.
2. The fallback score is a coarse heuristic. Adzuna jobs repeatedly receive 56 because the same title/location points receive the same fixed components; unrelated Remotive jobs receive 0 because they have no recognized title/skill signal. These values are being displayed as `/100` fit scores even though they are retrieval heuristics.
3. USAJOBS returned 16 listings and all 16 were filtered before AI (`0 eligible`). The location/relevance rejection path needs a reason-level trace and broader city/state/remote handling before declaring the provider unusable.
4. Remotive returned 20 jobs and sent all 20 in this trace, but the provider query was only `Forward Deployed Engineer (Dallas)`. The adapter does not perform a provider-specific quality gate or adaptive query expansion, so a successful HTTP response is being treated as sufficient evidence of relevance.
5. Arbeitnow returned 98 feed items but only 10 were eligible. The other 88 are collapsed into a generic filtered count; the report does not make clear whether they failed geography, query relevance, exclusions, or remote policy.
6. The final selector diagnostics say provider candidates were “assessed” even though the selector response was malformed and zero jobs were actually assessed. This makes the report overstate AI processing.
7. Fallback cards use `Federal title search` as the source signal for public-provider jobs, and salary formatting exposes decimal values and `unknown` intervals. These are data-quality/UI defects visible in the attached results.

## Product contract to implement

- “Retrieved” means an API/feed response was received.
- “Qualified” means the normalized listing passes hard exclusions, geography/remote policy, and a provider-neutral minimum relevance gate.
- Each provider may run bounded alternative queries until it has 20 unique qualified candidates, the provider is exhausted, or the retry budget is reached.
- Never pad a provider with unrelated listings just to reach 20. Report a truthful shortfall and the reason.
- Only AI-produced fit scores may be labeled as fit scores. Retrieval scores must be labeled `search relevance` and must not be used as a fake fit score.
- A failed or malformed AI response must fall back visibly, with deterministic search-relevance values and no claim that AI assessed the jobs.

## Phase 1 — Build adaptive provider retrieval

1. Add a provider query strategy with ordered variants derived from the profile: exact target title, normalized title aliases, title plus core skill, adjacent job family, and broad technical fallback. Deduplicate requests by normalized query and record the variant used.
2. For Remotive, run bounded query rounds rather than accepting one 20-item response. Validate each returned item locally, continue with the next query variant when fewer than 20 qualified unique jobs exist, and stop on 20, provider exhaustion, or a small fixed request/latency budget.
3. Apply the same adaptive strategy to USAJOBS and Adzuna, respecting each API’s supported parameters and pagination. For USAJOBS, expand FDE and related titles instead of relying on one literal title. For Adzuna, use multiple `what` lanes and pages while preserving the URL-page contract.
4. For Arbeitnow, fetch the feed once per bounded search round, apply explicit local query and geography filters, and record rejection reasons. Do not pretend repeated identical feed fetches are new search coverage.
5. Add `qualifiedCount`, `queryRounds`, `queriesAttempted`, `exhausted`, and `shortfallReason` to provider diagnostics.

## Phase 2 — Repair qualification and location matching

1. Separate hard filters from relevance scoring. Hard filters remain exclusions, explicit work-authorization/clearance constraints, and clear wrong-geography jobs.
2. Normalize city/state/country/remote text into tokens. Match `Dallas`, `Dallas, TX`, `Irving, Dallas`, and state-level listings consistently; treat remote listings according to the profile rather than as local Dallas listings.
3. Add provider-neutral minimum qualification rules: title/family signal, description/skill signal, or explicit job-family alias. A listing with no signal is not sent to AI and is not displayed as a fallback candidate.
4. Preserve all rejection reasons separately: `excluded_keyword`, `wrong_location`, `not_remote_eligible`, `query_mismatch`, `missing_title`, and `duplicate`.
5. Fix source evidence propagation so Remotive, Adzuna, and Arbeitnow cards show their actual query/lane instead of `Federal title search`.

## Phase 3 — Replace the coarse retrieval score

1. Keep retrieval relevance separate from candidate fit. Use a feature vector for title exactness, alias/family match, skill overlap, description evidence, geography, remote preference, seniority, clearance/work authorization, salary, and recency where available.
2. Use graded values rather than fixed all-or-nothing buckets. Include matched terms and missing signals in diagnostics so two jobs cannot receive the same score without the same evidence.
3. Calibrate the retrieval score against fixtures and expose a score breakdown in tests/diagnostics. Do not display it as `/100 fit`.
4. Remove zero-score listings from fallback output. If no qualified fallback exists, show a provider shortfall rather than unrelated jobs.

## Phase 4 — Make AI assessment reliable and meaningful

1. Do not ask one 1,600-token call to emit 20 detailed assessments from a 50-job, 84k-character prompt. Use bounded assessment batches or a compact two-stage flow: assess candidates in provider/batch calls, then select from compact scored summaries.
2. Use a strict JSON schema with compact fields: ID, fit score, tier, two strengths, two gaps, unknowns, and one short rationale. Set output tokens from the number of requested assessments.
3. Validate response size, JSON shape, IDs, duplicates, score range, and required evidence. Retry malformed/truncated output once with a compact repair request; then fall back.
4. Use explicit score anchors (for example: 90–100 exceptional evidence, 75–89 strong, 60–74 plausible, 40–59 weak/partial, below 40 poor) and tell the model that fit is evidence-based compatibility, not hiring probability.
5. Detect suspicious distributions such as every score being identical or all scores being 0/56. Mark them invalid or low-confidence and retry; never silently present them as calibrated fit scores.
6. On a failed AI call, set `assessedCount: 0`, `aiSelectedCount: 0`, and `fallback: true`. Never reuse deterministic retrieval values under an `AI selection` label.

## Phase 5 — Correct reporting and result presentation

Show these distinct fields for every provider:

```text
raw retrieved → unique → qualified → sent to AI → AI selected → displayed fallback
```

Also show query rounds, rejection reasons, shortfall reason, AI status, and whether each card is `AI fit`, `search relevance`, or `fallback / not AI assessed`.

Correct visible data defects:

- provider-specific source signal;
- rounded currency and valid salary interval fallback;
- `remote`/`unknown` semantics that are not confused with local eligibility;
- no “Why it matches” claim when AI did not produce evidence.

## Phase 6 — Regression and live verification

Add fixtures/tests for:

- Remotive requiring 2–4 query rounds to reach 20 qualified unique jobs;
- Remotive exhausted at 12 qualified jobs reporting a truthful shortfall;
- USAJOBS city/state variants and federal-title expansion;
- Arbeitnow rejection breakdown by reason;
- duplicate query suppression and bounded retry limits;
- unrelated listings never entering fallback output;
- retrieval score breakdowns that are not all 56/0;
- malformed/truncated AI JSON repair and accurate zero-assessment accounting;
- valid varied AI scores rendered as AI fit scores;
- source evidence and salary formatting for every provider.

Verification commands:

```text
node --test test/*.test.cjs
node --check electron/job-search.cjs
node --check electron/public-job-providers.cjs
node --check electron/job-matcher.cjs
npm.cmd run build
```

Then run a sanitized live search and verify that each provider either reaches 20 qualified jobs through distinct query rounds or reports why it cannot, and that no card displays a deterministic score as an AI fit score.
