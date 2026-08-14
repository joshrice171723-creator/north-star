const electron = require('electron');
const { app, BrowserWindow, BrowserView, session, ipcMain, Menu, Tray, nativeImage, clipboard, safeStorage, dialog, shell, Notification } = electron;
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const { createDatabase } = require('./database.cjs');
const { searchJobs, testUsaJobs } = require('./job-search.cjs');
const { testAdzuna } = require('./adzuna-provider.cjs');
const { rankJobs } = require('./job-matcher.cjs');
const { createSearchPlan, refineProviderQuery, fallbackPlan } = require('./job-search-planner.cjs');
const { normalizeGmailMessage } = require('./job-email-rag.cjs');
const { extractPhoneNumber } = require('./google-voice.cjs');
const { parseJobListing } = require('./job-import.cjs');
const { tokenIsUsable, refreshGmailAccessToken, createPkcePair, buildGmailAuthorizationUrl, exchangeGmailAuthorizationCode } = require('./gmail-oauth.cjs');
const { buildEvidenceCatalog, buildGenerationMessages, normalizeGeneratedContent, validateGeneratedDocument, renderPlainText, PROMPT_VERSION } = require('./jobs/application-documents.cjs');
const { createApplicationBrowser } = require('./jobs/application-browser.cjs');
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
let googleVoiceView;
let googleVoiceViewAttached = false;
let academyVisible = true;
let googleVoiceViewVisible = false;
let academyLayout = null;
let coachDatabase;
let applicationBrowser;
let emailMonitorTimer;
let googleVoiceWindow;
let googleVoiceMonitorTimer;
let googleVoiceTray;
let isQuitting = false;
let googleVoiceSnapshot = null;
const googleVoiceUrl = 'https://voice.google.com/';
const googleVoicePartition = 'persist:google-voice-native';
const googleVoiceSettingsPath = () => path.join(app.getPath('userData'), 'google-voice-settings.json');
function readGoogleVoiceSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(googleVoiceSettingsPath(), 'utf8'));
    return { enabled: Boolean(parsed?.enabled) };
  } catch { return { enabled: false }; }
}
function writeGoogleVoiceSettings(settings) {
  const destination = googleVoiceSettingsPath();
  const temporary = `${destination}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify({ enabled: Boolean(settings.enabled) }), 'utf8');
  fs.renameSync(temporary, destination);
}
function googleVoiceStatus() {
  const settings = readGoogleVoiceSettings();
  return { enabled: settings.enabled, running: Boolean(googleVoiceWindow && !googleVoiceWindow.isDestroyed()), signedIn: Boolean(googleVoiceWindow?.webContents?.getURL()?.includes('voice.google.com')) };
}
function showGoogleVoiceNotification(title, body) {
  // Mirror the OS alert into the renderer so an open app window has an
  // actionable notification instead of requiring the user to find the tray icon.
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('google-voice:notification', { title, body, receivedAt: new Date().toISOString() });
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body, silent: false });
  notification.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      setGoogleVoiceViewVisible(true);
      googleVoiceView?.webContents.focus();
    } else openGoogleVoiceWindow();
  });
  notification.show();
}
async function inspectGoogleVoice() {
  if (!googleVoiceWindow?.webContents || googleVoiceWindow.webContents.isDestroyed()) return;
  try {
    const snapshot = await googleVoiceWindow.webContents.executeJavaScript(`(() => {
      const text = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const labels = Array.from(document.querySelectorAll('[aria-label], [title]'))
        .map((node) => text(node.getAttribute('aria-label') || node.getAttribute('title')))
        .filter((value) => value && /call|message|text|voicemail|ring|incoming|missed|new/i.test(value))
        .slice(0, 80);
      const body = text(document.body?.innerText).slice(0, 12000);
      const phoneNumber = (body.match(/(?:\+?\d[\d\s().-]{6,}\d)/g) || []).find((value) => value.replace(/\D/g, '').length >= 7) || '';
      const signal = [...labels, text(document.title), body].join(' ');
      return { title: text(document.title), labels, body, phoneNumber, activityType: /call|ringing|voicemail/i.test(signal) ? 'call' : 'message' };
    })()`, true);
    const normalized = JSON.stringify(snapshot);
    if (!googleVoiceSnapshot) { googleVoiceSnapshot = normalized; return; }
    if (normalized === googleVoiceSnapshot) return;
    googleVoiceSnapshot = normalized;
    const signal = [...(snapshot.labels || []), snapshot.title, snapshot.body].join(' ');
    if (/new message|incoming call|missed call|new voicemail|ringing|unread/i.test(signal)) {
      const label = (snapshot.labels || []).find((value) => /new message|incoming|missed call|voicemail|ringing|unread/i.test(value));
      const phoneNumber = extractPhoneNumber(snapshot.phoneNumber || snapshot.body);
      const result = coachDatabase?.jobs?.activity?.ingestGoogleVoiceActivity?.({
        sourceUrl: googleVoiceWindow.webContents.getURL(),
        title: label || snapshot.title || 'Google Voice activity',
        content: snapshot.body,
        phoneNumber,
        activityType: snapshot.activityType,
      });
      if (result?.matched && !result.duplicate) {
        showGoogleVoiceNotification('Google Voice · Job updated', `${label || 'New activity'} was added to the assigned job timeline.`);
      } else {
        showGoogleVoiceNotification('Google Voice', label || 'You have a new Google Voice call or message.');
      }
    }
  } catch { /* Google Voice can briefly replace its document during navigation. */ }
}
function stopGoogleVoiceMonitor() {
  if (googleVoiceMonitorTimer) clearInterval(googleVoiceMonitorTimer);
  googleVoiceMonitorTimer = null;
  googleVoiceSnapshot = null;
  if (googleVoiceWindow && !googleVoiceWindow.isDestroyed()) googleVoiceWindow.destroy();
  googleVoiceWindow = null;
}
function openGoogleVoiceWindow() {
  if (!googleVoiceWindow || googleVoiceWindow.isDestroyed()) {
    googleVoiceWindow = new BrowserWindow({
      show: false,
      width: 960,
      height: 720,
      title: 'Google Voice background monitor',
      webPreferences: { partition: googleVoicePartition, contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    googleVoiceWindow.webContents.setWindowOpenHandler(({ url }) => {
      try { if (new URL(url).origin === 'https://voice.google.com' || new URL(url).origin === 'https://accounts.google.com') googleVoiceWindow.loadURL(url); } catch {}
      return { action: 'deny' };
    });
    googleVoiceWindow.webContents.on('did-finish-load', () => { googleVoiceSnapshot = null; inspectGoogleVoice(); });
    googleVoiceWindow.on('close', (event) => {
      if (!isQuitting && readGoogleVoiceSettings().enabled) { event.preventDefault(); googleVoiceWindow.hide(); }
    });
    googleVoiceWindow.on('closed', () => { googleVoiceWindow = null; });
    googleVoiceWindow.loadURL(googleVoiceUrl);
  }
  googleVoiceWindow.show();
  googleVoiceWindow.focus();
  return googleVoiceStatus();
}
function googleVoiceViewBounds() {
  if (!mainWindow || !googleVoiceView) return;
  const [width, height] = mainWindow.getContentSize();
  googleVoiceView.setBounds(googleVoiceViewVisible
    // Keep the left navigation available, but let Voice cover the app header
    // and use the complete remaining height so two scroll regions do not stack.
    ? { x: 210, y: 0, width: Math.max(1, width - 210), height: Math.max(1, height) }
    : { x: 0, y: 0, width: 1, height: 1 });
}
function setGoogleVoiceViewVisible(visible) {
  googleVoiceViewVisible = Boolean(visible);
  if (mainWindow && googleVoiceView) {
    if (googleVoiceViewVisible && !googleVoiceViewAttached) {
      mainWindow.contentView.addChildView(googleVoiceView);
      googleVoiceViewAttached = true;
    } else if (!googleVoiceViewVisible && googleVoiceViewAttached) {
      mainWindow.contentView.removeChildView(googleVoiceView);
      googleVoiceViewAttached = false;
    }
  }
  googleVoiceViewBounds();
  if (!googleVoiceViewVisible) academyBounds();
  return googleVoiceViewVisible;
}
function createGoogleVoiceView() {
  googleVoiceView = new electron.WebContentsView({
    webPreferences: { partition: googleVoicePartition, contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  googleVoiceView.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const origin = new URL(url).origin;
      if (origin === 'https://voice.google.com' || origin === 'https://accounts.google.com') googleVoiceView.webContents.loadURL(url);
    } catch {}
    return { action: 'deny' };
  });
  googleVoiceView.webContents.on('will-navigate', (event, url) => {
    try {
      const origin = new URL(url).origin;
      if (origin !== 'https://voice.google.com' && origin !== 'https://accounts.google.com') event.preventDefault();
    } catch { event.preventDefault(); }
  });
  googleVoiceView.webContents.on('context-menu', (_event, params) => showGoogleVoiceContextMenu(params));
  googleVoiceView.webContents.loadURL(googleVoiceUrl);
  googleVoiceViewBounds();
}
function startGoogleVoiceMonitor() {
  if (!readGoogleVoiceSettings().enabled) return googleVoiceStatus();
  openGoogleVoiceWindow();
  googleVoiceWindow.hide();
  if (!googleVoiceMonitorTimer) googleVoiceMonitorTimer = setInterval(() => inspectGoogleVoice(), 5000);
  return googleVoiceStatus();
}
function setGoogleVoiceEnabled(enabled) {
  writeGoogleVoiceSettings({ enabled: Boolean(enabled) });
  if (enabled) return startGoogleVoiceMonitor();
  stopGoogleVoiceMonitor();
  return googleVoiceStatus();
}
function createGoogleVoiceTray() {
  if (googleVoiceTray) return;
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
  googleVoiceTray = new Tray(icon);
  googleVoiceTray.setToolTip('Claude Architect · Google Voice monitor');
  googleVoiceTray.on('double-click', () => { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); } });
  googleVoiceTray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Claude Architect', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Open Google Voice', click: () => openGoogleVoiceWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]));
}
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
const openRouterCredentialsPath = () => path.join(app.getPath('userData'), 'openrouter-credentials.json');
function readStoredOpenRouterCredentials() { try { const parsed = JSON.parse(fs.readFileSync(openRouterCredentialsPath(), 'utf8')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function readOpenRouterApiKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const stored = readStoredOpenRouterCredentials();
  if (!stored.apiKey || !safeStorage.isEncryptionAvailable()) return '';
  try { return safeStorage.decryptString(Buffer.from(stored.apiKey, 'base64')); } catch { return ''; }
}
function saveOpenRouterApiKey(value) {
  const apiKey = typeof value === 'string' ? value.trim().slice(0, 500) : '';
  if (!apiKey) throw new Error('Enter an OpenRouter API key.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable. Restart the app before saving the OpenRouter key.');
  const destination = openRouterCredentialsPath();
  const temporary = `${destination}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify({ apiKey: safeStorage.encryptString(apiKey).toString('base64') }), { mode: 0o600 });
  fs.renameSync(temporary, destination);
  return openRouterStatus();
}
function migrateOpenRouterEnvironmentKey() {
  // `.env` is convenient during development but can be replaced when another local integration is configured.
  // Preserve an already-approved environment key in OS-backed storage so all Electron launches keep working.
  if (!process.env.OPENROUTER_API_KEY || readStoredOpenRouterCredentials().apiKey || !safeStorage.isEncryptionAvailable()) return;
  saveOpenRouterApiKey(process.env.OPENROUTER_API_KEY);
}
function clearOpenRouterApiKey() { try { fs.rmSync(openRouterCredentialsPath(), { force: true }); } catch {} return openRouterStatus(); }
function openRouterStatus() { return { configured: Boolean(readOpenRouterApiKey()), secureStorageAvailable: safeStorage.isEncryptionAvailable(), environmentConfigured: Boolean(process.env.OPENROUTER_API_KEY) }; }
const emailCredentialsPath = () => path.join(app.getPath('userData'), 'email-credentials.json');
const gmailOAuthCredentialsPath = () => path.join(app.getPath('userData'), 'gmail-oauth-client-credentials.json');
function readStoredGmailOAuthCredentials() { try { const parsed = JSON.parse(fs.readFileSync(gmailOAuthCredentialsPath(), 'utf8')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function readGmailOAuthCredentials() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET || '';
  if (clientId) return { clientId, clientSecret, environmentConfigured: true };
  const stored = readStoredGmailOAuthCredentials();
  if (!stored.clientId || !safeStorage.isEncryptionAvailable()) return { clientId: '', clientSecret: '', environmentConfigured: false };
  try { return { clientId: safeStorage.decryptString(Buffer.from(stored.clientId, 'base64')), clientSecret: stored.clientSecret ? safeStorage.decryptString(Buffer.from(stored.clientSecret, 'base64')) : '', environmentConfigured: false }; } catch { return { clientId: '', clientSecret: '', environmentConfigured: false }; }
}
function gmailOAuthStatus() { const credentials = readGmailOAuthCredentials(); return { configured: Boolean(credentials.clientId), environmentConfigured: credentials.environmentConfigured, secureStorageAvailable: safeStorage.isEncryptionAvailable() }; }
function saveGmailOAuthCredentials(input = {}) {
  const existing = readGmailOAuthCredentials();
  const clientId = typeof input.clientId === 'string' ? input.clientId.trim().slice(0, 500) : '';
  const clientSecret = typeof input.clientSecret === 'string' ? input.clientSecret.trim().slice(0, 500) : '';
  if (!clientId && !existing.clientId) throw new Error('Enter a Google OAuth client ID.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable. Restart the app before saving Google OAuth settings.');
  const encrypt = (value) => value ? safeStorage.encryptString(value).toString('base64') : '';
  const destination = gmailOAuthCredentialsPath(); const temporary = `${destination}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify({ clientId: encrypt(clientId || existing.clientId), clientSecret: encrypt(clientSecret || existing.clientSecret) }), { mode: 0o600 });
  fs.renameSync(temporary, destination);
  return gmailOAuthStatus();
}
function clearGmailOAuthCredentials() { try { fs.rmSync(gmailOAuthCredentialsPath(), { force: true }); } catch {} return gmailOAuthStatus(); }
function readEmailCredentials() {
  try {
    const stored = JSON.parse(fs.readFileSync(emailCredentialsPath(), 'utf8'));
    if (!safeStorage.isEncryptionAvailable()) return { provider: 'gmail', email: stored?.email || '', configured: false, secureStorageAvailable: false };
    const decrypt = (value) => value ? safeStorage.decryptString(Buffer.from(value, 'base64')) : '';
    const accessToken = decrypt(stored?.accessToken);
    const refreshToken = decrypt(stored?.refreshToken);
    return { provider: 'gmail', email: stored.email || '', accessToken, refreshToken, expiresAt: Number(stored.expiresAt) || 0, configured: Boolean(accessToken || refreshToken), secureStorageAvailable: true };
  } catch { return { provider: 'gmail', email: '', accessToken: '', refreshToken: '', expiresAt: 0, configured: false, secureStorageAvailable: safeStorage.isEncryptionAvailable() }; }
}
function saveEmailCredentials(input = {}) {
  const accessToken = typeof input.accessToken === 'string' ? input.accessToken.trim() : '';
  const refreshToken = typeof input.refreshToken === 'string' ? input.refreshToken.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().slice(0, 320) : '';
  if (!accessToken && !refreshToken) throw new Error('A Gmail OAuth access token or refresh token is required.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable; Gmail credentials were not saved.');
  const destination = emailCredentialsPath();
  const temporary = destination + '.tmp-' + process.pid;
  let stored = {};
  try { stored = JSON.parse(fs.readFileSync(destination, 'utf8')); } catch {}
  const encrypt = (value) => value ? safeStorage.encryptString(value).toString('base64') : '';
  fs.writeFileSync(temporary, JSON.stringify({ email: email || stored.email || '', accessToken: accessToken ? encrypt(accessToken) : (stored.accessToken || ''), refreshToken: refreshToken ? encrypt(refreshToken) : (stored.refreshToken || ''), expiresAt: Number.isFinite(Number(input.expiresAt)) ? Number(input.expiresAt) : (accessToken ? 0 : (Number(stored.expiresAt) || 0)) }), { mode: 0o600 });
  fs.renameSync(temporary, destination);
  return { provider: 'gmail', email: email || stored.email || '', configured: true, secureStorageAvailable: true };
}
function clearEmailCredentials() { try { fs.rmSync(emailCredentialsPath(), { force: true }); } catch {} return { provider: 'gmail', email: '', configured: false, secureStorageAvailable: safeStorage.isEncryptionAvailable() }; }
async function connectGmailWithGoogle() {
  const { clientId, clientSecret } = readGmailOAuthCredentials();
  if (!clientId) throw new Error('Google sign-in is not configured. Add a Google OAuth client ID in Workspace Settings.');
  const pkce = createPkcePair();
  const state = crypto.randomBytes(24).toString('hex');
  const server = http.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
  const callback = new Promise((resolve, reject) => {
    server.on('request', (request, response) => {
      const url = new URL(request.url, redirectUri);
      if (url.pathname !== '/oauth2callback') return;
      if (url.searchParams.get('state') !== state) { response.end('Invalid OAuth state. You can close this window.'); reject(new Error('Gmail OAuth state validation failed.')); return; }
      if (url.searchParams.get('error')) { response.end('Google sign-in was cancelled. You can close this window.'); reject(new Error('Google sign-in was cancelled.')); return; }
      response.end('Gmail connected. You can close this window.');
      resolve(url.searchParams.get('code'));
    });
  });
  const authWindow = new BrowserWindow({ parent: mainWindow, modal: true, width: 520, height: 760, title: 'Connect Gmail', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await authWindow.loadURL(buildGmailAuthorizationUrl({ clientId, redirectUri, state, codeChallenge: pkce.challenge }));
    const code = await Promise.race([callback, new Promise((_, reject) => authWindow.once('closed', () => reject(new Error('Google sign-in window was closed.'))))]);
    const tokens = await exchangeGmailAuthorizationCode({ code, clientId, clientSecret, redirectUri, codeVerifier: pkce.verifier });
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    const profile = profileResponse.ok ? await profileResponse.json() : {};
    saveEmailCredentials({ email: profile.email || '', ...tokens });
    return { provider: 'gmail', email: profile.email || '', configured: true, secureStorageAvailable: true };
  } finally { server.close(); if (!authWindow.isDestroyed()) authWindow.close(); }
}
async function syncJobEmails() {
  let credentials = readEmailCredentials();
  if (!credentials.configured) return { ok: false, configured: false, imported: 0, message: 'Connect Gmail before syncing.' };
  const refresh = async () => {
    const { clientId, clientSecret } = readGmailOAuthCredentials();
    const next = await refreshGmailAccessToken({ refreshToken: credentials.refreshToken, clientId, clientSecret });
    credentials = { ...credentials, ...next };
    saveEmailCredentials({ email: credentials.email, accessToken: next.accessToken, expiresAt: next.expiresAt });
  };
  if (!tokenIsUsable(credentials)) {
    if (!credentials.refreshToken) return { ok: false, configured: true, imported: 0, message: 'Gmail access token expired. Add a refresh token to resume unattended monitoring.' };
    try { await refresh(); } catch (cause) { return { ok: false, configured: true, imported: 0, message: cause.message }; }
  }
  const request = async (url) => {
    let response = await fetch(url, { headers: { Authorization: `Bearer ${credentials.accessToken}` } });
    if (response.status === 401 && credentials.refreshToken) {
      try { await refresh(); } catch (cause) { return { response, refreshError: cause }; }
      response = await fetch(url, { headers: { Authorization: `Bearer ${credentials.accessToken}` } });
    }
    return { response };
  };
  const listedRequest = await request('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=newer_than:30d');
  const listResponse = listedRequest.response;
  if (!listResponse.ok) return { ok: false, configured: true, imported: 0, message: listedRequest.refreshError?.message || `Gmail sync failed (${listResponse.status}). Add a valid refresh token if the access token expired.` };
  const listed = await listResponse.json();
  const uniqueMessages = [...new Map((listed.messages || []).filter((item) => item?.id).map((item) => [String(item.id), item])).values()];
  const pipelineSignals = coachDatabase.jobs.list().flatMap((job) => [job.company, job.roleTitle, job.contactName, job.contactEmail, job.url, job.canonicalUrl, job.applicationUrl]);
  let imported = 0;
  for (const item of uniqueMessages) {
    const { response } = await request(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`);
    if (!response.ok) continue;
    coachDatabase.email.upsert({ provider: 'gmail', ...normalizeGmailMessage(await response.json(), { pipelineSignals }) });
    imported += 1;
  }
  return { ok: true, configured: true, imported, retrieved: uniqueMessages.length, jobRelated: coachDatabase.email.list({ jobOnly: true, limit: 200 }).length, syncedAt: new Date().toISOString() };
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
// Individual callers retain small defaults. The final job selector explicitly
// opts into this higher ceiling so it can return one complete JSON response.
const OPENROUTER_MAX_REQUEST_OUTPUT_TOKENS = 20_000;
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
  const apiKey = readOpenRouterApiKey();
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
      body: JSON.stringify({ model, messages: validateOpenRouterMessages(messages), temperature: 0.3, max_tokens: Math.min(Number(options.max_tokens) || OPENROUTER_MAX_OUTPUT_TOKENS, OPENROUTER_MAX_REQUEST_OUTPUT_TOKENS), ...(options.response_format ? { response_format: options.response_format } : {}) })
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
const validateJobDetailId = (value) => validateCoachId(value, 'job id');
async function importJobFromUrl(value) {
  if (typeof value !== 'string' || value.length > 2000) throw new Error('Enter a valid job-listing URL.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a valid job-listing URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || /^(localhost|127\.|0\.0\.0\.0|\[::1\])$/i.test(url.hostname)) throw new Error('Use a public HTTP(S) job-listing URL.');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { Accept: 'text/html,application/xhtml+xml' } });
    if (!response.ok) throw new Error(`The listing returned HTTP ${response.status}.`);
    if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') || '')) throw new Error('That link did not return a web job listing.');
    const imported = parseJobListing((await response.text()).slice(0, 2_000_000), response.url || url.toString());
    if (!imported.roleTitle && !imported.company) throw new Error('We could not identify job details on that page. You can still add the opportunity manually.');
    return imported;
  } catch (cause) {
    if (cause?.name === 'AbortError') throw new Error('The listing took too long to load. Add the details manually or try again.');
    throw cause;
  } finally { clearTimeout(timeout); }
}
const validateJobFollowUp = (input) => { if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid follow-up task.'); validateJobDetailId(input.jobId); if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 500) throw new Error('Invalid follow-up title.'); if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new Error('Invalid follow-up due date.'); if (input.sourceEmailId !== undefined && input.sourceEmailId !== null) validateCoachId(input.sourceEmailId, 'email id'); return input; };
const validateJobCalendarEvent = (input) => { if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid calendar event.'); validateJobDetailId(input.jobId); if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 500) throw new Error('Invalid calendar event title.'); for (const field of ['startsAt', 'endsAt']) if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > 80) throw new Error(`Invalid calendar event ${field}.`); return input; };
async function interpretJobEmail(input = {}) {
  validateJobDetailId(input.jobId); validateCoachId(input.emailId, 'email id');
  const email = coachDatabase.email.get(input.emailId); if (!email || !email.linkedJobIds.includes(input.jobId)) throw new Error('Choose an email linked to this job.');
  const job = coachDatabase.jobs.list().find((entry) => entry.id === input.jobId); if (!job) throw new Error('Pipeline job not found.');
  const response = await openRouterChat([
    { role: 'system', content: 'Interpret one job-search email. Return JSON only: {"summary":"","signal":"interview|rejection|offer|next_step|none","recommendedStage":"target|researching|ready|applied|screen|interviewing|final|offer|accepted|rejected|null","followUpTitle":"","followUpDate":"YYYY-MM-DD or null","confidence":"low|medium|high"}. Do not invent facts. A recommendation never applies changes.' },
    { role: 'user', content: JSON.stringify({ job: { company: job.company, roleTitle: job.roleTitle, stage: job.stage }, email: { subject: email.subject, sender: email.sender, receivedAt: email.received_at || email.receivedAt, body: String(email.body || '').slice(0, 12000) } }) }
  ], { auditPurpose: 'job_email_interpretation', response_format: { type: 'json_object' }, max_tokens: 700 });
  if (!response?.ok) throw new Error(response?.error || 'Could not interpret the job email.');
  let interpretation; try { interpretation = JSON.parse(response.message?.content || '{}'); } catch { throw new Error('The AI response was not valid JSON.'); }
  const stage = interpretation.recommendedStage === null ? null : interpretation.recommendedStage;
  if (stage !== null && !JOB_STAGES.has(stage)) interpretation.recommendedStage = null;
  if (!['interview', 'rejection', 'offer', 'next_step', 'none'].includes(interpretation.signal)) interpretation.signal = 'none';
  if (!['low', 'medium', 'high'].includes(interpretation.confidence)) interpretation.confidence = 'low';
  interpretation.summary = typeof interpretation.summary === 'string' ? interpretation.summary.slice(0, 2000) : '';
  interpretation.followUpTitle = typeof interpretation.followUpTitle === 'string' ? interpretation.followUpTitle.slice(0, 500) : '';
  interpretation.followUpDate = typeof interpretation.followUpDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(interpretation.followUpDate) ? interpretation.followUpDate : null;
  coachDatabase.jobs.activity.record(input.jobId, 'email_interpreted', `AI interpreted “${email.subject || 'Untitled email'}”.`, { emailId: email.id, signal: interpretation.signal, confidence: interpretation.confidence });
  return interpretation;
}
async function generateInterviewQuestions(input = {}) {
  const jobId = validateJobDetailId(input.jobId); const job = coachDatabase.jobs.list().find((entry) => entry.id === jobId); if (!job) throw new Error('Saved job not found.');
  const response = await openRouterChat([
    { role: 'system', content: 'Generate five concise, thoughtful questions a candidate should ask an interviewer about the role. Return JSON only: {"questions":[{"questionText":"","provenance":["ai_generated"]}]}. Ground every question in the supplied job details; do not invent company facts, benefits, or processes.' },
    { role: 'user', content: JSON.stringify({ company: job.company, roleTitle: job.roleTitle, location: job.location, description: String(job.description || '').slice(0, 12000), notes: String(job.notes || '').slice(0, 4000) }) }
  ], { auditPurpose: 'interview_question_generation', response_format: { type: 'json_object' }, max_tokens: 900 });
  if (!response?.ok) throw new Error(response?.error || 'Could not generate interview questions.');
  let parsed; try { parsed = JSON.parse(response.message?.content || '{}'); } catch { throw new Error('The AI response was not valid JSON.'); }
  return (Array.isArray(parsed.questions) ? parsed.questions : []).slice(0, 8).map((question) => ({ questionText: String(question.questionText || '').trim().slice(0, 2000), provenance: ['ai_generated'] })).filter((question) => question.questionText);
}
const APPLICATION_STATUSES = new Set(['drafting', 'documents_ready', 'in_progress', 'needs_user_input', 'ready_for_review', 'ready_to_submit', 'submitted', 'withdrawn', 'blocked']);
const validateApplicationId = (value) => validateCoachId(value, 'application id');
const validateApplicationTransition = (input) => { if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid application transition.'); validateApplicationId(input.id); if (!APPLICATION_STATUSES.has(input.status) || input.status === 'submitted') throw new Error('Invalid application status.'); return input; };
const validateApplicationAnswer = (input) => { if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid application answer.'); if (input.applicationId !== undefined && input.applicationId !== null) validateApplicationId(input.applicationId); if (typeof input.questionKey !== 'string' || !input.questionKey.trim() || input.questionKey.length > 160) throw new Error('Invalid answer question key.'); if (input.provenance !== undefined && (!Array.isArray(input.provenance) || input.provenance.length > 20)) throw new Error('Invalid answer provenance.'); return input; };
const documentGenerationInFlight = new Set();
async function generateApplicationDocument(input = {}) {
  const applicationId = validateApplicationId(input.applicationId); const documentType = input.documentType;
  if (!['resume', 'cover_letter'].includes(documentType)) throw new Error('Invalid document type.');
  if (input.guidance !== undefined && (typeof input.guidance !== 'string' || input.guidance.length > 2000)) throw new Error('Document guidance must be 2,000 characters or fewer.');
  const key = `${applicationId}:${documentType}`; if (documentGenerationInFlight.has(key)) throw new Error('Document generation is already in progress.'); documentGenerationInFlight.add(key);
  try {
    const application = coachDatabase.applications.get(applicationId); if (!application) throw new Error('Application not found.');
    const job = coachDatabase.jobs.list().find((entry) => entry.id === application.jobId); if (!job) throw new Error('Saved job not found.');
    const profile = coachDatabase.profiles.getCurrent() || {}; const resume = coachDatabase.resumes.getMaster() || {}; const evidenceCatalog = buildEvidenceCatalog(profile, resume);
    const response = await openRouterChat(buildGenerationMessages({ documentType, job, profile, resume, evidenceCatalog, guidance: input.guidance || '' }), { auditPurpose: 'application_document_generation', response_format: { type: 'json_object' }, max_tokens: 5000 });
    if (!response?.ok) throw new Error(response?.error || 'OpenRouter document generation failed.');
    let content; try { content = normalizeGeneratedContent(documentType, JSON.parse(response.message?.content || '')); } catch { throw new Error('OpenRouter returned malformed document JSON.'); }
    const validation = validateGeneratedDocument(documentType, content, evidenceCatalog, job); const status = validation.errors.length ? 'needs_review' : 'draft';
    return coachDatabase.applications.documents.save({ applicationId, documentType, title: `${job.roleTitle} ${documentType === 'resume' ? 'Resume' : 'Cover Letter'}`, content, validation, provenance: validation.evidenceIds, sourceResumeVersion: resume.version, modelName: response.model, promptVersion: PROMPT_VERSION, status });
  } finally { documentGenerationInFlight.delete(key); }
}
const assertTrustedRenderer = (event) => { if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Untrusted IPC sender.'); };
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

async function captureGoogleVoiceConversation(job) {
  if (!googleVoiceView?.webContents || googleVoiceView.webContents.isDestroyed()) throw new Error('Google Voice is not open.');
  const page = await googleVoiceView.webContents.executeJavaScript(`(() => {
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const selected = clean(window.getSelection?.()?.toString());
    const body = clean(document.body?.innerText);
    const content = (selected.length >= 20 ? selected : body).slice(0, 20000);
    // Use the whole rendered conversation for the assignment key even when a
    // user selected only the message text before choosing “Assign”.
    const phoneNumber = (body.match(/(?:\+?\d[\d\s().-]{6,}\d)/g) || []).find((value) => value.replace(/\D/g, '').length >= 7) || '';
    return { sourceUrl: location.href, title: clean(document.title) || 'Google Voice conversation', content, phoneNumber };
  })()`, true);
  return coachDatabase.jobs.activity.assignGoogleVoiceConversation(job.id, page);
}

function showGoogleVoiceContextMenu(params) {
  const jobs = coachDatabase?.jobs?.list?.() || [];
  const assignmentItems = jobs.length
    ? jobs.slice(0, 50).map((job) => ({ label: `${job.roleTitle || job.title || 'Untitled role'} · ${job.company || 'Unknown company'}`, click: () => captureGoogleVoiceConversation(job).catch((error) => showGoogleVoiceNotification('Google Voice', error.message || 'Could not assign the conversation.')) }))
    : [{ label: 'No active jobs available', enabled: false }];
  const menu = Menu.buildFromTemplate([
    { label: 'Assign conversation to job', submenu: assignmentItems },
    { type: 'separator' },
    { label: 'Back', role: 'goBack', enabled: googleVoiceView.webContents.canGoBack() },
    { label: 'Forward', role: 'goForward', enabled: googleVoiceView.webContents.canGoForward() },
    { label: 'Reload', role: 'reload' },
    { type: 'separator' },
    { label: 'Copy', role: 'copy', enabled: Boolean(params.selectionText?.trim()) }
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
  createGoogleVoiceView();
  applicationBrowser = createApplicationBrowser({
    electron,
    getApplicationUrl: (applicationId) => coachDatabase.applications.get(applicationId)?.applicationUrl || '',
    attachView: (view) => mainWindow?.contentView.addChildView(view),
    detachView: (view) => { try { mainWindow?.contentView.removeChildView(view); } catch {} },
  });
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
  mainWindow.on('resize', googleVoiceViewBounds);
  mainWindow.on('close', (event) => {
    // Keep the Electron process alive when Voice monitoring is enabled. The
    // hidden Google Voice session cannot receive events after the app quits.
    if (!isQuitting && readGoogleVoiceSettings().enabled) { event.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.on('closed', () => { applicationBrowser?.close(); applicationBrowser = null; mainWindow = null; academyView = null; googleVoiceView = null; googleVoiceViewAttached = false; });

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
  ipcMain.handle('coach:jobs:import-url', (event, url) => { assertTrustedRenderer(event); return importJobFromUrl(url); });
  ipcMain.handle('jobs:profile:get', () => coachDatabase.profiles.getCurrent());
  ipcMain.handle('jobs:profile:save', (_event, input) => coachDatabase.profiles.upsert(input));
  ipcMain.handle('jobs:resume:get', () => coachDatabase.resumes.getMaster());
  ipcMain.handle('jobs:resume:save', (_event, input) => coachDatabase.resumes.upsertMaster(input));
  ipcMain.handle('jobs:applications:start', (event, input) => { assertTrustedRenderer(event); return coachDatabase.applications.createOrResume({ jobId: validateCoachId(input?.jobId, 'job id') }); });
  ipcMain.handle('jobs:applications:get', (event, id) => { assertTrustedRenderer(event); return coachDatabase.applications.get(validateApplicationId(id)); });
  ipcMain.handle('jobs:applications:get-for-job', (event, jobId) => { assertTrustedRenderer(event); return coachDatabase.applications.getForJob(validateCoachId(jobId, 'job id')); });
  ipcMain.handle('jobs:applications:list', (event) => { assertTrustedRenderer(event); return coachDatabase.applications.listActive(); });
  ipcMain.handle('jobs:applications:transition', (event, input) => { assertTrustedRenderer(event); return coachDatabase.applications.transition(validateApplicationTransition(input)); });
  ipcMain.handle('jobs:applications:abandon', (event, id) => { assertTrustedRenderer(event); return coachDatabase.applications.abandon(validateApplicationId(id)); });
  ipcMain.handle('jobs:applications:events:list', (event, id) => { assertTrustedRenderer(event); return coachDatabase.applications.listEvents(validateApplicationId(id)); });
  ipcMain.handle('jobs:applications:answers:list', (event, id) => { assertTrustedRenderer(event); return coachDatabase.applications.listAnswers(validateApplicationId(id)); });
  ipcMain.handle('jobs:applications:answers:save', (event, input) => { assertTrustedRenderer(event); return coachDatabase.applications.saveAnswer(validateApplicationAnswer(input)); });
  ipcMain.handle('jobs:interview:questions:generate', async (event, input) => { assertTrustedRenderer(event); return generateInterviewQuestions(input); });
  // The remote WebContentsView is controlled only by this narrow local-renderer API.
  ipcMain.handle('jobs:browser:open', async (event, input) => { assertTrustedRenderer(event); validateApplicationId(input?.applicationId); const result = await applicationBrowser.open({ applicationId: input.applicationId }); applicationBrowser.setBounds(input?.bounds); return result; });
  ipcMain.handle('jobs:browser:close', (event) => { assertTrustedRenderer(event); applicationBrowser.close(); return null; });
  ipcMain.handle('jobs:browser:bounds', (event, bounds) => { assertTrustedRenderer(event); applicationBrowser.setBounds(bounds); return applicationBrowser.publicState(); });
  ipcMain.handle('jobs:browser:snapshot', async (event, applicationId) => { assertTrustedRenderer(event); validateApplicationId(applicationId); return applicationBrowser.publicState(); });
  ipcMain.handle('jobs:browser:rescan', async (event) => { assertTrustedRenderer(event); await applicationBrowser.inspect(); return applicationBrowser.publicState(); });
  const browserProfile = () => { const state = applicationBrowser.publicState(); const profile = coachDatabase.profiles.getCurrent() || {}; return { ...profile, reusableAnswers: state?.applicationId ? coachDatabase.applications.listAnswers(state.applicationId).filter((answer) => answer.scope === 'global' && answer.approvalStatus === 'approved') : [] }; };
  ipcMain.handle('jobs:browser:build-fill-plan', async (event) => { assertTrustedRenderer(event); return applicationBrowser.createFillPlan(browserProfile()); });
  ipcMain.handle('jobs:browser:fill-plan', async (event, planId) => { assertTrustedRenderer(event); if (typeof planId !== 'string' || !/^fill-plan-[A-Za-z0-9-]{1,160}$/.test(planId)) throw new Error('Invalid fill plan.'); return applicationBrowser.fillPlan(planId, browserProfile()); });
  ipcMain.handle('jobs:browser:approve-host', async (event, host) => { assertTrustedRenderer(event); if (typeof host !== 'string' || !/^[a-z0-9.-]{1,253}$/i.test(host)) throw new Error('Invalid navigation host.'); return applicationBrowser.approveHost(host); });
  ipcMain.handle('jobs:browser:back', (event) => { assertTrustedRenderer(event); return applicationBrowser.goBack(); });
  ipcMain.handle('jobs:browser:forward', (event) => { assertTrustedRenderer(event); return applicationBrowser.goForward(); });
  ipcMain.handle('jobs:browser:reload', (event) => { assertTrustedRenderer(event); return applicationBrowser.reload(); });
  ipcMain.handle('jobs:browser:clear-session', async (event) => { assertTrustedRenderer(event); await applicationBrowser.clearSession(); return { ok: true }; });
  ipcMain.handle('jobs:applications:confirm-submission', (event, input) => { assertTrustedRenderer(event); validateApplicationId(input?.applicationId); if (!input?.userAcknowledged) throw new Error('Confirm that the employer page shows a received/submitted message first.'); return coachDatabase.applications.completeSubmission({ applicationId: input.applicationId, userAcknowledged: true, confirmationNumber: typeof input.confirmationNumber === 'string' ? input.confirmationNumber : '', confirmationUrl: applicationBrowser.publicState()?.currentUrl || '', nextAction: 'Watch email for an employer response.', followUpDate: typeof input.followUpDate === 'string' ? input.followUpDate : '' }); });
  ipcMain.handle('jobs:documents:generate', async (event, input) => { assertTrustedRenderer(event); return generateApplicationDocument(input); });
  ipcMain.handle('jobs:documents:list', (event, input) => { assertTrustedRenderer(event); return coachDatabase.applications.documents.list(validateApplicationId(input?.applicationId), input?.documentType); });
  ipcMain.handle('jobs:documents:get', (event, id) => { assertTrustedRenderer(event); return coachDatabase.applications.documents.get(validateCoachId(id, 'document id')); });
  ipcMain.handle('jobs:documents:save-edit', (event, input) => { assertTrustedRenderer(event); const current = coachDatabase.applications.documents.get(validateCoachId(input?.id, 'document id')); if (!current) throw new Error('Document not found.'); const application = coachDatabase.applications.get(current.applicationId); const job = application && coachDatabase.jobs.list().find((entry) => entry.id === application.jobId); if (!job) throw new Error('Saved job not found.'); const evidenceCatalog = buildEvidenceCatalog(coachDatabase.profiles.getCurrent() || {}, coachDatabase.resumes.getMaster() || {}); const content = input?.content && typeof input.content === 'object' && !Array.isArray(input.content) ? input.content : current.content; const validation = validateGeneratedDocument(current.documentType, content, evidenceCatalog, job); return coachDatabase.applications.documents.save({ applicationId: current.applicationId, documentType: current.documentType, title: current.title, content, validation, provenance: validation.evidenceIds, sourceResumeVersion: current.sourceResumeVersion, modelName: current.modelName, promptVersion: current.promptVersion, status: validation.errors.length ? 'needs_review' : 'draft' }); });
  ipcMain.handle('jobs:documents:validate', (event, id) => { assertTrustedRenderer(event); const doc = coachDatabase.applications.documents.get(validateCoachId(id, 'document id')); if (!doc) throw new Error('Document not found.'); return doc.validation; });
  ipcMain.handle('jobs:documents:approve', (event, id) => { assertTrustedRenderer(event); return coachDatabase.applications.documents.approve(validateCoachId(id, 'document id')); });
  ipcMain.handle('jobs:documents:select', (event, id) => { assertTrustedRenderer(event); return coachDatabase.applications.documents.select(validateCoachId(id, 'document id')); });
  ipcMain.handle('jobs:documents:export-text', async (event, id) => { assertTrustedRenderer(event); const doc = coachDatabase.applications.documents.get(validateCoachId(id, 'document id')); if (!doc) throw new Error('Document not found.'); const plainText = doc.plainText || renderPlainText(doc.documentType, doc.content); if (!plainText.trim() || plainText.trim() === 'undefined') throw new Error('This document has no exportable text. Regenerate or save it before exporting.'); const chosen = await dialog.showSaveDialog(mainWindow, { title: 'Export plain-text document', defaultPath: `${doc.documentType}-v${doc.version}.txt`, filters: [{ name: 'Plain text', extensions: ['txt'] }] }); if (chosen.canceled || !chosen.filePath) return { canceled: true }; fs.writeFileSync(chosen.filePath, plainText, 'utf8'); return { document: coachDatabase.applications.documents.markExport(id, { textPath: chosen.filePath }), savedPath: chosen.filePath }; });
  ipcMain.handle('jobs:documents:export-pdf', async (event, id) => { assertTrustedRenderer(event); const doc = coachDatabase.applications.documents.get(validateCoachId(id, 'document id')); if (!doc) throw new Error('Document not found.'); const htmlText = doc.htmlText || renderHtml(doc.documentType, doc.content); if (!htmlText.trim() || htmlText.trim() === 'undefined' || !renderPlainText(doc.documentType, doc.content).trim()) throw new Error('This document has no exportable content. Regenerate or save it before exporting.'); const chosen = await dialog.showSaveDialog(mainWindow, { title: 'Export ATS-friendly PDF', defaultPath: `${doc.documentType}-v${doc.version}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (chosen.canceled || !chosen.filePath) return { canceled: true }; const pdfWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } }); try { await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlText)}`); const data = await pdfWindow.webContents.printToPDF({ printBackground: false, pageSize: 'Letter', margins: { marginType: 'default' } }); fs.writeFileSync(chosen.filePath, data); return { document: coachDatabase.applications.documents.markExport(id, { pdfPath: chosen.filePath }), savedPath: chosen.filePath }; } finally { if (!pdfWindow.isDestroyed()) pdfWindow.destroy(); } });
  ipcMain.handle('jobs:ai:get', () => openRouterStatus());
  ipcMain.handle('jobs:ai:save', (_event, input) => saveOpenRouterApiKey(input?.apiKey));
  ipcMain.handle('jobs:ai:clear', () => clearOpenRouterApiKey());
  ipcMain.handle('jobs:source:get', () => jobSourceStatus());
  ipcMain.handle('jobs:source:save', (_event, input) => saveJobSourceCredentials(input));
  ipcMain.handle('jobs:source:clear', () => clearJobSourceCredentials());
  ipcMain.handle('jobs:source:test', async () => {
    const source = jobSourceStatus();
    if (source.decryptionFailed || !source.secureStorageAvailable) return { ok: false, results: [{ provider: 'Saved credentials', ok: false, code: 'credential_unavailable', message: source.warning || 'Saved credentials could not be decrypted in this Electron process. Restart the app before testing again.' }] };
    const credentials = readJobSourceCredentials(); const results = [];
    if (credentials.usajobsEmail && credentials.usajobsApiKey) results.push({ provider: 'USAJOBS', ...(await testUsaJobs(credentials)) });
    else results.push({ provider: 'USAJOBS', ok: false, code: 'not_configured', message: 'USAJOBS email and API key are not both configured in this Electron process.' });
    if (credentials.adzunaAppId && credentials.adzunaApiKey) results.push({ provider: 'Adzuna', ...(await testAdzuna(credentials)) });
    else results.push({ provider: 'Adzuna', ok: false, code: 'not_configured', message: 'Adzuna app ID and API key are not both configured in this Electron process.' });
    return { ok: results.every((result) => result.ok), results };
  });
  ipcMain.handle('jobs:search:attempts', (_event, runId) => coachDatabase.listJobSearchAttempts(String(runId || '').slice(0, 160)));
  ipcMain.handle('jobs:search:api-calls', (_event, runId) => coachDatabase.listApiCalls(String(runId || '').slice(0, 160)));
  ipcMain.handle('jobs:search:ranking-batches', (_event, runId) => coachDatabase.listJobSearchRankingBatches(String(runId || '').slice(0, 160)));
  ipcMain.handle('email:source:get', () => { const { accessToken, refreshToken, ...safe } = readEmailCredentials(); return safe; });
  ipcMain.handle('email:oauth:get', () => gmailOAuthStatus());
  ipcMain.handle('email:oauth:save', (_event, input) => saveGmailOAuthCredentials(input));
  ipcMain.handle('email:oauth:clear', () => clearGmailOAuthCredentials());
  ipcMain.handle('email:source:connect', () => connectGmailWithGoogle());
  ipcMain.handle('email:source:save', (_event, input) => saveEmailCredentials(input));
  ipcMain.handle('email:source:clear', () => clearEmailCredentials());
  ipcMain.handle('email:sync', () => syncJobEmails());
  ipcMain.handle('email:open-gmail', (event, input = {}) => {
    assertTrustedRenderer(event);
    const messageId = String(input.threadId || input.externalId || '').trim();
    if (!/^[A-Za-z0-9_-]+$/.test(messageId)) throw new Error('This email does not have a valid Gmail message link.');
    const url = `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(messageId)}`;
    return shell.openExternal(url).then(() => ({ ok: true, url }));
  });
  ipcMain.handle('email:list', (_event, options) => coachDatabase.email.list(options || {}));
  ipcMain.handle('email:search', (_event, query, limit) => coachDatabase.email.search(String(query || '').slice(0, 500), Math.min(20, Number(limit) || 10)));
  ipcMain.handle('email:link', (_event, input) => coachDatabase.email.link(input || {}));
  ipcMain.handle('email:unlink', (_event, input) => coachDatabase.email.unlink(input || {}));
  ipcMain.handle('email:exclude', (_event, input) => coachDatabase.email.setExcluded(input || {}));
  ipcMain.handle('email:seen', (_event, input) => coachDatabase.email.markSeen(input || {}));
  ipcMain.handle('email:sender:block', (_event, input) => coachDatabase.email.blockSender(input || {}));
  ipcMain.handle('email:sender:unblock', (_event, input) => coachDatabase.email.unblockSender(input || {}));
  ipcMain.handle('email:sender:blocked:list', () => coachDatabase.email.listBlockedSenders());
  ipcMain.handle('jobs:detail:emails:list', (event, jobId) => { assertTrustedRenderer(event); return coachDatabase.email.listForJob(validateJobDetailId(jobId)); });
  ipcMain.handle('jobs:detail:emails:seen', (event, jobId) => { assertTrustedRenderer(event); return coachDatabase.email.markJobSeen(validateJobDetailId(jobId)); });
  ipcMain.handle('jobs:detail:activity:list', (event, jobId) => { assertTrustedRenderer(event); return coachDatabase.jobs.activity.list(validateJobDetailId(jobId)); });
  ipcMain.handle('jobs:detail:activity:seen', (event, jobId) => { assertTrustedRenderer(event); return coachDatabase.jobs.activity.markSeen(validateJobDetailId(jobId)); });
  ipcMain.handle('jobs:detail:follow-ups:list', (event, jobId) => { assertTrustedRenderer(event); return coachDatabase.jobs.followUps.list(validateJobDetailId(jobId)); });
  ipcMain.handle('jobs:detail:follow-ups:create', (event, input) => { assertTrustedRenderer(event); return coachDatabase.jobs.followUps.create(validateJobFollowUp(input)); });
  ipcMain.handle('jobs:detail:follow-ups:complete', (event, input) => { assertTrustedRenderer(event); validateCoachId(input?.id, 'follow-up task id'); return coachDatabase.jobs.followUps.complete(input.id, Boolean(input.completed)); });
  ipcMain.handle('jobs:detail:calendar:list', (event, jobId) => { assertTrustedRenderer(event); return coachDatabase.jobs.calendar.list(validateJobDetailId(jobId)); });
  ipcMain.handle('jobs:detail:calendar:create', (event, input) => { assertTrustedRenderer(event); return coachDatabase.jobs.calendar.create(validateJobCalendarEvent(input)); });
  ipcMain.handle('jobs:detail:email:interpret', async (event, input) => { assertTrustedRenderer(event); return interpretJobEmail(input || {}); });
  setAuditPersistence((entry) => coachDatabase.recordApiCall(entry));
  ipcMain.handle('jobs:search', async (_event, input = {}) => {
    const profile = coachDatabase.profiles.getCurrent();
    const resume = coachDatabase.resumes.getMaster();
    if (!profile?.targetRoles?.length && !profile?.targetLocations?.length && !profile?.interests?.length) return { ok: false, needsProfile: true, error: 'Add a target role, location, or interest to your profile first.' };
    const runId = coachDatabase.createJobSearchRun();
    setAuditRun(runId);
    let plan;
    try {
      plan = process.env.HERMES_AI_SEARCH_PLANNING !== 'false'
        ? await createSearchPlan({ profile, resume, targetIntent: profile.targetRoles?.[0], refinement: input?.refinement, openRouter: (messages, options) => openRouterChat(messages, { ...options, auditPurpose: 'planning' }) })
        : fallbackPlan(profile, resume);
    } catch (cause) {
      const warning = cause?.message || 'AI search planning failed.';
      coachDatabase.recordJobSearchAttempt({ runId, provider: 'openrouter', laneId: 'search-planner', query: 'AI provider plan', request: { stage: 'planning' }, errorCode: cause?.code || 'search_planning_failed', errorMessage: warning, errorDetail: 'No provider request was sent because the AI planner did not produce a valid plan.', preview: [] });
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
        if (!ranked.length) {
          // An empty but valid AI response is still a failed usable-selection
          // outcome. Keep its zero selected count, but display the best
          // deterministic candidates so the report and cards agree.
          const diagnostics = ranked.rankingDiagnostics || null;
          rankingError = { code: 'ai_returned_no_qualifying_selections', message: 'Final AI returned no qualifying selections; showing the best retrieved candidates.', diagnostics };
          rankingStatus = 'unavailable';
          ranked = found.jobs.slice().sort((a, b) => (Number(b.retrievalScore) || 0) - (Number(a.retrievalScore) || 0) || String(a.externalId).localeCompare(String(b.externalId))).map((job) => ({ job, externalId: job.externalId, fitScore: Number.isFinite(Number(job.retrievalScore)) ? Math.round(Number(job.retrievalScore)) : null, requirementsMatchScore: null, candidateMatchScore: null, scoreType: 'deterministic', fitTier: 'deterministic candidate', strengths: [], gaps: ['Final AI did not return a qualifying selection; review the listing manually.'], unknowns: [], reasoning: 'Retrieved successfully. Final AI returned no qualifying selection, so this best-ranked candidate is shown for review.' }));
        } else rankingStatus = ranked.rankingDiagnostics?.underSelected ? 'under_selected' : 'available';
      } catch (cause) {
        rankingError = { code: cause?.code || 'ai_ranking_failed', message: cause?.message || 'AI job ranking failed.', diagnostics: cause?.rankingDiagnostics || null };
        rankingStatus = 'unavailable';
        // Retrieval already produced usable jobs. Do not throw them away when the
        // optional AI selector times out, returns incomplete JSON, or fails.
        ranked = found.jobs.map((job) => ({
          job,
          externalId: job.externalId,
          fitScore: Number.isFinite(Number(job.retrievalScore)) ? Math.round(Number(job.retrievalScore)) : null,
          requirementsMatchScore: null,
          candidateMatchScore: null,
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
  ipcMain.handle('google-voice:get', () => googleVoiceStatus());
  ipcMain.handle('google-voice:set-enabled', (_event, enabled) => setGoogleVoiceEnabled(Boolean(enabled)));
  ipcMain.handle('google-voice:open', () => openGoogleVoiceWindow());
  ipcMain.handle('google-voice:set-visible', (_event, visible) => setGoogleVoiceViewVisible(visible));
  ipcMain.handle('google-voice:test-notification', () => { showGoogleVoiceNotification('Google Voice monitor', 'Desktop notifications are working.'); return { ok: true }; });
}

app.whenReady().then(() => {
  migrateOpenRouterEnvironmentKey();
  coachDatabase = createDatabase({ userDataPath: app.getPath('userData'), seedPath: roadmapSeedPath });
  registerDatabaseIpc();
  // Poll only after a token has been explicitly configured; syncing is read-only
  // and failures are intentionally isolated so the desktop app stays available.
  emailMonitorTimer = setInterval(() => { if (readEmailCredentials().configured) syncJobEmails().catch(() => {}); }, 10 * 60 * 1000);
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
  createGoogleVoiceTray();
  if (readGoogleVoiceSettings().enabled) startGoogleVoiceMonitor();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { isQuitting = true; if (emailMonitorTimer) clearInterval(emailMonitorTimer); stopGoogleVoiceMonitor(); try { googleVoiceTray?.destroy(); } catch {} try { coachDatabase?.close(); } catch { /* best effort */ } });

module.exports = { isAllowedAcademyUrl };
