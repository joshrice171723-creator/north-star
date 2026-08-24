'use strict';

const { validateWorkflowResult } = require('./result-contract.cjs');
const { makeIdempotencyKey } = require('./idempotency.cjs');
const { applyTransition } = require('./transition-policy.cjs');
const { classifyWorkflowFailure } = require('../application-reliability.cjs');

function safePlan(plan = {}) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('A workflow plan is required.');
  const actionType = String(plan.actionType || plan.stepType || '').trim().slice(0, 80);
  const targetFingerprint = String(plan.targetFingerprint || plan.pageFingerprint || '').trim().slice(0, 240);
  if (!actionType || !targetFingerprint) throw new Error('A workflow plan needs an action type and target fingerprint.');
  return { ...plan, actionType, targetFingerprint };
}

function resultFromVerification({ applicationId, jobId, plan, verification }) {
  if (verification?.status === 'verified') return validateWorkflowResult({ applicationId, jobId, stepId: plan.stepId || plan.actionType, stepType: plan.stepType || plan.actionType, status: 'verified', outcome: verification.outcome || 'continue', reasonCode: verification.reasonCode || '', confidence: Number.isFinite(Number(verification.confidence)) ? Number(verification.confidence) : Number(plan.confidence || 0), retryable: false, requiresUser: Boolean(verification.requiresUser), pageFingerprint: plan.targetFingerprint, evidenceIds: verification.evidenceIds || [], nextCheckpoint: verification.nextCheckpoint || '', source: plan.source || 'deterministic_policy' });
  const failure = classifyWorkflowFailure(verification || { code: 'verification_inconclusive', message: 'Step verification was inconclusive.' });
  return validateWorkflowResult({ applicationId, jobId, stepId: plan.stepId || plan.actionType, stepType: plan.stepType || plan.actionType, status: verification?.status === 'inconclusive' ? 'inconclusive' : 'failed', outcome: failure.outcome, reasonCode: failure.reasonCode, confidence: 0, retryable: failure.retryable, requiresUser: failure.requiresUser, pageFingerprint: plan.targetFingerprint, source: plan.source || 'deterministic_policy' });
}

function createApplicationOrchestrator({ repository, observePage, planNextStep, executeSafeStep, verifyStepResult, playbookRegistry } = {}) {
  for (const [name, handler] of Object.entries({ observePage, planNextStep, executeSafeStep, verifyStepResult })) if (typeof handler !== 'function') throw new Error(`The orchestrator requires ${name}.`);
  if (!repository || typeof repository.getApplication !== 'function' || typeof repository.getJob !== 'function') throw new Error('The orchestrator requires an application repository.');

  async function runApplicationCheckpoint({ applicationId, browserState, checkpoint = {}, context = {} } = {}) {
    const application = repository.getApplication(applicationId);
    if (!application) throw new Error('Application not found.');
    const job = repository.getJob(application.jobId);
    if (!job) throw new Error('Application job not found.');
    const observation = await observePage({ applicationId, browserState, expectedStep: checkpoint.stepKey || '', site: context.site || '', atsKey: context.atsKey || application.atsKey || '' });
    if (observation?.result) return applyTransition(observation.result, { application, job, repository });
    const playbook = playbookRegistry?.match?.({ siteHost: observation.site || context.site || '', atsKey: observation.atsKey || context.atsKey || application.atsKey || '', pageFingerprint: observation.pageFingerprint, stepKey: checkpoint.stepKey || '' });
    const plan = safePlan(await planNextStep({ observation, playbook, currentCheckpoint: checkpoint, profile: context.profile || {}, job, mode: playbook ? 'playbook' : (context.mode || 'deterministic') }));
    const idempotencyKey = makeIdempotencyKey({ applicationId, checkpointVersion: Number.isInteger(checkpoint.version) ? checkpoint.version : 0, actionType: plan.actionType, targetFingerprint: plan.targetFingerprint });
    const prior = typeof repository.findCompletedStep === 'function' ? repository.findCompletedStep(idempotencyKey) : null;
    if (prior) return { status: 'replayed', idempotencyKey, prior };
    const execution = await executeSafeStep({ ...plan, idempotencyKey }, { applicationId, browserState });
    const verification = await verifyStepResult({ plan, execution, browserState, applicationId });
    const result = resultFromVerification({ applicationId, jobId: application.jobId, plan, verification });
    if (typeof repository.recordStep === 'function') repository.recordStep({ applicationId, jobId: application.jobId, plan, execution, verification, result, idempotencyKey });
    if (playbookRegistry?.recordVerifiedSuccess && result.outcome === 'continue' && verification?.status === 'verified') playbookRegistry.recordVerifiedSuccess({ siteHost: observation.site || context.site || '', atsKey: observation.atsKey || context.atsKey || application.atsKey || '', pageFingerprint: observation.pageFingerprint, plan, source: plan.source });
    return { status: result.outcome === 'continue' ? 'continued' : 'transitioned', idempotencyKey, result, transition: applyTransition(result, { application, job, repository }) };
  }

  return { runApplicationCheckpoint };
}

module.exports = { createApplicationOrchestrator, resultFromVerification, safePlan };
