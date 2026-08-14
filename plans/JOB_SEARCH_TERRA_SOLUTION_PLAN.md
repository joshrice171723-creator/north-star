# Current Job Search Rules

This document describes the current implementation. It supersedes older planning language that required 20 final results or a 20-per-provider cap.

## Product contract

```text
AI search plan
    -> four provider pipelines
    -> up to five requests per provider
    -> deduplicate listings
    -> calculate deterministic relevance score
    -> send score-qualified listings to final AI
    -> final AI returns up to 80 jobs with fitScore >= 70
```

The final AI has no 20-result ceiling and no minimum result count. It may return fewer than 80 when fewer listings meet the 70-point AI fit requirement.

## Providers and request budget

The providers are USAJOBS, Adzuna, Remotive, and Arbeitnow. Every provider has the same maximum request budget of five. Remotive is no longer limited to one request. A provider can stop before five requests when it reports exhaustion, reaches the quality target, or cannot produce another valid query.

If a provider query returns no results or no listings reach the deterministic threshold, the application sends aggregate failure context to the query-refinement AI. The refinement must diagnose the failure and return a materially different query. If it returns an empty or duplicate query, the application performs one explicit diagnostic retry before ending that provider's search.

For USAJOBS, a failed Keyword lane should be followed by a different position-title lane or materially different title wording. The refinement prompt must not repeat the failed Keyword query.

## Eligibility gate before final AI

The deterministic relevance score is the only qualification gate before the final AI. Location, title presence, exclusions, and provider-specific matching are not separate rejection gates.

The current minimum deterministic score is 40. Listings below 40 are recorded with `deterministic_score_below_minimum` and are not sent to the final AI. The score itself may include title, skill, location, seniority, and exclusion signals; the decision is made only by comparing the final score to 40.

The score is capped at 100 and currently includes:

- title or job-family relevance: up to 39;
- must-have and nice-to-have skill overlap: up to 22;
- location relevance: up to 17;
- seniority relevance: up to 11.

## Final AI evaluator

The final AI receives no more than 80 candidates. It evaluates the supplied profile, resume, title, duties, qualifications, requirements, location, remote type, work authorization, clearance, and listing evidence.

The final AI must:

- select only supplied job IDs;
- never duplicate or invent IDs;
- score each selected job from 0 to 100;
- select only jobs with `fitScore >= 70`;
- provide fit tier, strengths, gaps, unknowns, and evidence-based reasoning;
- treat fit as compatibility with this candidate, not hiring probability;
- use deterministic scores as supporting context, not as a substitute for reading the listing.

Selections below 70 are removed from the displayed AI results. If the AI response is malformed or invalid, deterministic candidates are shown as fallback results and are labeled accordingly.

## Accounting

The search report distinguishes:

- raw provider records;
- unique listings;
- listings below the deterministic score minimum;
- deterministic candidates sent to AI;
- AI-assessed candidates;
- AI-selected candidates;
- displayed results;
- provider failures, shortfalls, and diagnostic attempts.

There is no requirement that every provider contribute results, and there is no requirement to fill the 80-result capacity with weak matches.
