const { app, BrowserWindow, BrowserView, session, ipcMain, Menu, clipboard, safeStorage } = require('electron');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');
const { createDatabase } = require('./database.cjs');
const { searchJobs, testUsaJobs } = require('./job-search.cjs');
const { testAdzuna } = require('./adzuna-provider.cjs');
const { rankJobs } = require('./job-matcher.cjs');
const { createSearchPlan, refineProviderQuery, fallbackPlan } = require('./job-search-planner.cjs');
const { installApiAuditFetch, setAuditPersistence, setAuditRun, clearAuditRun, setAuditPurpose } = require('./api-audit.cjs');
installApiAuditFetch();

// Load local development secrets without bundling them into the renderer or source.
// The project .env file is gitignored; existing process environment variables win.
const projectEnvPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(projectEnvPath)) {
  for (const line of fs.readFileSync(projectEnvPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

app.setPath('userData', path.join(app.getPath('appData'), 'ClaudeArchitectStudyCoachNative'));
const academyUrl = 'https://anthropic.skilljar.com/';
const academyOrigin = new URL(academyUrl).origin;
let mainWindow;
let academyView;
let academyVisible = true;
let academyLayout = null;
let coachDatabase;
const jobSourceCredentialsPath = () => path.join(app.getPath('userData'), 'job-source-credentials.json');
function readStoredJobSourceCredentials() { try { const parsed = JSON.parse(fs.readFileSync(jobSourceCredentialsPath(), 'utf8')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function readJobSourceCredentials() {
  const stored = readStoredJobSourceCredentials();
  const result = { usajobsEmail: stored.usajobsEmail || '', usajobsApiKey: '', adzunaAppId: '', adzunaApiKey: '' };
  if (!safeStorage.isEncryptionAvailable()) return result;
  try { result.usajobsApiKey = stored.usajobsApiKey ? safeStorage.decryptString(Buffer.from(stored.usajobsApiKey, 'base64')) : ''; } catch {}
  try { result.adzunaAppId = stored.adzunaAppId ? safeStorage.decryptString(Buffer.from(stored.adzunaAppId, 'base64')) : ''; } catch {}
  try { result.adzunaApiKey = stored.adzunaApiKey ? safeStorage.decryptString(Buffer.from(stored.adzunaApiKey, 'base64')) : ''; } catch {}
  return result;
}
function saveJobSourceCredentials(input = {}) {
  const stored = readStoredJobSourceCredentials();
  const email = typeof input.usajobsEmail === 'string' ? input.usajobsEmail.trim().slice(0, 300) : '';
  const usaKey = typeof input.usajobsApiKey === 'string' ? input.usajobsApiKey.trim().slice(0, 500) : '';
  const appId = typeof input.adzunaAppId === 'string' ? input.adzunaAppId.trim().slice(0, 300) : '';
  const adzunaKey = typeof input.adzunaApiKey === 'string' ? input.adzunaApiKey.trim().slice(0, 500) : '';
  if (!safeStorage.isEncryptionAvailable() && (!stored.usajobsApiKey || !stored.adzunaAppId || !stored.adzunaApiKey) && (!usaKey || !appId || !adzunaKey)) throw new Error('Secure credential storage is unavailable. Existing encrypted credentials were not changed; restart the app before saving.');
  const existing = readJobSourceCredentials();
  if ((!email && !stored.usajobsEmail) && (!usaKey && !existing.usajobsApiKey) && (!appId && !existing.adzunaAppId) && (!adzunaKey && !existing.adzunaApiKey)) throw new Error('Enter a complete USAJOBS or Adzuna credential pair.');
  const encrypt = (value) => value ? safeStorage.encryptString(value).toString('base64') : '';
  const next = {
    usajobsEmail: email || stored.usajobsEmail || existing.usajobsEmail || '',
    usajobsApiKey: usaKey ? encrypt(usaKey) : (stored.usajobsApiKey || ''),
    adzunaAppId: appId ? encrypt(appId) : (stored.adzunaAppId || ''),
    adzunaApiKey: adzunaKey ? encrypt(adzunaKey) : (stored.adzunaApiKey || ''),
  };
  const destination = jobSourceCredentialsPath();
  const temporary = `${destination}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
  fs.renameSync(temporary, destination);
  return jobSourceStatus();
}
function clearJobSourceCredentials() { try { fs.rmSync(jobSourceCredentialsPath(), { force: true }); } catch {} return { configured: false, email: '', adzunaConfigured: false, credentialsPresent: false, secureStorageAvailable: safeStorage.isEncryptionAvailable() }; }
function jobSourceStatus() {
  const stored = readStoredJobSourceCredentials();
  const credentials = readJobSourceCredentials();
  const secureStorageAvailable = safeStorage.isEncryptionAvailable();
  const encryptedFieldsPresent = Boolean(stored.usajobsApiKey || stored.adzunaAppId || stored.adzunaApiKey);
  const decryptionFailed = encryptedFieldsPresent && secureStorageAvailable && Boolean((stored.usajobsApiKey && !credentials.usajobsApiKey) || (stored.adzunaAppId && !credentials.adzunaAppId) || (stored.adzunaApiKey && !credentials.adzunaApiKey));
  return { configured: Boolean(credentials.usajobsEmail && credentials.usajobsApiKey), email: credentials.usajobsEmail || stored.usajobsEmail || '', adzunaConfigured: Boolean(credentials.adzunaAppId && credentials.adzunaApiKey), credentialsPresent: encryptedFieldsPresent, secureStorageAvailable, decryptionFailed, warning: encryptedFieldsPresent && (!secureStorageAvailable || decryptionFailed) ? 'Encrypted credentials are present, but secure storage is unavailable or could not decrypt them. Your keys were not deleted; restart the app before saving.' : '' };
}
const roadmapSeedCandidates = [
  path.resolve(__dirname, '../../../canonical-ai-executive-coach-roadmap.csv'),
  path.resolve(__dirname, '../../canonical-ai-executive-coach-roadmap.csv'),
  path.resolve(process.cwd(), 'canonical-ai-executive-coach-roadmap.csv')
];
const roadmapSeedPath = roadmapSeedCandidates.find((candidate) => fs.existsSync(candidate)) || roadmapSeedCandidates[0];
const ACADEMY_CAPTURE_SCHEMA_VERSION = 1;
const ACADEMY_CAPTURE_MAX_BYTES = 1024 * 1024;
const ACADEMY_STUDY_MATERIAL_SCHEMA_VERSION = 1;
const ACADEMY_STUDY_MATERIAL_MAX_BYTES = 1024 * 1024;
const ACADEMY_STUDY_REVIEW_SCHEMA_VERSION = 1;
const ACADEMY_STUDY_REVIEW_MAX_BYTES = 256 * 1024;
const academyCapturePath = () => path.join(app.getPath('userData'), 'academy-capture.json');
const academyStudyMaterialPath = () => path.join(app.getPath('userData'), 'academy-study-material.json');
const academyStudyReviewPath = () => path.join(app.getPath('userData'), 'academy-study-review.json');

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_DEFAULT_MODEL = 'openai/gpt-5.6-luna-pro';
const OPENROUTER_MAX_MESSAGES = 100;
const OPENROUTER_MAX_OUTPUT_TOKENS = 700;
const OPENROUTER_TIMEOUT_MS = 45_000;

function validateOpenRouterMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > OPENROUTER_MAX_MESSAGES) {
    throw new Error('OpenRouter requires between 1 and 100 messages.');
  }
  if (messages.some((message) => !message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim())) {
    throw new Error('OpenRouter messages must contain a valid role and non-empty text content.');
  }
  return messages.map(({ role, content }) => ({ role, content }));
}

async function openRouterChat(messages, options = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, error: 'OPENROUTER_API_KEY is not configured for the Electron process.' };
  const model = typeof options.model === 'string' && options.model.trim() ? options.model.trim() : (process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
  setAuditPurpose(options.auditPurpose || 'openrouter');
  try {
    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://anthropic.skilljar.com/',
        'X-Title': 'Claude Architect Study Coach'
      },
      body: JSON.stringify({ model, messages: validateOpenRouterMessages(messages), temperature: 0.3, max_tokens: Math.min(Number(options.max_tokens) || OPENROUTER_MAX_OUTPUT_TOKENS, 5000), ...(options.response_format ? { response_format: options.response_format } : {}) })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: body?.error?.message || `OpenRouter request failed (${response.status}).` };
    return { ok: true, model, message: body.choices?.[0]?.message || null, usage: body.usage || null };
  } catch (error) {
    return { ok: false, error: error?.name === 'AbortError' ? 'OpenRouter request timed out.' : (error?.message || 'OpenRouter request failed.') };
  } finally {
    clearTimeout(timeout);
    setAuditPurpose('job-search');
  }
}

const COACH_STATUSES = new Set(['backlog', 'todo', 'in-progress', 'blocked', 'done']);
const COACH_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent', 'P0', 'P1', 'P2', 'P3', 'P4']);
const COACH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const validateCoachId = (value, label = 'record id') => {
  if (typeof value !== 'string' || !COACH_ID_PATTERN.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
};
const validateCoachRecord = (input, kind) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`Invalid ${kind}.`);
  validateCoachId(input.id, `${kind} id`);
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 500) throw new Error(`Invalid ${kind}: title is required.`);
  if (input.status !== undefined && (!COACH_STATUSES.has(input.status) && !['Active', 'Completed'].includes(input.status))) throw new Error(`Invalid ${kind}: status.`);
  if (input.priority !== undefined && !COACH_PRIORITIES.has(input.priority)) throw new Error(`Invalid ${kind}: priority.`);
  if (input.parentId !== undefined && input.parentId !== null) validateCoachId(input.parentId, `${kind} parent id`);
  if (input.dueDate !== undefined && input.dueDate !== null && (typeof input.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate))) throw new Error(`Invalid ${kind}: due date.`);
  if (kind === 'task') {
    validateCoachId(input.projectId, 'task project id');
    if (input.parentTaskId !== undefined && input.parentTaskId !== null) validateCoachId(input.parentTaskId, 'task parent id');
    if (input.releaseId !== undefined && input.releaseId !== null) validateCoachId(input.releaseId, 'task release id');
    if (input.phaseId !== undefined && input.phaseId !== null) validateCoachId(input.phaseId, 'task phase id');
  }
  for (const field of ['description', 'nextAction', 'definitionOfDone', 'blockedReason', 'dependencies', 'acceptanceCriteria', 'securityPrivacyNotes', 'sourceContext', 'confidence']) {
    if (input[field] !== undefined && typeof input[field] !== 'string') throw new Error(`Invalid ${kind}: ${field}.`);
  }
  if (input.orderIndex !== undefined && (!Number.isInteger(input.orderIndex) || input.orderIndex < 0)) throw new Error(`Invalid ${kind}: order.`);
  if (input.archived !== undefined && typeof input.archived !== 'boolean') throw new Error(`Invalid ${kind}: archived.`);
  return input;
};
const validateCoachDeleteId = (value, label) => validateCoachId(value, `${label} id`);
const JOB_STAGES = new Set(['target', 'researching', 'ready', 'applied', 'screen', 'interviewing', 'final', 'offer', 'accepted', 'rejected']);
const JOB_PRIORITIES = new Set(['low', 'medium', 'high']);
const validateJobRecord = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid job opportunity.');
  if (typeof input.id !== 'string' || !COACH_ID_PATTERN.test(input.id)) throw new Error('Invalid job id.');
  for (const field of ['company', 'roleTitle']) if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > 500) throw new Error(`Invalid job: ${field} is required.`);
  if (!JOB_STAGES.has(input.stage || 'target')) throw new Error('Invalid job stage.');
  if (!JOB_PRIORITIES.has(input.priority || 'medium')) throw new Error('Invalid job priority.');
  for (const field of ['url', 'location', 'employmentType', 'salaryRange', 'source', 'nextAction', 'contactName', 'contactEmail', 'notes']) if (input[field] !== undefined && typeof input[field] !== 'string') throw new Error(`Invalid job: ${field}.`);
  for (const field of ['followUpDate', 'appliedAt']) if (input[field] !== undefined && input[field] !== null && (typeof input[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input[field]))) throw new Error(`Invalid job: ${field}.`);
  return input;
};
const validateRoadmapPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid roadmap payload.');
  const collections = ['projects', 'releases', 'phases', 'tasks', 'subtasks'];
  if (collections.some((key) => !Array.isArray(payload[key]) || payload[key].length > 10000)) throw new Error('Invalid roadmap collections.');
  for (const entry of [...payload.projects, ...payload.releases, ...payload.phases]) validateCoachRecord(entry, 'project');
  for (const entry of [...payload.tasks, ...payload.subtasks]) validateCoachRecord(entry, 'task');
  return payload;
};

// The Academy login flow can redirect through Skilljar's authentication host
// (and occasionally an OAuth provider). Keep HTTPS navigation inside the
// embedded BrowserView instead of handing it to the system browser.
function isAllowedAcademyUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function navigateAcademy(url) {
  if (!academyView || !isAllowedAcademyUrl(url)) return false;
  academyView.webContents.loadURL(url);
  return true;
}

function isCaptureableAcademyUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.origin === academyOrigin && !/^\/(auth|login|signup|accounts|checkout)(\/|$)/i.test(parsed.pathname);
  } catch { return false; }
}

function readAcademyCaptures() {
  try {
    if (!fs.existsSync(academyCapturePath())) return { schemaVersion: ACADEMY_CAPTURE_SCHEMA_VERSION, captures: [] };
    const parsed = JSON.parse(fs.readFileSync(academyCapturePath(), 'utf8'));
    if (parsed?.schemaVersion !== ACADEMY_CAPTURE_SCHEMA_VERSION || !Array.isArray(parsed.captures)) throw new Error('unsupported or malformed capture file');
    return parsed;
  } catch (error) { throw new Error(`Academy capture storage is unavailable: ${error.message}`); }
}

function captureSummary(entry) {
  return {
    id: String(entry.id),
    capturedAt: String(entry.capturedAt || ''),
    sourceUrl: String(entry.sourceUrl || ''),
    pageTitle: String(entry.pageTitle || ''),
    courseLessonId: entry.courseLessonId ? String(entry.courseLessonId) : null,
    contentType: String(entry.contentType || 'loaded-page-text'),
    content: String(entry.content || '')
  };
}

function readAcademyStudyMaterials() {
  try {
    if (!fs.existsSync(academyStudyMaterialPath())) return { schemaVersion: ACADEMY_STUDY_MATERIAL_SCHEMA_VERSION, materials: [] };
    const parsed = JSON.parse(fs.readFileSync(academyStudyMaterialPath(), 'utf8'));
    if (parsed?.schemaVersion !== ACADEMY_STUDY_MATERIAL_SCHEMA_VERSION || !Array.isArray(parsed.materials)) throw new Error('unsupported or malformed study-material file');
    return parsed;
  } catch (error) { throw new Error(`Academy study-material storage is unavailable: ${error.message}`); }
}

function writeAcademyStudyMaterials(data) {
  const serialized = JSON.stringify(data, null, 2);
  if (Buffer.byteLength(serialized, 'utf8') > ACADEMY_STUDY_MATERIAL_MAX_BYTES) throw new Error('Academy study-material storage exceeds the 1 MB limit');
  const destination = academyStudyMaterialPath();
  const temporary = `${destination}.tmp-${process.pid}`;
  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(temporary, serialized, 'utf8');
    fs.renameSync(temporary, destination);
  } catch (error) {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* best effort cleanup */ }
    throw new Error(`Academy study-material storage cannot be written: ${error.message}`);
  }
}

function readAcademyStudyReviews() {
  try {
    if (!fs.existsSync(academyStudyReviewPath())) return { schemaVersion: ACADEMY_STUDY_REVIEW_SCHEMA_VERSION, reviews: {} };
    const parsed = JSON.parse(fs.readFileSync(academyStudyReviewPath(), 'utf8'));
    if (parsed?.schemaVersion !== ACADEMY_STUDY_REVIEW_SCHEMA_VERSION || !parsed.reviews || typeof parsed.reviews !== 'object' || Array.isArray(parsed.reviews)) throw new Error('unsupported or malformed study-review file');
    return parsed;
  } catch (error) { throw new Error(`Academy study-review storage is unavailable: ${error.message}`); }
}

function writeAcademyStudyReviews(data) {
  const serialized = JSON.stringify(data, null, 2);
  if (Buffer.byteLength(serialized, 'utf8') > ACADEMY_STUDY_REVIEW_MAX_BYTES) throw new Error('Academy study-review storage exceeds the 256 KB limit');
  const destination = academyStudyReviewPath();
  const temporary = `${destination}.tmp-${process.pid}`;
  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(temporary, serialized, 'utf8');
    fs.renameSync(temporary, destination);
  } catch (error) {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* best effort cleanup */ }
    throw new Error(`Academy study-review storage cannot be written: ${error.message}`);
  }
}

function studyMaterialSummary(entry) {
  return { id: String(entry.id), type: 'flashcard', label: 'App-generated', derivation: 'Academy-derived', question: String(entry.question || ''), answer: String(entry.answer || ''), sourceCaptureId: String(entry.sourceCaptureId || ''), sourceTitle: String(entry.sourceTitle || ''), sourceUrl: String(entry.sourceUrl || ''), generatedAt: String(entry.generatedAt || '') };
}

function getAcademyStudyMaterials() {
  try { return { ok: true, materials: readAcademyStudyMaterials().materials.map(studyMaterialSummary) }; }
  catch (error) { return { ok: false, materials: [], error: error.message || 'Academy study materials are unavailable.' }; }
}

function getAcademyStudyReviews() {
  try { return { ok: true, ...readAcademyStudyReviews() }; }
  catch (error) { return { ok: false, schemaVersion: ACADEMY_STUDY_REVIEW_SCHEMA_VERSION, reviews: {}, error: error.message || 'Academy study-review storage is unavailable.' }; }
}

function setAcademyStudyReview(id, status) {
  const allowed = ['Not reviewed', 'Needs review', 'Comfortable'];
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id) || !allowed.includes(status)) return { ok: false, error: 'Invalid flashcard review update.' };
  try {
    if (!readAcademyStudyMaterials().materials.some((entry) => entry.id === id)) return { ok: false, error: 'Flashcard was not found.' };
    const data = readAcademyStudyReviews();
    data.reviews[id] = { status, updatedAt: new Date().toISOString() };
    writeAcademyStudyReviews(data);
    return { ok: true, ...data, filePath: academyStudyReviewPath() };
  } catch (error) { return { ok: false, error: error.message || 'Flashcard review update failed safely.' }; }
}

function generateAcademyFlashcards(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some((id) => typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id))) return { ok: false, error: 'Select one or more saved captures.' };
  try {
    const selected = readAcademyCaptures().captures.filter((capture) => ids.includes(capture.id));
    if (!selected.length) return { ok: false, error: 'No selected captures were found.' };
    const data = readAcademyStudyMaterials();
    const generatedAt = new Date().toISOString();
    const generated = selected.map((capture) => {
      const paragraphs = String(capture.content || '').split(/\n+/).map((part) => part.trim()).filter((part) => part.length >= 30);
      const answer = (paragraphs[0] || String(capture.content || '').trim()).slice(0, 1200);
      return { id: crypto.createHash('sha256').update(`${capture.id}:flashcard`).digest('hex').slice(0, 24), type: 'flashcard', label: 'App-generated', derivation: 'Academy-derived', question: `What key point is stated in “${String(capture.pageTitle || 'this Academy capture').slice(0, 180)}”?`, answer, sourceCaptureId: capture.id, sourceTitle: String(capture.pageTitle || ''), sourceUrl: String(capture.sourceUrl || ''), generatedAt };
    });
    const selectedIds = new Set(selected.map((capture) => capture.id));
    const materials = [...data.materials.filter((entry) => !selectedIds.has(entry.sourceCaptureId)), ...generated];
    writeAcademyStudyMaterials({ ...data, materials });
    return { ok: true, materials: materials.map(studyMaterialSummary), filePath: academyStudyMaterialPath() };
  } catch (error) { return { ok: false, error: error.message || 'Study-material generation failed safely.' }; }
}

function deleteAcademyStudyMaterial(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) return { ok: false, error: 'Invalid study-material selection.' };
  try {
    const data = readAcademyStudyMaterials();
    const materials = data.materials.filter((entry) => entry.id !== id);
    if (materials.length === data.materials.length) return { ok: false, error: 'Study material was not found.' };
    writeAcademyStudyMaterials({ ...data, materials });
    return { ok: true, materials: materials.map(studyMaterialSummary) };
  } catch (error) { return { ok: false, error: error.message || 'Study-material deletion failed safely.' }; }
}

function getAcademyCaptures() {
  try {
    const data = readAcademyCaptures();
    return { ok: true, captures: data.captures.map(captureSummary) };
  } catch (error) {
    return { ok: false, captures: [], error: error.message || 'Academy capture storage is unavailable.' };
  }
}

function deleteAcademyCapture(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) return { ok: false, error: 'Invalid capture selection.' };
  try {
    const data = readAcademyCaptures();
    const captures = data.captures.filter((entry) => entry.id !== id);
    if (captures.length === data.captures.length) return { ok: false, error: 'Capture was not found.' };
    writeAcademyCaptures({ ...data, captures });
    return { ok: true, captures: captures.map(captureSummary) };
  } catch (error) {
    return { ok: false, error: error.message || 'Capture deletion failed safely.' };
  }
}

function writeAcademyCaptures(data) {
  const serialized = JSON.stringify(data, null, 2);
  if (Buffer.byteLength(serialized, 'utf8') > ACADEMY_CAPTURE_MAX_BYTES) throw new Error('Academy capture storage exceeds the 1 MB limit');
  const destination = academyCapturePath();
  const temporary = `${destination}.tmp-${process.pid}`;
  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(temporary, serialized, 'utf8');
    fs.renameSync(temporary, destination);
  } catch (error) {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* best effort cleanup */ }
    throw new Error(`Academy capture storage cannot be written: ${error.message}`);
  }
}

async function captureAcademyPage() {
  if (!academyView?.webContents || academyView.webContents.isDestroyed()) return { ok: false, error: 'Academy page is unavailable.' };
  const currentUrl = academyView.webContents.getURL();
  if (!isCaptureableAcademyUrl(currentUrl)) return { ok: false, error: 'Capture is available only for a displayed Anthropic Academy course page.' };
  try {
    const page = await academyView.webContents.executeJavaScript(`(() => ({
      sourceUrl: location.href,
      pageTitle: document.title || '',
      content: document.body ? document.body.innerText || '' : '',
      courseLessonId: location.pathname.replace(/^\\/+|\\/+$/g, '') || null
    }))()`, true);
    if (!page || typeof page.content !== 'string') return { ok: false, error: 'The displayed Academy page did not provide readable text.' };
    const content = page.content.trim();
    if (!content) return { ok: false, error: 'The displayed Academy page has no loaded text to capture.' };
    if (Buffer.byteLength(content, 'utf8') > ACADEMY_CAPTURE_MAX_BYTES) return { ok: false, error: 'The loaded Academy text is too large to store safely.' };
    if (!isCaptureableAcademyUrl(page.sourceUrl)) return { ok: false, error: 'The displayed page changed or is not an eligible Academy course page.' };
    const data = readAcademyCaptures();
    const capture = { id: crypto.createHash('sha256').update(page.sourceUrl).digest('hex').slice(0, 24), capturedAt: new Date().toISOString(), sourceUrl: page.sourceUrl, pageTitle: String(page.pageTitle || '').slice(0, 500), courseLessonId: page.courseLessonId ? String(page.courseLessonId).slice(0, 500) : null, contentType: 'loaded-page-text', content };
    const existing = data.captures.findIndex((entry) => entry.id === capture.id);
    if (existing >= 0) data.captures[existing] = capture; else data.captures.push(capture);
    writeAcademyCaptures(data);
    return { ok: true, capture: { ...capture, contentLength: content.length }, filePath: academyCapturePath() };
  } catch (error) { return { ok: false, error: error.message || 'Academy capture failed safely.' }; }
}

function academyBounds() {
  if (!mainWindow || !academyView) return;
  const [width, height] = mainWindow.getContentSize();
  const fallbackWidth = Math.max(420, Math.round(width * 0.44));
  const fallback = { x: width - fallbackWidth, width: fallbackWidth };
  const requested = academyLayout || fallback;
  const requestedWidth = Math.max(0, Math.round(requested.width));
  const next = {
    x: requestedWidth === 0 ? width : Math.max(210, Math.min(width - 260, Math.round(requested.x))),
    y: 58,
    width: requestedWidth === 0 ? 1 : Math.max(320, Math.min(width - 210, requestedWidth)),
    height: Math.max(200, height - 58)
  };
  next.width = Math.min(next.width, Math.max(1, width - next.x));
  academyView.setBounds(academyVisible ? next : { x: 0, y: 0, width: 1, height: 1 });
}

function showRendererContextMenu(params) {
  const renderer = mainWindow?.webContents;
  if (!renderer) return;
  const x = Math.max(0, Math.round(params.x || 0));
  const y = Math.max(0, Math.round(params.y || 0));
  const referenceScript = `(function () {
    const el = document.elementFromPoint(${x}, ${y});
    if (!el) return 'No element found at this location';
    const esc = (value) => { try { return CSS.escape(value); } catch { return value.replace(/[^a-zA-Z0-9_-]/g, '_'); } };
    const path = [];
    let node = el;
    while (node && node.nodeType === 1 && path.length < 6) {
      let part = node.tagName.toLowerCase();
      if (node.id) part += '#' + esc(node.id);
      else if (node.classList.length) part += '.' + Array.from(node.classList).slice(0, 3).map(esc).join('.');
      path.unshift(part);
      node = node.parentElement;
    }
    const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\\s+/g, ' ').slice(0, 120);
    return (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().replace(/\\s+/g, '.') : '') + (text ? ' — "' + text + '"' : '') + ' — ' + path.join(' > ')).slice(0, 500);
  })()`;
  const copyReference = async () => {
    try { const reference = await renderer.executeJavaScript(referenceScript, true); clipboard.writeText(reference); } catch (error) { clipboard.writeText('UI reference unavailable: ' + error.message); }
  };
  const menu = Menu.buildFromTemplate([
    { label: 'Copy UI reference', click: copyReference },
    { label: 'Inspect element', click: () => renderer.inspectElement(x, y) },
    { type: 'separator' },
    { label: 'Copy', role: 'copy', enabled: Boolean(params.selectionText?.trim()) }
  ]);
  menu.popup({ window: mainWindow });
}

function showAcademyContextMenu(params) {
  const hasLink = Boolean(params.linkURL);
  const academyLink = hasLink && isAllowedAcademyUrl(params.linkURL) ? params.linkURL : null;
  const hasSelection = Boolean(params.selectionText?.trim());

  const menu = Menu.buildFromTemplate([
    { label: 'Back', role: 'goBack', enabled: academyView.webContents.canGoBack() },
    { label: 'Forward', role: 'goForward', enabled: academyView.webContents.canGoForward() },
    { label: 'Reload', role: 'reload' },
    { type: 'separator' },
    { label: 'Copy', role: 'copy', enabled: hasSelection },
    { label: 'Copy link address', enabled: hasLink, click: () => clipboard.writeText(params.linkURL) },
    { type: 'separator' },
    { label: 'Open link in current view', enabled: Boolean(academyLink), click: () => navigateAcademy(academyLink) },
  ]);

  menu.popup({ window: mainWindow });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    title: 'Claude Architect',
    backgroundColor: '#0d0f12',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  academyView = new BrowserView({
    webPreferences: {
      partition: 'persist:anthropic-academy-native',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.setBrowserView(academyView);
  academyBounds();

  academyView.webContents.setWindowOpenHandler(({ url }) => {
    navigateAcademy(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('context-menu', (_event, params) => showRendererContextMenu(params));
  academyView.webContents.on('context-menu', (_event, params) => showAcademyContextMenu(params));
  const keepNavigationInApp = (event, url) => {
    if (!isAllowedAcademyUrl(url)) event.preventDefault();
  };
  academyView.webContents.on('will-navigate', keepNavigationInApp);
  academyView.webContents.on('will-redirect', keepNavigationInApp);

  academyView.webContents.loadURL(academyUrl);
  mainWindow.on('resize', academyBounds);
  mainWindow.on('closed', () => { mainWindow = null; academyView = null; });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  mainWindow.loadURL(devUrl || pathToFileURL(path.join(__dirname, '../dist/index.html')).toString());
}

function registerDatabaseIpc() {
  ipcMain.handle('coach:bootstrap', () => coachDatabase.bootstrap());
  ipcMain.handle('coach:sync-roadmap', (_event, payload) => coachDatabase.syncRoadmap(validateRoadmapPayload(payload)));
  ipcMain.handle('coach:import-roadmap', (_event, payload) => coachDatabase.importRoadmap(validateRoadmapPayload(payload)));
  ipcMain.handle('coach:save-note', (_event, content, title) => coachDatabase.saveNote(content, title));
  ipcMain.handle('coach:backup', () => coachDatabase.backup());
  ipcMain.handle('coach:projects:list', () => coachDatabase.projects.list());
  ipcMain.handle('coach:workspaces:list', () => coachDatabase.workspaces.list());
  ipcMain.handle('coach:workspaces:create', (_event, input) => coachDatabase.workspaces.create(validateCoachRecord(input, 'workspace')));
  ipcMain.handle('coach:workspaces:update', (_event, input) => coachDatabase.workspaces.update(validateCoachRecord(input, 'workspace')));
  ipcMain.handle('coach:workspaces:delete', (_event, id) => coachDatabase.workspaces.delete(validateCoachDeleteId(id, 'workspace')));
  ipcMain.handle('coach:projects:create', (_event, input) => coachDatabase.projects.create(validateCoachRecord(input, 'project')));
  ipcMain.handle('coach:projects:update', (_event, input) => coachDatabase.projects.update(validateCoachRecord(input, 'project')));
  ipcMain.handle('coach:projects:delete', (_event, id) => coachDatabase.projects.delete(validateCoachDeleteId(id, 'project')));
  ipcMain.handle('coach:tasks:list', () => coachDatabase.tasks.list());
  ipcMain.handle('coach:tasks:create', (_event, input) => coachDatabase.tasks.create(validateCoachRecord(input, 'task')));
  ipcMain.handle('coach:tasks:update', (_event, input) => coachDatabase.tasks.update(validateCoachRecord(input, 'task')));
  ipcMain.handle('coach:tasks:delete', (_event, id) => coachDatabase.tasks.delete(validateCoachDeleteId(id, 'task')));
  ipcMain.handle('coach:jobs:list', () => coachDatabase.jobs.list());
  ipcMain.handle('coach:jobs:create', (_event, input) => coachDatabase.jobs.create(validateJobRecord(input)));
  ipcMain.handle('coach:jobs:update', (_event, input) => coachDatabase.jobs.update(validateJobRecord(input)));
  ipcMain.handle('coach:jobs:delete', (_event, id) => coachDatabase.jobs.delete(validateCoachDeleteId(id, 'job')));
  ipcMain.handle('jobs:profile:get', () => coachDatabase.profiles.getCurrent());
  ipcMain.handle('jobs:profile:save', (_event, input) => coachDatabase.profiles.upsert(input));
  ipcMain.handle('jobs:resume:get', () => coachDatabase.resumes.getMaster());
  ipcMain.handle('jobs:resume:save', (_event, input) => coachDatabase.resumes.upsertMaster(input));
  ipcMain.handle('jobs:source:get', () => jobSourceStatus());
  ipcMain.handle('jobs:source:save', (_event, input) => saveJobSourceCredentials(input));
  ipcMain.handle('jobs:source:clear', () => clearJobSourceCredentials());
  ipcMain.handle('jobs:source:test', async () => { const credentials = readJobSourceCredentials(); const results = []; if (credentials.usajobsEmail && credentials.usajobsApiKey) results.push({ provider: 'USAJOBS', ...(await testUsaJobs(credentials)) }); if (credentials.adzunaAppId && credentials.adzunaApiKey) results.push({ provider: 'Adzuna', ...(await testAdzuna(credentials)) }); return results.length === 1 ? results[0] : { ok: results.every((result) => result.ok), results }; });
  ipcMain.handle('jobs:search:attempts', (_event, runId) => coachDatabase.listJobSearchAttempts(String(runId || '').slice(0, 160)));
  ipcMain.handle('jobs:search:api-calls', (_event, runId) => coachDatabase.listApiCalls(String(runId || '').slice(0, 160)));
  ipcMain.handle('jobs:search:ranking-batches', (_event, runId) => coachDatabase.listJobSearchRankingBatches(String(runId || '').slice(0, 160)));
  setAuditPersistence((entry) => coachDatabase.recordApiCall(entry));
  ipcMain.handle('jobs:search', async () => {
    const profile = coachDatabase.profiles.getCurrent();
    const resume = coachDatabase.resumes.getMaster();
    if (!profile?.targetRoles?.length && !profile?.targetLocations?.length && !profile?.interests?.length) return { ok: false, needsProfile: true, error: 'Add a target role, location, or interest to your profile first.' };
    const runId = coachDatabase.createJobSearchRun();
    setAuditRun(runId);
    let plan;
    try {
      plan = process.env.HERMES_AI_SEARCH_PLANNING !== 'false'
        ? await createSearchPlan({ profile, resume, targetIntent: profile.targetRoles?.[0], openRouter: (messages, options) => openRouterChat(messages, { ...options, auditPurpose: 'planning' }) })
        : fallbackPlan(profile, resume);
    } catch (cause) {
      const warning = cause?.message || 'AI search planning failed.';
      coachDatabase.finishJobSearchRun(runId, { status: 'failed', warning });
      const attempts = coachDatabase.listJobSearchAttempts(runId);
      const apiCalls = coachDatabase.listApiCalls(runId);
      clearAuditRun();
      return {
        ok: false,
        error: { code: cause?.code || 'search_planning_failed', message: warning },
        warning,
        jobs: [],
        matches: [],
        sourceStats: [],
        attemptsDiagnostics: attempts,
        diagnostics: { runId, attempts },
        apiCalls,
      };
    }
    const diagnostics = {
      record: ({ provider, lane, scope, result, request }) => coachDatabase.recordJobSearchAttempt({
        runId,
        provider,
        laneId: lane.laneId,
        query: result.diagnostics?.query || lane.what || lane.positionTitle || lane.keyword,
        location: scope.locationName,
        request,
        httpStatus: result.diagnostics?.httpStatus,
        resultCount: result.resultCount,
        totalAvailable: result.totalAvailable,
        durationMs: result.diagnostics?.durationMs,
        errorCode: result.error?.code,
        errorMessage: result.error?.message,
        errorDetail: result.diagnostics?.errorSummary,
        preview: result.jobs,
      }),
    };
    let found;
    try {
      found = await searchJobs({ profile, credentials: readJobSourceCredentials(), plan, diagnostics, refineQuery: (input) => refineProviderQuery({ ...input, profile, resume, openRouter: (messages, options) => openRouterChat(messages, { ...options, auditPurpose: 'provider_query_refinement' }) }) });
    } catch (cause) {
      const warning = cause?.message || 'Search failed.';
      coachDatabase.finishJobSearchRun(runId, { status: 'failed', warning });
      const attempts = coachDatabase.listJobSearchAttempts(runId);
      const apiCalls = coachDatabase.listApiCalls(runId);
      clearAuditRun();
      return {
        ok: false,
        error: { code: cause?.code || 'job_search_failed', message: warning },
        warning,
        jobs: [],
        matches: [],
        sourceStats: [],
        attemptsDiagnostics: attempts,
        diagnostics: { runId, attempts },
        apiCalls,
      };
    }
    const attempts = coachDatabase.listJobSearchAttempts(runId);
    // Keep backend-only callbacks out of Electron IPC payloads. A function in
    // the result can prevent the renderer's search promise from settling.
    found.diagnostics = { runId, attempts };
    found.attemptsDiagnostics = attempts;
    if (found.error && !found.jobs.length) {
      coachDatabase.finishJobSearchRun(runId, { status: 'failed', resultCount: 0, warning: found.warning || found.error.message || 'No jobs were returned.' });
      const apiCalls = coachDatabase.listApiCalls(runId);
      clearAuditRun();
      return { ok: false, ...found, searchPlan: plan, apiCalls };
    }
    const retrievalApiCalls = coachDatabase.listApiCalls(runId);
    const retrievalReport = { ok: true, ...found, searchPlan: plan, apiCalls: retrievalApiCalls };
    let ranked = [];
    let rankingStatus = 'not_run';
    let rankingError = null;
    if (found.jobs.length) {
      try {
        const reportRankingProgress = (batch) => {
          coachDatabase.recordJobSearchRankingBatch({ runId, ...batch });
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('jobs:search:progress', { runId, ...batch, report: retrievalReport });
        };
        ranked = await rankJobs({ jobs: found.jobs, profile, resume, onBatch: reportRankingProgress, openRouter: (messages, options) => openRouterChat(messages, { ...options, auditPurpose: 'final_selection' }) });
        rankingStatus = ranked.length ? (ranked.rankingDiagnostics?.underSelected ? 'under_selected' : 'available') : 'unavailable';
      } catch (cause) {
        rankingError = { code: cause?.code || 'ai_ranking_failed', message: cause?.message || 'AI job ranking failed.', diagnostics: cause?.rankingDiagnostics || null };
        rankingStatus = 'unavailable';
        // Retrieval already produced usable jobs. Do not throw them away when the
        // optional AI selector times out, returns incomplete JSON, or fails.
        ranked = found.jobs.map((job) => ({
          job,
          externalId: job.externalId,
          fitScore: Number.isFinite(Number(job.retrievalScore)) ? Math.round(Number(job.retrievalScore)) : null,
          scoreType: 'deterministic',
          fitTier: 'deterministic candidate',
          strengths: job.searchEvidence?.positionTitleQuery ? [`Title: ${job.searchEvidence.positionTitleQuery}`] : [],
          gaps: ['Final AI selection was unavailable; review the announcement manually.'],
          unknowns: [],
          reasoning: 'Retrieved successfully. Final AI selection was unavailable, so this deterministic candidate is shown for review.',
        }));
      }
    }
    const shownByProvider = ranked.reduce((counts, entry) => { const provider = entry.job?.providerKey; if (provider) counts[provider] = (counts[provider] || 0) + 1; return counts; }, {});
    const rankingProviderCounts = rankingError?.diagnostics?.providerCounts || ranked.rankingDiagnostics?.providerCounts || {};
    const sourceStats = (found.sourceStats || []).map((source) => { const rankingCounts = rankingProviderCounts[source.key] || {}; return { ...source, aiSubmitted: rankingCounts.submitted ?? found.jobs.filter((job) => job.providerKey === source.key).length, aiAssessed: rankingCounts.assessed || 0, aiReturned: rankingCounts.aiReturned ?? rankingCounts.returned ?? 0, finalSelectedCount: rankingCounts.returned || 0, displayedCount: shownByProvider[source.key] || 0, shown: shownByProvider[source.key] || 0 }; });
    const warning = rankingError
      ? [found.warning, 'Final AI selection was unavailable; showing deterministic provider candidates.'].filter(Boolean).join(' ')
      : found.warning;
    coachDatabase.finishJobSearchRun(runId, { resultCount: ranked.length, warning: warning || '', status: found.error && !found.jobs?.length ? 'failed' : 'completed' });
    const apiCalls = coachDatabase.listApiCalls(runId);
    const rankingBatches = coachDatabase.listJobSearchRankingBatches(runId);
    clearAuditRun();
    const rankingDiagnostics = ranked.rankingDiagnostics || rankingError?.diagnostics || null;
    return { ok: true, ...found, sourceStats, warning, jobs: found.jobs, matches: ranked, searchPlan: plan, apiCalls, rankingBatches, counts: { ...found.counts, finalSelected: rankingDiagnostics?.returnedCount || 0, displayed: ranked.length }, ranking: { status: rankingStatus, error: rankingError, diagnostics: rankingDiagnostics } };
  });
  ipcMain.handle('openrouter:chat', (_event, messages, options) => openRouterChat(messages, options));
}

app.whenReady().then(() => {
  coachDatabase = createDatabase({ userDataPath: app.getPath('userData'), seedPath: roadmapSeedPath });
  registerDatabaseIpc();
  ipcMain.handle('academy:navigate', (_event, url) => navigateAcademy(url));
  ipcMain.handle('academy:capture-page', () => captureAcademyPage());
  ipcMain.handle('academy:get-captures', () => getAcademyCaptures());
  ipcMain.handle('academy:delete-capture', (_event, id) => deleteAcademyCapture(id));
  ipcMain.handle('academy:get-study-materials', () => getAcademyStudyMaterials());
  ipcMain.handle('academy:generate-flashcards', (_event, ids) => generateAcademyFlashcards(ids));
  ipcMain.handle('academy:delete-study-material', (_event, id) => deleteAcademyStudyMaterial(id));
  ipcMain.handle('academy:get-study-reviews', () => getAcademyStudyReviews());
  ipcMain.handle('academy:set-study-review', (_event, id, status) => setAcademyStudyReview(id, status));
  ipcMain.handle('academy:set-visible', (_event, visible) => {
    academyVisible = Boolean(visible);
    academyBounds();
    return academyVisible;
  });
  ipcMain.handle('academy:set-bounds', (_event, bounds) => {
    if (!bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.width)) return false;
    academyLayout = { x: bounds.x, width: bounds.width };
    academyBounds();
    return true;
  });
  session.fromPartition('persist:anthropic-academy-native').setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { try { coachDatabase?.close(); } catch { /* best effort */ } });

module.exports = { isAllowedAcademyUrl };
