'use strict';

const HANDOFF_LABEL = /^(?:easy )?apply(?: now| for this job| on company site| externally)?$|^continue application$|^view application$/i;

function planNextStep({ observation, currentCheckpoint = {}, mode = 'deterministic' } = {}) {
  const pageFingerprint = String(observation?.pageFingerprint || '').trim();
  if (!pageFingerprint) throw new Error('Cannot plan a browser step without a page fingerprint.');
  const navigation = (observation.fields || []).find((field) => field.category === 'navigation' && HANDOFF_LABEL.test(String(field.label || '')));
  return {
    stepId: currentCheckpoint.stepKey || 'dice-handoff',
    stepType: 'safe_navigation',
    actionType: 'handoff',
    targetFingerprint: pageFingerprint,
    targetLabel: navigation?.label || '',
    source: mode === 'playbook' ? 'playbook' : 'deterministic_policy',
    confidence: navigation ? 0.98 : 0.72,
  };
}

module.exports = { planNextStep, HANDOFF_LABEL };
