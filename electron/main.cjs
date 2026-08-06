const { app, BrowserWindow, BrowserView, session, ipcMain, Menu, clipboard } = require('electron');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');

app.setPath('userData', path.join(app.getPath('appData'), 'ClaudeArchitectStudyCoachNative'));
const academyUrl = 'https://anthropic.skilljar.com/';
const academyOrigin = new URL(academyUrl).origin;
let mainWindow;
let academyView;
let academyVisible = true;
let academyLayout = null;
const ACADEMY_CAPTURE_SCHEMA_VERSION = 1;
const ACADEMY_CAPTURE_MAX_BYTES = 1024 * 1024;
const ACADEMY_STUDY_MATERIAL_SCHEMA_VERSION = 1;
const ACADEMY_STUDY_MATERIAL_MAX_BYTES = 1024 * 1024;
const ACADEMY_STUDY_REVIEW_SCHEMA_VERSION = 1;
const ACADEMY_STUDY_REVIEW_MAX_BYTES = 256 * 1024;
const academyCapturePath = () => path.join(app.getPath('userData'), 'academy-capture.json');
const academyStudyMaterialPath = () => path.join(app.getPath('userData'), 'academy-study-material.json');
const academyStudyReviewPath = () => path.join(app.getPath('userData'), 'academy-study-review.json');

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
  const next = {
    x: Math.max(210, Math.min(width - 260, Math.round(requested.x))),
    y: 58,
    width: Math.max(320, Math.min(width - 210, Math.round(requested.width))),
    height: Math.max(200, height - 58)
  };
  next.width = Math.min(next.width, width - next.x);
  academyView.setBounds(academyVisible ? next : { x: 0, y: 0, width: 1, height: 1 });
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

app.whenReady().then(() => {
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

module.exports = { isAllowedAcademyUrl };