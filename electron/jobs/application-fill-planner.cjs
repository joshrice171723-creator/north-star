const MAX_RESUME_CHARS = 180_000;
const MAX_REPAIR_RESPONSE_CHARS = 20_000;

function responseText(response = {}) {
  const content = response?.message?.content;
  if (Array.isArray(content)) return content.map((part) => typeof part === 'string' ? part : (part?.text || '')).join('');
  return typeof content === 'object' && content ? JSON.stringify(content) : String(content || '');
}

function parseFillPlanResponse(response = {}) {
  const content = responseText(response);
  const unfenced = content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const objectStart = unfenced.indexOf('{');
  const objectEnd = unfenced.lastIndexOf('}');
  const candidate = objectStart >= 0 && objectEnd > objectStart ? unfenced.slice(objectStart, objectEnd + 1) : unfenced;
  const parsed = JSON.parse(candidate);
  return Array.isArray(parsed) ? { fields: parsed } : parsed;
}

function repairFillPlanMessages(response, fields) {
  return [
    { role: 'system', content: 'Repair the supplied application fill-plan response. Return JSON only: {"fields":[{"fieldFingerprint":"...","action":"fill|ask|blocked","displayValue":"","reason":"","confidence":0,"evidence":["..."]}]}. Include each supplied fieldFingerprint at most once. Never fill authentication, CAPTCHA, password, file upload, legal attestation, sensitive voluntary-disclosure, navigation, or final-submit controls. Keep reason under 120 characters, evidence to one short item, and finish the complete JSON object.' },
    { role: 'user', content: JSON.stringify({ invalidResponse: responseText(response).slice(0, MAX_REPAIR_RESPONSE_CHARS), fieldFingerprints: fields.map((field) => field.fieldFingerprint) }) },
  ];
}

module.exports = { MAX_RESUME_CHARS, parseFillPlanResponse, repairFillPlanMessages };
