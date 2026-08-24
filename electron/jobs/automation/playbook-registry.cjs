'use strict';

const crypto = require('node:crypto');

const MATCHABLE_STATUSES = new Set(['candidate', 'verified']);
const VERIFIED_THRESHOLD = 0.85;

function boundedJson(value, fallback = '{}') {
  try { return JSON.stringify(value && typeof value === 'object' ? value : JSON.parse(fallback)); } catch { return fallback; }
}

function createId(prefix) { return `${prefix}-${crypto.randomUUID()}`; }

function createPlaybookRegistry({ repository, confidenceThreshold = VERIFIED_THRESHOLD } = {}) {
  if (!repository || typeof repository.listPlaybooks !== 'function' || typeof repository.savePlaybook !== 'function' || typeof repository.savePlaybookStep !== 'function') throw new Error('The playbook registry requires a storage repository.');

  function match({ siteHost = '', atsKey = '', workflowKind = 'job_application', pageFingerprint = '', stepKey = '' } = {}) {
    const candidates = repository.listPlaybooks({ siteHost, atsKey, workflowKind }).filter((playbook) => MATCHABLE_STATUSES.has(playbook.status));
    for (const playbook of candidates) {
      const step = repository.listPlaybookSteps(playbook.id).find((entry) => (!stepKey || entry.stepKey === stepKey) && entry.pageFingerprint === pageFingerprint);
      if (step) return { ...playbook, step, reusableWithoutRepair: playbook.status === 'verified' && Number(playbook.confidence) >= confidenceThreshold && Number(step.confidence) >= confidenceThreshold };
    }
    return null;
  }

  function recordVerifiedSuccess({ siteHost, atsKey = '', workflowKind = 'job_application', pageFingerprint, plan, source = 'ai_repair' } = {}) {
    if (!siteHost || !pageFingerprint || !plan?.actionType) throw new Error('A successful playbook step requires site, fingerprint, and action.');
    const existing = repository.listPlaybooks({ siteHost, atsKey, workflowKind }).find((entry) => entry.status !== 'disabled' && entry.version === 1);
    const timestamp = new Date().toISOString();
    const playbook = repository.savePlaybook({ id: existing?.id || createId('playbook'), siteHost, atsKey, workflowKind, version: existing?.version || 1, status: existing?.status === 'verified' ? 'verified' : 'candidate', confidence: Math.max(Number(existing?.confidence) || 0, Number(plan.confidence) || 0), playbookJson: existing?.playbookJson || {}, source, successCount: (Number(existing?.successCount) || 0) + 1, lastSuccessAt: timestamp, createdAt: existing?.createdAt || timestamp, updatedAt: timestamp });
    const priorStep = repository.listPlaybookSteps(playbook.id).find((entry) => entry.stepKey === (plan.stepId || plan.actionType) && entry.pageFingerprint === pageFingerprint);
    repository.savePlaybookStep({ id: priorStep?.id || createId('playbook-step'), playbookId: playbook.id, stepOrder: Number(priorStep?.stepOrder) || 0, stepKey: plan.stepId || plan.actionType, pageType: plan.pageType || plan.stepType || '', pageFingerprint, actionType: plan.actionType, target: { label: plan.targetLabel || '' }, arguments: {}, verification: { required: true }, safetyClass: 'safe_navigation', confidence: Math.max(Number(priorStep?.confidence) || 0, Number(plan.confidence) || 0), successCount: (Number(priorStep?.successCount) || 0) + 1, createdAt: priorStep?.createdAt || timestamp, updatedAt: timestamp });
    return playbook;
  }

  return { match, recordVerifiedSuccess };
}

module.exports = { createPlaybookRegistry, VERIFIED_THRESHOLD, boundedJson };
