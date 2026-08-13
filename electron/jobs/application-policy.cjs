// This module is deliberately pure: remote pages and ATS adapters describe fields,
// but only this shared policy is allowed to decide whether a value is actionable.
const BLOCKED = new Set(['sensitive_voluntary_disclosure', 'legal_signature', 'authentication_captcha', 'file_upload', 'final_submit', 'navigation']);
const fieldText = (field = {}) => `${field.label || ''} ${field.name || ''} ${field.id || ''} ${field.autocomplete || ''} ${field.inputType || ''}`.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_./-]+/g, ' ').toLowerCase();
const profileSource = (field) => {
  const text = fieldText(field);
  if (/first name|given name/.test(text)) return 'firstName';
  if (/last name|family name|surname/.test(text)) return 'lastName';
  if (/email/.test(text)) return 'email';
  if (/phone|mobile/.test(text)) return 'phone';
  if (/linkedin/.test(text)) return 'linkedinUrl';
  if (/github/.test(text)) return 'githubUrl';
  if (/portfolio|website/.test(text)) return 'portfolioUrl';
  if (/postal|zip/.test(text)) return 'postalCode';
  if (/street|address/.test(text)) return 'street';
  if (/city/.test(text)) return 'city';
  if (/state|province|region/.test(text)) return 'state';
  if (/country/.test(text)) return 'country';
  return 'fullName';
};

function classifyField(field = {}) {
  const text = fieldText(field);
  if (field.inputType === 'password' || /password|captcha|verification code|one[- ]time|mfa/.test(text)) return 'authentication_captcha';
  if (/submit|send application|complete application|apply now/.test(text) && field.elementType === 'button') return 'final_submit';
  if (/race|ethnicity|gender|veteran|disability|voluntary self/.test(text)) return 'sensitive_voluntary_disclosure';
  if (/signature|certify|attest|legal agreement|terms and conditions/.test(text)) return 'legal_signature';
  if (field.inputType === 'file') return 'file_upload';
  if (/email|phone|first name|last name|given name|family name|full name|address|street|city|state|province|postal|zip|country|linkedin|github|portfolio/.test(text)) return 'identity_contact';
  if (/authorized|sponsorship|visa/.test(text)) return 'work_authorization';
  if (/salary|compensation|relocat|travel|start date/.test(text)) return 'compensation';
  if (field.elementType === 'textarea' || /why are you|describe|cover letter|additional information/.test(text)) return 'free_text';
  if (['button', 'submit'].includes(field.elementType) || /back|next|continue|save/.test(text)) return 'navigation';
  return 'unknown';
}

function decideField(field, { profile = {}, excluded = false } = {}) {
  const category = field.category || classifyField(field);
  if (BLOCKED.has(category)) return { action: 'blocked', reasonCode: category, value: null, provenance: [], confidence: 1 };
  if (excluded) return { action: 'leave_blank', reasonCode: 'user_excluded', value: null, provenance: [], confidence: 1 };
  if (category === 'identity_contact') {
    const source = profileSource(field); const value = profile[source];
    return value ? { action: 'fill', reasonCode: 'verified_profile', value, provenance: [`profile.${source}`], confidence: 1 } : { action: 'ask', reasonCode: 'missing_profile', value: null, provenance: [], confidence: 1 };
  }
  if (category === 'work_authorization') return profile.workAuthorization ? { action: 'suggest', reasonCode: 'verified_profile', value: profile.workAuthorization, provenance: ['profile.workAuthorization'], confidence: 1 } : { action: 'ask', reasonCode: 'missing_profile', value: null, provenance: [], confidence: 1 };
  if (category === 'compensation' || category === 'free_text') return { action: 'ask', reasonCode: 'requires_approval', value: null, provenance: [], confidence: 0.8 };
  return { action: 'ask', reasonCode: 'unknown', value: null, provenance: [], confidence: 0 };
}

module.exports = { BLOCKED, fieldText, profileSource, classifyField, decideField };
