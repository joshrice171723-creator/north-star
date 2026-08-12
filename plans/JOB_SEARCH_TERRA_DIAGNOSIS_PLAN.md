# Job Search Terra - Diagnosis Plan

## Purpose

Diagnose why the reported run does not match the intended result. This phase is investigation only; create a separate solution plan after the evidence is complete.

## Observed evidence

- USAJOBS attempted one `Forward Deployed Engineer` query for Dallas and failed with a network error.
- Adzuna returned 50 jobs, including FDE-labelled examples.
- Remotive and Arbeitnow returned broad or apparently unrelated examples, including wrong geography.
- The report says 120 unique and 60 sent to AI, while provider rows still use legacy ranking labels.
- Final AI returned five Adzuna jobs and none from the other providers.
- The final prompt was 102,840 characters.

## Diagnosis stages

1. **Define the expected contract.** Record whether the search is federal-only or multi-provider, Dallas-only or remote-inclusive, exact FDE-only or adjacent roles, and whether public-feed jobs must be rejected before selection.
2. **Trace one sanitized run.** Capture normalized planner lanes, request start/finish events, provider envelopes, raw/unique/filtered/eligible counts, deterministic IDs, final candidate IDs, final selected IDs, and renderer fields. Never log credentials or raw secret-bearing payloads.
3. **Diagnose USAJOBS.** Mock success-empty, network failure, timeout, malformed response, and unauthorized cases. Verify recovery behavior, broad federal titles, keyword lanes, location fallbacks, persisted recovery attempts, and visible final status.
4. **Diagnose Remotive and Arbeitnow relevance.** Use fixtures containing exact matches, adjacent roles, unrelated roles, wrong geography, remote roles, exclusions, and duplicate IDs. Determine whether provider search is authoritative or only a feed hint, then record application-side rejection reasons.
5. **Verify deterministic accounting.** Assert dedupe-before-selection, no more than 20 eligible jobs per provider, preservation of fewer-than-20 providers, hard-filter counts, provider identity, and exact equality between top-per-provider IDs and final-AI input IDs.
6. **Verify final selection.** Test valid mixed-provider output, all-one-provider output, fewer-than-20, empty, invented, duplicate, malformed, over-limit, timeout, and request-failure cases. Inspect prompt bounds, required profile/resume context, and absence of credentials or provider catalogs.
7. **Verify report semantics.** Ensure the UI separately shows retrieved, unique, hard-filtered, eligible, deterministic top sent, final selected, status, error/empty/skipped reason, recovery attempts, and fallback status. Remove ambiguity from legacy `AI returned`, `assessed`, and `shown` labels.
8. **Record decisions.** Create an evidence table for transport, recovery, provider filtering, deterministic accounting, final selector, and renderer. Classify each as confirmed defect, expected-but-poor UX, ambiguous product decision, or not reproduced.

## Deliverables

- Sanitized fixture for the reported profile/run.
- Focused diagnosis tests and one end-to-end accounting trace.
- Evidence table with confidence and unresolved questions.
- A new solution plan derived only from confirmed defects.

## Stop condition

Do not implement fixes until the expected scope and relevance policy are explicit and the evidence table is complete.
