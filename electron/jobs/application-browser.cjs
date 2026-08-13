const { normalizeSnapshot, INSPECTION_SCRIPT } = require('./application-inspector.cjs');
const { buildFillPlan, validatePlanForFill } = require('./application-fill-engine.cjs');
const redactUrl = (value) => { try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return ''; } };
const isHttps = (value) => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
function decideNavigation({ fromUrl, toUrl, isMainFrame = true, approvedHosts = new Set() }) { if (!isMainFrame || !isHttps(toUrl)) return { action: 'deny', reason: 'only_main_frame_https' }; const target = new URL(toUrl); if (!fromUrl || new URL(fromUrl).origin === target.origin || approvedHosts.has(target.host)) return { action: 'allow', reason: 'same_or_approved_origin' }; return { action: 'ask_user', reason: 'new_https_host', host: target.host }; }

function createApplicationBrowser({ electron, getApplicationUrl, attachView = () => {}, detachView = () => {}, onSnapshot = () => {}, onState = () => {} }) {
  const { WebContentsView, session } = electron; let view = null; let active = null;
  const hide = () => { if (view) view.setBounds({ x: 0, y: 0, width: 1, height: 1 }); };
  const inspect = async () => { if (!view || view.webContents.isDestroyed()) return null; const snapshot = normalizeSnapshot(await view.webContents.executeJavaScript(INSPECTION_SCRIPT, true)); active.snapshot = snapshot; active.lastObservedAt = new Date().toISOString(); onSnapshot(active); return snapshot; };
  const open = async ({ applicationId }) => { const initialUrl = getApplicationUrl(applicationId); if (!isHttps(initialUrl)) throw new Error('The saved application URL must use HTTPS.'); close(); active = { applicationId, approvedHosts: new Set([new URL(initialUrl).host]), snapshot: null, plans: new Map(), currentUrl: redactUrl(initialUrl), status: 'navigating' };
    view = new WebContentsView({ webPreferences: { partition: 'persist:job-application-copilot', contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } }); attachView(view);
    const appSession = session.fromPartition('persist:job-application-copilot');
    // Both handlers are installed because Chromium may consult either path depending on API.
    appSession.setPermissionCheckHandler(() => false); appSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    const requestNavigation = async (url, isMainFrame = true) => {
      const decision = decideNavigation({ fromUrl: view.webContents.getURL(), toUrl: url, isMainFrame, approvedHosts: active.approvedHosts });
      if (decision.action === 'allow') return view.webContents.loadURL(url);
      if (decision.action === 'ask_user') {
        // Preserve the exact safe URL. Reconstructing from a host would silently lose
        // the ATS path (which is what a target=_blank Apply link actually needs).
        active.pendingHost = decision.host; active.pendingUrl = url; onState({ ...active, navigationDecision: decision });
      }
      return null;
    };
    // Remote pages never receive a second window. A user-triggered target=_blank link
    // is routed through the same isolated view and the normal host checkpoint instead.
    view.webContents.setWindowOpenHandler(({ url }) => { requestNavigation(url, true).catch(() => {}); return { action: 'deny' }; });
    const guard = (event, url, details = {}) => { const decision = decideNavigation({ fromUrl: view.webContents.getURL(), toUrl: url, isMainFrame: details.isMainFrame !== false, approvedHosts: active.approvedHosts }); if (decision.action !== 'allow') { event.preventDefault(); requestNavigation(url, details.isMainFrame !== false).catch(() => {}); } };
    view.webContents.on('will-navigate', guard); view.webContents.on('will-redirect', guard); view.webContents.on('did-finish-load', async () => { active.currentUrl = redactUrl(view.webContents.getURL()); active.status = 'observing'; try { await inspect(); } catch { onState({ ...active, error: 'Inspection was unavailable for this page.' }); } });
    await view.webContents.loadURL(initialUrl); return publicState(); };
  const approveHost = async (host) => { if (!active?.pendingHost || host !== active.pendingHost || !active.pendingUrl) throw new Error('No matching navigation approval is pending.'); const pendingUrl = active.pendingUrl; active.approvedHosts.add(host); active.pendingHost = ''; active.pendingUrl = ''; await view.webContents.loadURL(pendingUrl); return publicState(); };
  const createFillPlan = async (profile) => { if (!active) throw new Error('Open an application page before building a fill plan.'); const snapshot = await inspect(); const plan = buildFillPlan({ sessionId: active.applicationId, applicationId: active.applicationId, pageFingerprint: snapshot.pageFingerprint, fields: snapshot.fields, profile }); active.plans.set(plan.id, plan); return plan; };
  const fillPlan = async (planId, profile = {}) => { if (!active?.plans.has(planId)) throw new Error('Fill plan not found. Build and review a new plan.'); const snapshot = await inspect(); const plan = active.plans.get(planId); const permitted = validatePlanForFill({ plan, currentPageFingerprint: snapshot.pageFingerprint, fields: snapshot.fields, profile });
    const byFingerprint = new Map(snapshot.fields.map((field) => [field.fieldFingerprint, field])); const operations = permitted.filter((entry) => entry.action === 'fill' && entry.displayValue).map((entry) => ({ ...entry, field: byFingerprint.get(entry.fieldFingerprint) })).filter((entry) => entry.field && ['input', 'textarea'].includes(entry.field.elementType) && ['text', 'email', 'tel', 'url', 'number', 'textarea', ''].includes(entry.field.inputType));
    if (!operations.length) return { attempted: 0, results: [], reason: 'No approved supported fields are currently eligible.' };
    const debuggerClient = view.webContents.debugger; let attached = false;
    try {
      if (!debuggerClient.isAttached()) { debuggerClient.attach('1.3'); attached = true; }
      const documentRef = await debuggerClient.sendCommand('Runtime.evaluate', { expression: 'document', returnByValue: false });
      // Values are structured CDP arguments, not JavaScript source. The static function
      // requires one exact descriptor match and preserves a non-empty user value.
      const result = await debuggerClient.sendCommand('Runtime.callFunctionOn', { objectId: documentRef.result.objectId, returnByValue: true, functionDeclaration: `function (ops) { const clean = (v) => String(v || '').replace(/\\s+/g, ' ').trim(); const label = (el) => { const linked = el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); return clean(linked?.innerText || el.closest('label')?.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder')); }; return ops.map((op) => { const matches = Array.from(document.querySelectorAll('input,textarea')).filter((el) => el.type !== 'hidden' && el.tagName.toLowerCase() === op.field.elementType && String(el.type || '').toLowerCase() === op.field.inputType && clean(el.name) === op.field.name && label(el) === op.field.label); if (matches.length !== 1) return { fieldFingerprint: op.fieldFingerprint, status: 'failed', reason: 'ambiguous_or_changed' }; const el = matches[0]; if (el.disabled || el.readOnly || String(el.value || '').trim()) return { fieldFingerprint: op.fieldFingerprint, status: 'skipped', reason: 'protected_or_user_entered' }; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; setter.call(el, op.displayValue); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return { fieldFingerprint: op.fieldFingerprint, status: String(el.value) === op.displayValue ? 'filled' : 'failed', reason: String(el.value) === op.displayValue ? 'verified' : 'rejected' }; }); }`, arguments: [{ value: operations }] });
      const results = Array.isArray(result.result.value) ? result.result.value : []; await inspect(); return { attempted: operations.length, results };
    } finally { if (attached && debuggerClient.isAttached()) debuggerClient.detach(); }
  };
  const setBounds = (bounds) => { if (!view) return; const x = Math.max(0, Math.round(bounds?.x || 0)); const y = Math.max(0, Math.round(bounds?.y || 0)); const width = Math.max(1, Math.round(bounds?.width || 1)); const height = Math.max(1, Math.round(bounds?.height || 1)); view.setBounds({ x, y, width, height }); };
  const close = () => { if (view) { detachView(view); try { view.webContents.close(); } catch {} view = null; } active = null; };
  const publicState = () => active ? { applicationId: active.applicationId, status: active.status, currentUrl: active.currentUrl, pendingHost: active.pendingHost || '', snapshot: active.snapshot, lastObservedAt: active.lastObservedAt || null } : null;
  return { open, close, hide, setBounds, inspect, approveHost, createFillPlan, fillPlan, publicState, goBack: () => view?.webContents.canGoBack() && view.webContents.goBack(), goForward: () => view?.webContents.canGoForward() && view.webContents.goForward(), reload: () => view?.webContents.reload(), clearSession: async () => session.fromPartition('persist:job-application-copilot').clearStorageData() };
}
module.exports = { redactUrl, isHttps, decideNavigation, createApplicationBrowser };
