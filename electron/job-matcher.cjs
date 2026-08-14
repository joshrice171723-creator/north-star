const MAX_FINAL_CANDIDATES = 80;
const MAX_SELECTED = 20;
const MIN_DISPLAYED = 5;
const RANKING_CALL_TIMEOUT_MS = 50_000;
const MAX_RANKING_PROMPT_CHARS = 120_000;
const MAX_PROFILE_LIST_ITEMS = 12;
const MAX_PROFILE_VALUE_CHARS = 160;
const MAX_RESUME_CHARS = 3_500;
const PROVIDERS = ['usajobs', 'adzuna', 'remotive', 'arbeitnow'];

const text = (value, max) => String(value ?? '').trim().slice(0, max);
const list = (value, maxItems = MAX_PROFILE_LIST_ITEMS, maxChars = MAX_PROFILE_VALUE_CHARS) => (Array.isArray(value) ? value : []).map((entry) => text(entry, maxChars)).filter(Boolean).slice(0, maxItems);
function profileForRanking(profile = {}) { return { targetRoles: list(profile.targetRoles), targetLocations: list(profile.targetLocations), targetIndustries: list(profile.targetIndustries), interests: list(profile.interests), mustHaveSkills: list(profile.mustHaveSkills || profile.skills), niceToHaveSkills: list(profile.niceToHaveSkills), excludedKeywords: list(profile.excludedKeywords), remotePreference: text(profile.remotePreference, 40), radiusMiles: Number.isFinite(Number(profile.radiusMiles)) ? Number(profile.radiusMiles) : null, seniority: list(profile.seniority), workAuthorization: text(profile.workAuthorization, MAX_PROFILE_VALUE_CHARS), securityClearance: text(profile.securityClearance || profile.clearance, MAX_PROFILE_VALUE_CHARS) }; }
function resumeForRanking(resume = {}) { return { rawText: text(resume.rawText, MAX_RESUME_CHARS), professionalSummary: text(resume.professionalSummary, 800), skills: list(resume.skills, 20), certifications: list(resume.certifications, 12) }; }
// Allowlist only candidate fields needed for comparison. Provider payloads,
// credentials, request diagnostics, and raw API responses never enter this prompt.
function jobForRanking(job = {}) { return { externalId: text(job.externalId, 200), providerKey: text(job.providerKey, 40), title: text(job.title, 240), company: text(job.company || job.agency, 180), location: text(job.location, 180), remoteType: text(job.remoteType, 40), description: text(job.description, 900), duties: text(job.duties, 600), qualifications: text(job.qualifications, 600), requirements: Array.isArray(job.requirements) ? job.requirements.map((entry) => text(entry, 180)).filter(Boolean).slice(0, 6) : [], clearanceRequired: text(job.clearanceRequired || job.securityClearance, 120), deterministicScore: Number.isFinite(Number(job.retrievalScore)) ? Number(job.retrievalScore) : null }; }
function assertPromptSize(messages) { const characters = messages.reduce((total, message) => total + String(message.content || '').length, 0); if (characters > MAX_RANKING_PROMPT_CHARS) { const error = new Error(`Final selection prompt exceeded the ${MAX_RANKING_PROMPT_CHARS.toLocaleString()} character safety limit.`); error.code = 'selection_prompt_too_large'; throw error; } return messages; }
function selectionMessages(profile, resume, jobs) {
  const target = jobs.length >= MAX_SELECTED ? `Select exactly ${MAX_SELECTED} jobs.` : jobs.length >= MIN_DISPLAYED ? `Select at least ${MIN_DISPLAYED} and up to ${jobs.length} suitable jobs.` : `Select every suitable job, up to ${jobs.length}.`;
  const availableProviders = PROVIDERS.filter((provider) => jobs.some((job) => job.providerKey === provider));
  const diversity = availableProviders.length > 1 ? `Prefer a balanced set across the available providers. Include at least 3 jobs from each provider that has 3 or more credible candidates when possible; never select a poor match just to satisfy a quota.` : '';
  return assertPromptSize([{ role: 'system', content: `You are the final job-search evaluator. Return JSON only in exactly this shape: {"selections":[{"externalId":"provider-id","fitScore":0,"fitTier":"strong match|good match|possible match","strengths":["evidence"],"gaps":["evidence or limitation"],"unknowns":["missing information"],"reasoning":"brief evidence-based comparison"}]}. ${target} ${diversity} Select only supplied externalIds, never invent or repeat IDs. Score each selected job from 0 to 100 based on the candidate's title, duties, qualifications, skills, location, seniority, work authorization, and the supplied profile/resume. The score is fit to this candidate, not probability of being hired. Do not use provider reputation or deterministic scores as a substitute for reading the listing. Return one scored selection object for every selected ID.` }, { role: 'user', content: JSON.stringify({ profile: profileForRanking(profile), resume: resumeForRanking(resume), candidates: jobs.map(jobForRanking) }) }]);
}
function selectionIds(content, candidates) {
  let parsed; try { parsed = JSON.parse(String(content || '')); } catch { const error = new Error('Final AI selection returned malformed JSON.'); error.code = 'selection_invalid_json'; throw error; }
  const ids = Array.isArray(parsed?.selections) ? parsed.selections.map((entry) => entry?.externalId) : parsed?.selectedExternalIds;
  if (!Array.isArray(ids)) { const error = new Error('Final AI selection did not include selectedExternalIds.'); error.code = 'selection_invalid_shape'; throw error; }
  if (ids.length > MAX_SELECTED) { const error = new Error('Final AI selection returned more than 20 jobs.'); error.code = 'selection_over_limit'; throw error; }
  const valid = new Set(candidates.map((job) => String(job.externalId)));
  const normalized = ids.map((id) => String(id));
  if (new Set(normalized).size !== normalized.length) { const error = new Error('Final AI selection included duplicate IDs.'); error.code = 'selection_duplicate_ids'; throw error; }
  if (normalized.some((id) => !valid.has(id))) { const error = new Error('Final AI selection included an ID not submitted for selection.'); error.code = 'selection_invented_id'; throw error; }
  return normalized;
}
function selectionDetails(content, candidates) {
  let parsed; try { parsed = JSON.parse(String(content || '')); } catch { return new Map(); }
  const entries = Array.isArray(parsed?.selections) ? parsed.selections : [];
  const valid = new Set(candidates.map((job) => String(job.externalId)));
  return new Map(entries.filter((entry) => valid.has(String(entry?.externalId))).map((entry) => {
    const score = Number(entry.fitScore);
    return [String(entry.externalId), {
      fitScore: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null,
      fitTier: text(entry.fitTier, 60) || 'AI-evaluated match',
      strengths: list(entry.strengths, 5, 220), gaps: list(entry.gaps, 5, 220), unknowns: list(entry.unknowns, 5, 220),
      reasoning: text(entry.reasoning, 700) || 'Selected by the final AI comparison from the supplied listing evidence.',
    }];
  }));
}
function repairMessages(content, candidates) {
  return assertPromptSize([{ role: 'system', content: 'Repair the supplied final job-selection response. Return JSON only with {"selections":[...]}. Keep only valid, unique supplied externalIds. Every selection requires externalId, fitScore (0-100), fitTier, strengths, gaps, unknowns, and reasoning. Do not add commentary.' }, { role: 'user', content: JSON.stringify({ invalidResponse: text(content, 12000), candidateIds: candidates.map((job) => String(job.externalId)) }) }]);
}
function providerCounts(candidates, selected = [], aiSelected = selected) { return Object.fromEntries(PROVIDERS.map((provider) => [provider, { submitted: candidates.filter((job) => job.providerKey === provider).length, assessed: candidates.filter((job) => job.providerKey === provider).length, returned: selected.filter((entry) => entry.job?.providerKey === provider).length, aiReturned: aiSelected.filter((entry) => entry.job?.providerKey === provider).length }])); }
function settleWithin(promise, timeoutMs) { let timer; const timeout = new Promise((_, reject) => { timer = setTimeout(() => { const error = new Error('Final AI selection did not settle before the local timeout. Deterministic candidates will be shown instead.'); error.code = 'selection_timeout'; reject(error); }, timeoutMs); }); return Promise.race([Promise.resolve().then(() => promise), timeout]).finally(() => clearTimeout(timer)); }
async function rankJobs({ jobs, profile, resume, openRouter, onBatch, rankingCallTimeoutMs = RANKING_CALL_TIMEOUT_MS }) {
  const candidates = (Array.isArray(jobs) ? jobs : []).slice(0, MAX_FINAL_CANDIDATES);
  if (!candidates.length) return [];
  if (typeof openRouter !== 'function') throw new Error('Final AI job selection is unavailable.');
  const started = Date.now(); const messages = selectionMessages(profile, resume, candidates); const diagnostics = { submittedCount: candidates.length, candidateCount: candidates.length, batchCount: 0, totalCalls: 1, assessedCount: 0, returnedCount: 0, selectionCallCount: 1, repairAttempted: false, providerCounts: providerCounts(candidates, [], []), promptCharacters: messages.reduce((sum, message) => sum + String(message.content || '').length, 0), maxTokens: Math.max(1600, Math.min(4800, candidates.length * 180)), durationMs: 0 };
  await onBatch?.({ ...diagnostics, batchNumber: 1, callNumber: 1, status: 'started' });
  try {
    let response = await settleWithin(openRouter(messages, { max_tokens: diagnostics.maxTokens, response_format: { type: 'json_object' } }), rankingCallTimeoutMs);
    if (!response?.ok) { const error = new Error(response?.error || 'Final AI selection request failed.'); error.code = 'selection_request_failed'; throw error; }
    let content = response.message?.content; let ids;
    try { ids = selectionIds(content, candidates); }
    catch (initialError) {
      // A single compact repair is safe for truncation and malformed JSON. A
      // transport failure is not retried here because it is not repairable.
      if (!['selection_invalid_json', 'selection_invalid_shape', 'selection_duplicate_ids', 'selection_invented_id', 'selection_over_limit'].includes(initialError.code)) throw initialError;
      diagnostics.repairAttempted = true; diagnostics.totalCalls = 2; diagnostics.selectionCallCount = 2;
      await onBatch?.({ ...diagnostics, batchNumber: 2, callNumber: 2, status: 'started' });
      response = await settleWithin(openRouter(repairMessages(content, candidates), { max_tokens: diagnostics.maxTokens, response_format: { type: 'json_object' } }), rankingCallTimeoutMs);
      if (!response?.ok) { const error = new Error(response?.error || 'Final AI selection repair request failed.'); error.code = 'selection_repair_failed'; throw error; }
      content = response.message?.content; ids = selectionIds(content, candidates);
    }
    const details = selectionDetails(content, candidates);
    const byId = new Map(candidates.map((job) => [String(job.externalId), job]));
    const selected = ids.map((id) => { const job = byId.get(id); const assessment = details.get(id) || {}; return { job, externalId: id, ...assessment, fitScore: assessment.fitScore ?? (Number.isFinite(Number(job.retrievalScore)) ? Math.round(Number(job.retrievalScore)) : null), scoreType: 'ai-selection', fitTier: assessment.fitTier || 'AI-evaluated match', strengths: assessment.strengths || [], gaps: assessment.gaps || [], unknowns: assessment.unknowns || [], reasoning: assessment.reasoning || 'Selected by the final AI comparison from the supplied listing evidence.' }; });
    const aiSelectedCount = selected.length;
    const selectedIds = new Set(ids);
    // When multiple providers have credible candidates, prevent a single large
    // source from consuming the whole visible result set.
    const availableProviders = PROVIDERS.filter((provider) => candidates.some((job) => job.providerKey === provider));
    const providerCap = availableProviders.length > 1 ? 8 : MAX_SELECTED;
    if (availableProviders.length > 1) {
      const counts = new Map();
      const balanced = selected.filter((entry) => { const provider = entry.job?.providerKey; const count = counts.get(provider) || 0; if (count >= providerCap) return false; counts.set(provider, count + 1); return true; });
      selected.length = 0; selected.push(...balanced); selectedIds.clear(); balanced.forEach((entry) => selectedIds.add(String(entry.externalId)));
    }
    // The model is asked for diversity, but enforce it locally so one source
    // cannot consume the entire result set when other providers have credible
    // candidates. These additions remain visibly labeled as deterministic.
    const minimumPerProvider = 3;
    for (const provider of PROVIDERS) {
      const available = candidates.filter((job) => job.providerKey === provider && !selectedIds.has(String(job.externalId)));
      const current = selected.filter((entry) => entry.job?.providerKey === provider).length;
      const needed = Math.max(0, Math.min(minimumPerProvider, candidates.filter((job) => job.providerKey === provider).length) - current);
      for (const job of available.slice(0, needed)) { selected.push({ job, externalId: String(job.externalId), fitScore: Number.isFinite(Number(job.retrievalScore)) ? Math.round(Number(job.retrievalScore)) : null, scoreType: 'deterministic-backfill', fitTier: 'Provider diversity backfill', strengths: [], gaps: ['The final AI returned too few selections from this provider.'], unknowns: [], reasoning: 'Added to keep the result set representative across available job sources.' }); selectedIds.add(String(job.externalId)); }
    }
    if (candidates.length >= MAX_SELECTED && selected.length < MAX_SELECTED) {
      for (const job of candidates) {
        if (selected.length >= MAX_SELECTED) break;
        if (availableProviders.length > 1 && (selected.filter((entry) => entry.job?.providerKey === job.providerKey).length >= providerCap)) continue;
        if (!selectedIds.has(String(job.externalId))) selected.push({ job, externalId: String(job.externalId), fitScore: Number.isFinite(Number(job.retrievalScore)) ? Math.round(Number(job.retrievalScore)) : null, scoreType: 'deterministic-backfill', fitTier: 'Deterministic backfill', strengths: [], gaps: ['The final AI returned fewer than 20 selections.'], unknowns: [], reasoning: 'Added from the remaining deterministic candidates to meet the requested 20-result target.' });
      }
    }
    if (candidates.length >= MIN_DISPLAYED && selected.length < MIN_DISPLAYED) {
      for (const job of candidates) {
        if (selected.length >= MIN_DISPLAYED) break;
        if (availableProviders.length > 1 && (selected.filter((entry) => entry.job?.providerKey === job.providerKey).length >= providerCap)) continue;
        if (!selectedIds.has(String(job.externalId))) selected.push({ job, externalId: String(job.externalId), fitScore: Number.isFinite(Number(job.retrievalScore)) ? Math.round(Number(job.retrievalScore)) : null, scoreType: 'deterministic-backfill', fitTier: 'Deterministic minimum-fit backfill', strengths: [], gaps: ['The final AI selected fewer than five jobs; this qualified candidate was added to meet the minimum display target.'], unknowns: [], reasoning: 'Added from the remaining qualified candidates after the final AI returned fewer than five selections.' });
      }
    }
    diagnostics.assessedCount = candidates.length; diagnostics.returnedCount = aiSelectedCount; diagnostics.finalSelectedCount = selected.length; diagnostics.displayedCount = selected.length; diagnostics.underSelected = candidates.length >= MAX_SELECTED && aiSelectedCount < MAX_SELECTED; diagnostics.durationMs = Date.now() - started; diagnostics.providerCounts = providerCounts(candidates, selected, selected.slice(0, aiSelectedCount));
    await onBatch?.({ ...diagnostics, batchNumber: diagnostics.repairAttempted ? 2 : 1, callNumber: diagnostics.repairAttempted ? 2 : 1, status: 'success', finishedAt: new Date().toISOString() });
    Object.defineProperty(selected, 'rankingDiagnostics', { value: diagnostics, enumerable: false });
    return selected;
  } catch (cause) {
    diagnostics.durationMs = Date.now() - started;
    cause.rankingDiagnostics = diagnostics;
    await onBatch?.({ ...diagnostics, batchNumber: 1, callNumber: 1, status: 'failed', errorCode: cause.code || 'selection_failed', errorMessage: cause.message, finishedAt: new Date().toISOString() });
    throw cause;
  }
}
module.exports = { rankJobs, RANKING_CALL_TIMEOUT_MS, MAX_FINAL_CANDIDATES, MAX_SELECTED, MIN_DISPLAYED, jobForRanking, profileForRanking, resumeForRanking, selectionMessages, selectionIds, repairMessages, MAX_RANKING_PROMPT_CHARS };
