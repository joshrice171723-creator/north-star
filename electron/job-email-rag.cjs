const crypto = require('crypto');

const JOB_TERMS = [
  'application', 'applicant', 'candidate', 'interview', 'recruiter', 'recruiting',
  'hiring', 'job opportunity', 'position', 'role', 'offer', 'screening',
  'assessment', 'onsite', 'phone screen', 'technical screen', 'talent acquisition',
];

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function classifyJobEmail({ subject = '', from = '', body = '', pipelineSignals = [] } = {}) {
  const text = `${subject} ${from} ${body}`.toLowerCase();
  const matchedTerms = JOB_TERMS.filter((term) => text.includes(term));
  const normalizedPipelineSignals = [...new Set(pipelineSignals.map((term) => normalizeText(term).toLowerCase()).filter((term) => term.length >= 3))];
  const matchedPipelineSignals = normalizedPipelineSignals.filter((term) => text.includes(term));
  const score = Math.min(100, matchedTerms.length * 18 + matchedPipelineSignals.length * 35 + (from.toLowerCase().includes('recruit') ? 20 : 0));
  return { isJobRelated: score >= 18, score, matchedTerms, matchedPipelineSignals };
}

function chunkText(text, { size = 1200, overlap = 180 } = {}) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const chunks = [];
  for (let start = 0; start < normalized.length; start += Math.max(1, size - overlap)) {
    const content = normalized.slice(start, start + size).trim();
    if (content) chunks.push({ index: chunks.length, content });
    if (start + size >= normalized.length) break;
  }
  return chunks;
}

function searchChunks(chunks, query, limit = 10) {
  const terms = normalizeText(query).toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 1);
  if (!terms.length) return [];
  return chunks.map((chunk) => {
    const content = String(chunk.content || '').toLowerCase();
    const score = terms.reduce((total, term) => total + (content.includes(term) ? 1 : 0), 0);
    return { ...chunk, score };
  }).filter((chunk) => chunk.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

function stableEmailId(provider, externalId) {
  return `email-${crypto.createHash('sha256').update(`${provider}:${externalId}`).digest('hex').slice(0, 32)}`;
}

function decodeBase64Url(value) {
  return Buffer.from(String(value || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function header(payload, name) {
  return payload?.headers?.find((entry) => String(entry.name).toLowerCase() === name.toLowerCase())?.value || '';
}

function extractGmailText(payload) {
  const parts = Array.isArray(payload?.parts) ? payload.parts : [];
  const textPart = parts.find((part) => part.mimeType === 'text/plain' && part.body?.data) || payload;
  return decodeBase64Url(textPart?.body?.data || '');
}

function normalizeGmailMessage(message, options = {}) {
  const payload = message?.payload || {};
  const subject = normalizeText(header(payload, 'Subject'));
  const from = normalizeText(header(payload, 'From'));
  const to = normalizeText(header(payload, 'To'));
  const receivedAt = header(payload, 'Date') || null;
  const body = normalizeText(extractGmailText(payload));
  const classification = classifyJobEmail({ subject, from, body, pipelineSignals: options.pipelineSignals });
  return { externalId: message.id, threadId: message.threadId || '', subject, from, to, receivedAt, body, ...classification };
}

module.exports = { JOB_TERMS, classifyJobEmail, chunkText, searchChunks, stableEmailId, normalizeGmailMessage };
