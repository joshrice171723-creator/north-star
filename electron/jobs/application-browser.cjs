const { normalizeSnapshot, INSPECTION_SCRIPT } = require('./application-inspector.cjs');
const redactUrl = (value) => { try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return ''; } };
const isHttps = (value) => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
function decideNavigation({ fromUrl, toUrl, isMainFrame = true, approvedHosts = new Set() }) { if (!isMainFrame || !isHttps(toUrl)) return { action: 'deny', reason: 'only_main_frame_https' }; const target = new URL(toUrl); if (!fromUrl || new URL(fromUrl).origin === target.origin || approvedHosts.has(target.host)) return { action: 'allow', reason: 'same_or_approved_origin' }; return { action: 'ask_user', reason: 'new_https_host', host: target.host }; }

function createApplicationBrowser({ electron, getApplicationUrl, attachView = () => {}, detachView = () => {}, onSnapshot = () => {}, onState = () => {} }) {
  const { WebContentsView, session } = electron; let view = null; let active = null;
  const hide = () => { if (view) view.setBounds({ x: 0, y: 0, width: 1, height: 1 }); };
  const inspect = async () => { if (!view || view.webContents.isDestroyed()) return null; const snapshot = normalizeSnapshot(await view.webContents.executeJavaScript(INSPECTION_SCRIPT, true)); active.snapshot = snapshot; active.lastObservedAt = new Date().toISOString(); onSnapshot(active); return snapshot; };
  const open = async ({ applicationId }) => { const initialUrl = getApplicationUrl(applicationId); if (!isHttps(initialUrl)) throw new Error('The saved application URL must use HTTPS.'); close(); active = { applicationId, approvedHosts: new Set([new URL(initialUrl).host]), snapshot: null, currentUrl: redactUrl(initialUrl), status: 'navigating' };
    view = new WebContentsView({ webPreferences: { partition: 'persist:job-application-copilot', contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } }); attachView(view);
    const appSession = session.fromPartition('persist:job-application-copilot');
    // Both handlers are installed because Chromium may consult either path depending on API.
    appSession.setPermissionCheckHandler(() => false); appSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const guard = (event, url, details = {}) => { const decision = decideNavigation({ fromUrl: view.webContents.getURL(), toUrl: url, isMainFrame: details.isMainFrame !== false, approvedHosts: active.approvedHosts }); if (decision.action === 'deny') event.preventDefault(); if (decision.action === 'ask_user') { event.preventDefault(); active.pendingHost = decision.host; onState({ ...active, navigationDecision: decision }); } };
    view.webContents.on('will-navigate', guard); view.webContents.on('will-redirect', guard); view.webContents.on('did-finish-load', async () => { active.currentUrl = redactUrl(view.webContents.getURL()); active.status = 'observing'; try { await inspect(); } catch { onState({ ...active, error: 'Inspection was unavailable for this page.' }); } });
    await view.webContents.loadURL(initialUrl); return publicState(); };
  const approveHost = async (host) => { if (!active?.pendingHost || host !== active.pendingHost) throw new Error('No matching navigation approval is pending.'); active.approvedHosts.add(host); active.pendingHost = ''; await view.webContents.loadURL(`https://${host}`); return publicState(); };
  const setBounds = (bounds) => { if (!view) return; const x = Math.max(0, Math.round(bounds?.x || 0)); const y = Math.max(0, Math.round(bounds?.y || 0)); const width = Math.max(1, Math.round(bounds?.width || 1)); const height = Math.max(1, Math.round(bounds?.height || 1)); view.setBounds({ x, y, width, height }); };
  const close = () => { if (view) { detachView(view); try { view.webContents.close(); } catch {} view = null; } active = null; };
  const publicState = () => active ? { applicationId: active.applicationId, status: active.status, currentUrl: active.currentUrl, pendingHost: active.pendingHost || '', snapshot: active.snapshot, lastObservedAt: active.lastObservedAt || null } : null;
  return { open, close, hide, setBounds, inspect, approveHost, publicState, goBack: () => view?.webContents.canGoBack() && view.webContents.goBack(), goForward: () => view?.webContents.canGoForward() && view.webContents.goForward(), reload: () => view?.webContents.reload(), clearSession: async () => session.fromPartition('persist:job-application-copilot').clearStorageData() };
}
module.exports = { redactUrl, isHttps, decideNavigation, createApplicationBrowser };
