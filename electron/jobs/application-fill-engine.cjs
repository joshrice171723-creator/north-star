const crypto = require('crypto');
const { decideField } = require('./application-policy.cjs');
const planId = () => `fill-plan-${crypto.randomUUID()}`;

function buildFillPlan({ sessionId, applicationId, pageFingerprint, fields = [], profile = {}, excluded = [] }) {
  const excludedSet = new Set(excluded);
  return { id: planId(), sessionId, applicationId, pageFingerprint, createdAt: new Date().toISOString(), fields: fields.map((field) => {
    const decision = decideField(field, { profile, excluded: excludedSet.has(field.fieldFingerprint) });
    return { fieldFingerprint: field.fieldFingerprint, category: field.category, label: field.label, action: decision.action, displayValue: decision.value ? String(decision.value).slice(0, 300) : '', protectedValueRef: '', provenance: decision.provenance, confidence: decision.confidence, reasonCode: decision.reasonCode };
  }) };
}

function validatePlanForFill({ plan, currentPageFingerprint, fields = [] }) {
  if (!plan || plan.pageFingerprint !== currentPageFingerprint) throw new Error('This fill plan is stale. Rescan and review the current form first.');
  const known = new Map(fields.map((field) => [field.fieldFingerprint, field]));
  return plan.fields.filter((entry) => entry.action === 'fill').map((entry) => {
    const field = known.get(entry.fieldFingerprint); if (!field) return { ...entry, action: 'blocked', reasonCode: 'field_changed' };
    // Defense in depth: classify again immediately before a future mutation.
    const decision = decideField(field); return decision.action === 'fill' ? entry : { ...entry, action: 'blocked', reasonCode: decision.reasonCode };
  });
}

module.exports = { buildFillPlan, validatePlanForFill };
