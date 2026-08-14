const MAX_FINAL_CANDIDATES = 80;
// A single response containing detailed evidence for dozens of jobs is prone
// to hit a model's output limit and end in truncated JSON. Keep the final
// comparison bounded to a size that can always return complete assessments.
const MAX_ASSESSMENT_BATCH_SIZE = 15;
const OUTPUT_TOKENS_PER_ASSESSMENT = 300;
// There is no product-level 20-result ceiling. Keep the bounded candidate
// prompt limit as a safety guard for latency and model context size.
const MAX_SELECTED = MAX_FINAL_CANDIDATES;
const MIN_AI_FIT_SCORE = 70;
const RANKING_CALL_TIMEOUT_MS = 50_000;
const MAX_RANKING_PROMPT_CHARS = 120_000;
const MAX_PROFILE_LIST_ITEMS = 12;
const MAX_PROFILE_VALUE_CHARS = 160;
const MAX_RESUME_CHARS = 3_500;
const PROVIDERS = ['usajobs', 'adzuna', 'remotive', 'arbeitnow', 'dice'];

const text = (value, max) => String(value ?? '').trim().slice(0, max);
const list = (value, maxItems = MAX_PROFILE_LIST_ITEMS, maxChars = MAX_PROFILE_VALUE_CHARS) => (Array.isArray(value) ? value : []).map((entry) => text(entry, maxChars)).filter(Boolean).slice(0, maxItems);
function profileForRanking(profile = {}) { return { targetRoles: list(profile.targetRoles), targetLocations: list(profile.targetLocations), targetIndustries: list(profile.targetIndustries), interests: list(profile.interests), mustHaveSkills: list(profile.mustHaveSkills || profile.skills), niceToHaveSkills: list(profile.niceToHaveSkills), excludedKeywords: list(profile.excludedKeywords), remotePreference: text(profile.remotePreference, 40), radiusMiles: Number.isFinite(Number(profile.radiusMiles)) ? Number(profile.radiusMiles) : null, seniority: list(profile.seniority), workAuthorization: text(profile.workAuthorization, MAX_PROFILE_VALUE_CHARS), securityClearance: text(profile.securityClearance || profile.clearance, MAX_PROFILE_VALUE_CHARS) }; }
function resumeForRanking(resume = {}) { return { rawText: text(resume.rawText, MAX_RESUME_CHARS), professionalSummary: text(resume.professionalSummary, 800), skills: list(resume.skills, 20), certifications: list(resume.certifications, 12) }; }
// Allowlist only candidate fields needed for comparison. Provider payloads,
// credentials, request diagnostics, and raw API responses never enter this prompt.
function jobForRanking(job = {}) { return { externalId: text(job.externalId, 200), providerKey: text(job.providerKey, 40), title: text(job.title, 240), company: text(job.company || job.agency, 180), location: text(job.location, 180), remoteType: text(job.remoteType, 40), description: text(job.description, 900), duties: text(job.duties, 600), qualifications: text(job.qualifications, 600), requirements: Array.isArray(job.requirements) ? job.requirements.map((entry) => text(entry, 180)).filter(Boolean).slice(0, 6) : [], clearanceRequired: text(job.clearanceRequired || job.securityClearance, 120), deterministicScore: Number.isFinite(Number(job.retrievalScore)) ? Number(job.retrievalScore) : null }; }
function assertPromptSize(messages) { const characters = messages.reduce((total, message) => total + String(message.content || '').length, 0); if (characters > MAX_RANKING_PROMPT_CHARS) { const error = new Error(`Final selection prompt exceeded the ${MAX_RANKING_PROMPT_CHARS.toLocaleString()} character safety limit.`); error.code = 'selection_prompt_too_large'; throw error; } return messages; }
function selectionMessages(profile, resume, jobs) {
  const target = `Select as many suitable jobs as you can justify, up to ${Math.min(MAX_SELECTED, jobs.length)}. Return fewer when the remaining listings are not high-quality fits.`;
  const availableProviders = PROVIDERS.filter((provider) => jobs.some((job) => job.providerKey === provider));
  const remotePreference = `Remote listings are always eligible when they are otherwise a fit. Treat remote work as a positive preference and give a remote listing a modest priority advantage over an otherwise comparable onsite listing; do not reject a stronger onsite fit solely because it is onsite.`;
  const diversity = availableProviders.length > 1 ? `Prefer a balanced set across the available providers. Include at least 3 jobs from each provider that has 3 or more credible candidates when possible; never select a poor match just to satisfy a quota.` : '';
  return assertPromptSize([{ role: 'system', content: `You are the final job-search evaluator. Return JSON only in exactly this shape: {"selections":[{"externalId":"provider-id","requirementsMatchScore":0,"candidateMatchScore":0,"fitTier":"strong match|good match|possible match","strengths":["evidence"],"gaps":["evidence or limitation"],"unknowns":["missing information"],"reasoning":"brief evidence-based comparison"}]}. ${target} ${diversity} ${remotePreference} Select only supplied externalIds, never invent or repeat IDs. Return two independent 0-to-100 scores: requirementsMatchScore measures how well this job matches the candidate's stated preferences and requirements (role, location, industry, salary, remote preference, authorization, and exclusions); candidateMatchScore measures how well the candidate's resume and experience match the job's duties, qualifications, skills, seniority, and clearance requirements. Do not combine the scores. Select only jobs where both scores are at least ${MIN_AI_FIT_SCORE}; omit weaker jobs. Do not use provider reputation or deterministic scores as a substitute for reading the listing. Return one scored selection object for every selected ID. Keep every evidence item under 120 characters, use at most two strengths and two gaps, one unknown, and a 240-character reasoning. Finish the complete JSON object; never add markdown or commentary.` }, { role: 'user', content: JSON.stringify({ profile: profileForRanking(profile), resume: resumeForRanking(resume), candidates: jobs.map(jobForRanking) }) }]);
}
function selectionIds(content, candidates) {
  let parsed; try { parsed = JSON.parse(String(content || '')); } catch { const error = new Error('Final AI selection returned malformed JSON.'); error.code = 'selection_invalid_json'; throw error; }
  const ids = Array.isArray(parsed?.selections) ? parsed.selections.map((entry) => entry?.externalId) : parsed?.selectedExternalIds;
  if (!Array.isArray(ids)) { const error = new Error('Final AI selection did not include selectedExternalIds.'); error.code = 'selection_invalid_shape'; throw error; }
  if (ids.length > MAX_SELECTED) { const error = new Error(`Final AI selection returned more than ${MAX_SELECTED} jobs.`); error.code = 'selection_over_limit'; throw error; }
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
    const requirementsMatchScore = Number(entry.requirementsMatchScore ?? entry.fitScore);
    const candidateMatchScore = Number(entry.candidateMatchScore ?? entry.fitScore);
    return [String(entry.externalId), {
      requirementsMatchScore: Number.isFinite(requirementsMatchScore) ? Math.max(0, Math.min(100, Math.round(requirementsMatchScore))) : null,
      candidateMatchScore: Number.isFinite(candidateMatchScore) ? Math.max(0, Math.min(100, Math.round(candidateMatchScore))) : null,
      fitTier: text(entry.fitTier, 60) || 'AI-evaluated match',
      strengths: list(entry.strengths, 5, 220), gaps: list(entry.gaps, 5, 220), unknowns: list(entry.unknowns, 5, 220),
      reasoning: text(entry.reasoning, 700) || 'Selected by the final AI comparison from the supplied listing evidence.',
    }];
  }));
}
function assertSelectionAssessments(content, ids) {
  if (!ids.length) return;
  let parsed; try { parsed = JSON.parse(String(content || '')); } catch { return; }
  const entries = Array.isArray(parsed?.selections) ? parsed.selections : [];
  const byId = new Map(entries.map((entry) => [String(entry?.externalId), entry]));
  for (const id of ids) {
    const entry = byId.get(id);
    const requirementsMatchScore = Number(entry?.requirementsMatchScore ?? entry?.fitScore);
    const candidateMatchScore = Number(entry?.candidateMatchScore ?? entry?.fitScore);
    // A list of IDs without score/evidence looks valid at the JSON level, but
    // cannot be safely presented as an AI assessment. Repair it instead of
    // silently converting it into an empty selection and triggering fallback.
    if (!entry || !Number.isFinite(requirementsMatchScore) || !Number.isFinite(candidateMatchScore) || requirementsMatchScore < MIN_AI_FIT_SCORE || requirementsMatchScore > 100 || candidateMatchScore < MIN_AI_FIT_SCORE || candidateMatchScore > 100 || !text(entry.fitTier, 60) || !Array.isArray(entry.strengths) || !Array.isArray(entry.gaps) || !Array.isArray(entry.unknowns) || !text(entry.reasoning, 700)) {
      const error = new Error('Final AI selection omitted a required scored assessment.'); error.code = 'selection_invalid_assessment'; throw error;
    }
  }
}
function repairMessages(content, candidates) {
  return assertPromptSize([{ role: 'system', content: `Repair the supplied final job-selection response. Return JSON only with {"selections":[...]}. Keep only valid, unique supplied externalIds. Every selection requires externalId, requirementsMatchScore (${MIN_AI_FIT_SCORE}-100), candidateMatchScore (${MIN_AI_FIT_SCORE}-100), fitTier, strengths, gaps, unknowns, and reasoning. Keep every evidence item under 120 characters, use at most two strengths and two gaps, one unknown, and a 240-character reasoning. Remove every selection where either score is below the minimum. Finish the complete JSON object and do not add commentary.` }, { role: 'user', content: JSON.stringify({ invalidResponse: text(content, 12000), candidateIds: candidates.map((job) => String(job.externalId)) }) }]);
}
function providerCounts(candidates, assessed = [], selected = []) { return Object.fromEntries(PROVIDERS.map((provider) => [provider, { submitted: candidates.filter((job) => job.providerKey === provider).length, assessed: assessed.filter((job) => job.providerKey === provider).length, returned: selected.filter((entry) => entry.job?.providerKey === provider).length, aiReturned: selected.filter((entry) => entry.job?.providerKey === provider).length }])); }
function settleWithin(promise, timeoutMs) { let timer; const timeout = new Promise((_, reject) => { timer = setTimeout(() => { const error = new Error('Final AI selection did not settle before the local timeout. Deterministic candidates will be shown instead.'); error.code = 'selection_timeout'; reject(error); }, timeoutMs); }); return Promise.race([Promise.resolve().then(() => promise), timeout]).finally(() => clearTimeout(timer)); }
function chunk(items, size) { return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size)); }
function outputTokenBudget(candidateCount) { return Math.max(1800, Math.min(5000, candidateCount * OUTPUT_TOKENS_PER_ASSESSMENT)); }
function assessedSelections(content, candidates) {
  const ids = selectionIds(content, candidates);
  assertSelectionAssessments(content, ids);
  const details = selectionDetails(content, candidates);
  const byId = new Map(candidates.map((job) => [String(job.externalId), job]));
  return ids.map((id) => {
    const job = byId.get(id);
    const assessment = details.get(id) || {};
    return { job, externalId: id, ...assessment, fitScore: assessment.requirementsMatchScore ?? null, scoreType: 'ai-selection', fitTier: assessment.fitTier || 'AI-evaluated match', strengths: assessment.strengths || [], gaps: assessment.gaps || [], unknowns: assessment.unknowns || [], reasoning: assessment.reasoning || 'Selected by the final AI comparison from the supplied listing evidence.' };
  }).filter((entry) => Number(entry.requirementsMatchScore) >= MIN_AI_FIT_SCORE && Number(entry.candidateMatchScore) >= MIN_AI_FIT_SCORE);
}
async function rankJobs({ jobs, profile, resume, openRouter, onBatch, rankingCallTimeoutMs = RANKING_CALL_TIMEOUT_MS }) {
  const candidates = (Array.isArray(jobs) ? jobs : []).slice(0, MAX_FINAL_CANDIDATES);
  if (!candidates.length) return [];
  if (typeof openRouter !== 'function') throw new Error('Final AI job selection is unavailable.');
  const batches = chunk(candidates, MAX_ASSESSMENT_BATCH_SIZE);
  const started = Date.now(); const diagnostics = { submittedCount: candidates.length, candidateCount: candidates.length, batchCount: batches.length, totalCalls: batches.length, assessedCount: 0, returnedCount: 0, selectionCallCount: 0, repairAttempted: false, providerCounts: providerCounts(candidates), promptCharacters: 0, maxTokens: 0, durationMs: 0 };
  const assessed = [];
  const selected = [];
  let activeBatch = null;
  try {
    for (const [index, batch] of batches.entries()) {
      const batchNumber = index + 1;
      const messages = selectionMessages(profile, resume, batch);
      const promptCharacters = messages.reduce((sum, message) => sum + String(message.content || '').length, 0);
      const maxTokens = outputTokenBudget(batch.length);
      activeBatch = { batchNumber, submittedCount: batch.length, promptCharacters, maxTokens };
      diagnostics.promptCharacters += promptCharacters;
      diagnostics.maxTokens = Math.max(diagnostics.maxTokens, maxTokens);
      diagnostics.selectionCallCount += 1;
      await onBatch?.({ ...diagnostics, submittedCount: batch.length, promptCharacters, maxTokens, batchNumber, callNumber: batchNumber, status: 'started' });
      let response = await settleWithin(openRouter(messages, { max_tokens: maxTokens, response_format: { type: 'json_object' } }), rankingCallTimeoutMs);
      if (!response?.ok) { const error = new Error(response?.error || 'Final AI selection request failed.'); error.code = 'selection_request_failed'; throw error; }
      let content = response.message?.content;
      let batchSelected;
      try { batchSelected = assessedSelections(content, batch); }
      catch (initialError) {
        // A single compact repair is safe for malformed or truncated JSON. A
        // transport failure is not retried because it is not repairable here.
        if (!['selection_invalid_json', 'selection_invalid_shape', 'selection_duplicate_ids', 'selection_invented_id', 'selection_over_limit', 'selection_invalid_assessment'].includes(initialError.code)) throw initialError;
        diagnostics.repairAttempted = true;
        diagnostics.selectionCallCount += 1;
        await onBatch?.({ ...diagnostics, submittedCount: batch.length, promptCharacters, maxTokens, batchNumber, callNumber: batchNumber, status: 'started', repairAttempted: true });
        response = await settleWithin(openRouter(repairMessages(content, batch), { max_tokens: maxTokens, response_format: { type: 'json_object' } }), rankingCallTimeoutMs);
        if (!response?.ok) { const error = new Error(response?.error || 'Final AI selection repair request failed.'); error.code = 'selection_repair_failed'; throw error; }
        content = response.message?.content;
        batchSelected = assessedSelections(content, batch);
      }
      assessed.push(...batch);
      selected.push(...batchSelected);
      diagnostics.assessedCount = assessed.length;
      diagnostics.returnedCount = selected.length;
      diagnostics.finalSelectedCount = selected.length;
      diagnostics.displayedCount = selected.length;
      diagnostics.providerCounts = providerCounts(candidates, assessed, selected);
      await onBatch?.({ ...diagnostics, submittedCount: batch.length, promptCharacters, maxTokens, batchNumber, callNumber: batchNumber, status: 'success', responseLength: String(content || '').length, finishedAt: new Date().toISOString() });
    }
    diagnostics.underSelected = false;
    diagnostics.durationMs = Date.now() - started;
    Object.defineProperty(selected, 'rankingDiagnostics', { value: diagnostics, enumerable: false });
    return selected;
  } catch (cause) {
    // An incomplete multi-batch evaluation is not an AI selection. Reporting
    // partial counts as final results would falsely imply every job was judged.
    diagnostics.assessedCount = 0;
    diagnostics.returnedCount = 0;
    diagnostics.finalSelectedCount = 0;
    diagnostics.displayedCount = 0;
    diagnostics.providerCounts = providerCounts(candidates);
    diagnostics.durationMs = Date.now() - started;
    cause.rankingDiagnostics = diagnostics;
    const failedBatch = activeBatch || { batchNumber: 1, submittedCount: 0, promptCharacters: 0, maxTokens: 0 };
    await onBatch?.({ ...diagnostics, ...failedBatch, callNumber: failedBatch.batchNumber, status: 'failed', errorCode: cause.code || 'selection_failed', errorMessage: cause.message, finishedAt: new Date().toISOString() });
    throw cause;
  }
}
module.exports = { rankJobs, RANKING_CALL_TIMEOUT_MS, MAX_FINAL_CANDIDATES, MAX_ASSESSMENT_BATCH_SIZE, MAX_SELECTED, MIN_AI_FIT_SCORE, jobForRanking, profileForRanking, resumeForRanking, selectionMessages, selectionIds, repairMessages, MAX_RANKING_PROMPT_CHARS };
