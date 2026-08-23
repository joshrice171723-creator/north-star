const { normalizeSnapshot, INSPECTION_SCRIPT } = require('./application-inspector.cjs');
const { buildFillPlan, validatePlanForFill } = require('./application-fill-engine.cjs');
const { detectConfirmation } = require('./application-confirmation.cjs');
const redactUrl = (value) => { try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return ''; } };
const isHttps = (value) => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
function decideNavigation({ fromUrl, toUrl, isMainFrame = true, approvedHosts = new Set() }) { if (!isMainFrame || !isHttps(toUrl)) return { action: 'deny', reason: 'only_main_frame_https' }; const target = new URL(toUrl); if (!fromUrl || new URL(fromUrl).origin === target.origin || approvedHosts.has(target.host)) return { action: 'allow', reason: 'same_or_approved_origin' }; return { action: 'ask_user', reason: 'new_https_host', host: target.host }; }

function buildContextMenuTemplate({ params = {}, webContents, clipboard }) {
  const editFlags = params.editFlags || {};
  const hasSelection = Boolean(params.selectionText?.trim());
  const hasLink = Boolean(params.linkURL);
  // Invoke editing commands on the isolated employer page itself. A role-only
  // menu can target the React window instead when a WebContentsView has focus.
  return [
    { label: 'Back', enabled: Boolean(webContents.canGoBack()), click: () => webContents.goBack() },
    { label: 'Forward', enabled: Boolean(webContents.canGoForward()), click: () => webContents.goForward() },
    { label: 'Reload', click: () => webContents.reload() },
    { type: 'separator' },
    { label: 'Cut', enabled: Boolean(params.isEditable && editFlags.canCut), click: () => webContents.cut() },
    { label: 'Copy', enabled: Boolean(hasSelection || editFlags.canCopy), click: () => webContents.copy() },
    { label: 'Paste', enabled: Boolean(params.isEditable && editFlags.canPaste), click: () => webContents.paste() },
    { label: 'Select all', enabled: editFlags.canSelectAll !== false, click: () => webContents.selectAll() },
    { type: 'separator' },
    { label: 'Copy link address', enabled: hasLink, click: () => clipboard.writeText(params.linkURL) },
  ];
}

function handleMouseNavigationInput(input, webContents) {
  if (input?.type !== 'mouseDown') return false;
  const button = input.mouseButton || input.button;
  if (button === 'back') {
    if (webContents.canGoBack()) webContents.goBack();
    return true;
  }
  if (button === 'forward') {
    if (webContents.canGoForward()) webContents.goForward();
    return true;
  }
  return false;
}

function createApplicationBrowser({ electron, getApplicationUrl, attachView = () => {}, detachView = () => {}, onSnapshot = () => {}, onState = () => {} }) {
  const { WebContentsView, session, Menu, clipboard } = electron; let view = null; let active = null;
  const hide = () => { if (view) view.setBounds({ x: 0, y: 0, width: 1, height: 1 }); };
  const inspect = async () => { if (!view || view.webContents.isDestroyed()) return null; const snapshot = normalizeSnapshot(await view.webContents.executeJavaScript(INSPECTION_SCRIPT, true)); active.snapshot = snapshot; active.lastObservedAt = new Date().toISOString(); onSnapshot(active); return snapshot; };
  const open = async ({ applicationId }) => { const initialUrl = getApplicationUrl(applicationId); if (!isHttps(initialUrl)) throw new Error('The saved application URL must use HTTPS.'); close(); active = { applicationId, initialHost: new URL(initialUrl).host, approvedHosts: new Set([new URL(initialUrl).host]), snapshot: null, plans: new Map(), currentUrl: redactUrl(initialUrl), status: 'navigating' };
    view = new WebContentsView({ webPreferences: { partition: 'persist:job-application-copilot', contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } }); attachView(view);
    const appSession = session.fromPartition('persist:job-application-copilot');
    // Both handlers are installed because Chromium may consult either path depending on API.
    appSession.setPermissionCheckHandler(() => false); appSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    const requestNavigation = async (url, isMainFrame = true) => {
      const decision = decideNavigation({ fromUrl: view.webContents.getURL(), toUrl: url, isMainFrame, approvedHosts: active.approvedHosts });
      if (decision.action === 'allow') return view.webContents.loadURL(url);
      if (decision.action === 'ask_user') {
        // Application providers commonly hand off from a job board to a separate
        // ATS host. Approve that HTTPS handoff automatically within this isolated
        // session so the user is not interrupted mid-apply.
        active.approvedHosts.add(decision.host);
        return view.webContents.loadURL(url);
      }
      return null;
    };
    // Remote pages never receive a second window. A user-triggered target=_blank link
    // is routed through the same isolated view and the normal host checkpoint instead.
    view.webContents.setWindowOpenHandler(({ url }) => { requestNavigation(url, true).catch(() => {}); return { action: 'deny' }; });
    view.webContents.on('before-input-event', (event, input) => {
      // Electron reports mouse side buttons as navigation input. Consume them
      // here so the isolated employer page owns history instead of the shell.
      if (handleMouseNavigationInput(input, view.webContents)) event.preventDefault();
    });
    view.webContents.on('context-menu', (_event, params) => {
      Menu.buildFromTemplate(buildContextMenuTemplate({ params, webContents: view.webContents, clipboard })).popup();
    });
    const guard = (event, url, details = {}) => { const decision = decideNavigation({ fromUrl: view.webContents.getURL(), toUrl: url, isMainFrame: details.isMainFrame !== false, approvedHosts: active.approvedHosts }); if (decision.action !== 'allow') { event.preventDefault(); requestNavigation(url, details.isMainFrame !== false).catch(() => {}); } };
    view.webContents.on('will-navigate', guard); view.webContents.on('will-redirect', guard); view.webContents.on('did-finish-load', async () => { active.currentUrl = redactUrl(view.webContents.getURL()); active.status = 'observing'; try { await inspect(); onState(active); } catch { onState({ ...active, error: 'Inspection was unavailable for this page.' }); } });
    await view.webContents.loadURL(initialUrl); return publicState(); };
  const approveHost = async (host) => { if (!active?.pendingHost || host !== active.pendingHost || !active.pendingUrl) throw new Error('No matching navigation approval is pending.'); const pendingUrl = active.pendingUrl; active.approvedHosts.add(host); active.pendingHost = ''; active.pendingUrl = ''; await view.webContents.loadURL(pendingUrl); return publicState(); };
  const createFillPlan = async (profile, aiDecisions = {}, diagnostics = {}) => { if (!active) throw new Error('Open an application page before building a fill plan.'); const snapshot = await inspect(); const plan = buildFillPlan({ sessionId: active.applicationId, applicationId: active.applicationId, pageFingerprint: snapshot.pageFingerprint, fields: snapshot.fields, profile, aiDecisions, diagnostics }); active.plans.set(plan.id, plan); return plan; };
  const fillPlan = async (planId, profile = {}) => {
    if (!active?.plans.has(planId)) throw new Error('Fill plan not found. Build and review a new plan.');
    const plan = active.plans.get(planId); const snapshot = await inspect();
    const permitted = validatePlanForFill({ plan, currentPageFingerprint: snapshot.pageFingerprint, fields: snapshot.fields, profile });
    const byFingerprint = new Map(snapshot.fields.map((field) => [field.fieldFingerprint, field]));
    const operations = permitted.filter((entry) => entry.action === 'fill' && entry.displayValue).map((entry) => ({ ...entry, field: byFingerprint.get(entry.fieldFingerprint) })).filter((entry) => entry.field && (['input', 'textarea'].includes(entry.field.elementType) && ['text', 'email', 'tel', 'url', 'number', 'date', 'search', 'textarea', ''].includes(entry.field.inputType) || entry.field.elementType === 'select'));
    if (!operations.length) return { attempted: 0, results: [], reason: 'No approved supported fields are currently eligible.' };
    const debuggerClient = view.webContents.debugger; let attached = false; const results = [];
    try {
      if (!debuggerClient.isAttached()) { debuggerClient.attach('1.3'); attached = true; }
      const documentRef = await debuggerClient.sendCommand('Runtime.evaluate', { expression: 'document', returnByValue: false });
      // CDP contract: arguments: [{ value: operations }] is represented by a
      // per-operation structured argument below so each live field is rechecked.
      // Re-query the live DOM for every field. React/Vue employer forms can replace
      // sibling controls after input/change, making one bulk query stale after field one.
      for (const operation of operations) {
        const currentSnapshot = await inspect();
        const currentField = currentSnapshot.fields.find((field) => field.fieldFingerprint === operation.fieldFingerprint);
        if (!currentField) { results.push({ fieldFingerprint: operation.fieldFingerprint, status: 'failed', reason: 'field_changed' }); continue; }
        const currentPlan = { ...plan, pageFingerprint: currentSnapshot.pageFingerprint };
        const currentEntry = validatePlanForFill({ plan: currentPlan, currentPageFingerprint: currentSnapshot.pageFingerprint, fields: currentSnapshot.fields, profile }).find((entry) => entry.fieldFingerprint === operation.fieldFingerprint);
        if (!currentEntry?.displayValue) { results.push({ fieldFingerprint: operation.fieldFingerprint, status: 'blocked', reason: currentEntry?.reasonCode || 'field_changed' }); continue; }
        const result = await debuggerClient.sendCommand('Runtime.callFunctionOn', { objectId: documentRef.result.objectId, returnByValue: true, functionDeclaration: `function (op) { const clean = (v) => String(v || '').replace(/\\s+/g, ' ').trim(); const label = (el) => { const linked = el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); return clean(linked?.innerText || el.closest('label')?.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder')); }; const candidates = Array.from(document.querySelectorAll('input,select,textarea')).filter((el) => el.type !== 'hidden' && el.tagName.toLowerCase() === op.field.elementType && (el.tagName.toLowerCase() === 'select' || String(el.type || '').toLowerCase() === op.field.inputType)); const matches = candidates.filter((el) => { const sameLabel = !op.field.label || label(el) === op.field.label; const sameId = op.field.id && el.id === op.field.id; const sameName = op.field.name && clean(el.name) === op.field.name; const sameAutocomplete = op.field.autocomplete && clean(el.autocomplete) === op.field.autocomplete; return sameLabel && (sameId || sameName || sameAutocomplete || (!op.field.id && !op.field.name && !op.field.autocomplete)); }); if (matches.length !== 1) return { fieldFingerprint: op.fieldFingerprint, status: 'failed', reason: 'ambiguous_or_changed' }; const el = matches[0]; if (el.disabled || el.readOnly || String(el.value || '').trim()) return { fieldFingerprint: op.fieldFingerprint, status: 'skipped', reason: 'protected_or_user_entered' }; if (el.tagName.toLowerCase() === 'select') { const wanted = clean(op.displayValue).toLowerCase(); const option = Array.from(el.options).find((item) => clean(item.text).toLowerCase() === wanted || clean(item.value).toLowerCase() === wanted); if (!option) return { fieldFingerprint: op.fieldFingerprint, status: 'failed', reason: 'option_not_found' }; el.value = option.value; } else { const prototype = el.tagName.toLowerCase() === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set; if (!setter) return { fieldFingerprint: op.fieldFingerprint, status: 'failed', reason: 'value_setter_unavailable' }; setter.call(el, op.displayValue); } el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); const verified = el.tagName.toLowerCase() === 'select' ? clean(el.options[el.selectedIndex]?.text || el.value).toLowerCase() === clean(op.displayValue).toLowerCase() || clean(el.value).toLowerCase() === clean(op.displayValue).toLowerCase() : String(el.value) === op.displayValue; return { fieldFingerprint: op.fieldFingerprint, status: verified ? 'filled' : 'failed', reason: verified ? 'verified' : 'rejected' }; }`, arguments: [{ value: { ...operation, field: { ...currentField, id: currentField.id || operation.field.id, name: currentField.name || operation.field.name, autocomplete: currentField.autocomplete || operation.field.autocomplete }, displayValue: currentEntry.displayValue } }] });
        results.push(result.result.value || { fieldFingerprint: operation.fieldFingerprint, status: 'failed', reason: 'no_result' });
      }
      await inspect(); return { attempted: operations.length, results };
    } finally { if (attached && debuggerClient.isAttached()) debuggerClient.detach(); }
  };
  const executeOnDocument = async (functionDeclaration, argument) => {
    if (!view || view.webContents.isDestroyed()) throw new Error('The application browser is not open.');
    const debuggerClient = view.webContents.debugger; let attached = false;
    try {
      if (!debuggerClient.isAttached()) { debuggerClient.attach('1.3'); attached = true; }
      const documentRef = await debuggerClient.sendCommand('Runtime.evaluate', { expression: 'document', returnByValue: false });
      const result = await debuggerClient.sendCommand('Runtime.callFunctionOn', { objectId: documentRef.result.objectId, returnByValue: true, functionDeclaration, arguments: [{ value: argument }] });
      return result.result?.value;
    } finally { if (attached && debuggerClient.isAttached()) debuggerClient.detach(); }
  };
  const uploadDocuments = async (files = {}) => {
    const requested = ['resume', 'cover_letter'].filter((type) => typeof files[type] === 'string' && files[type].trim());
    if (!requested.length) throw new Error('No approved application document was provided.');
    const snapshot = await inspect();
    const results = [];
    for (const documentType of requested) {
      const result = await executeOnDocument(`function (type) { const clean = (v) => String(v || '').replace(/\\s+/g, ' ').trim().toLowerCase(); const inputs = Array.from(document.querySelectorAll('input[type="file"]')).filter((el) => !el.disabled && !el.readOnly); const match = inputs.find((el) => { const text = clean((el.id || '') + ' ' + (el.name || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.closest('label')?.innerText || '')); return type === 'resume' ? /resume|cv/.test(text) : /cover|letter|writing sample/.test(text); }); if (!match && inputs.length === 1) return { status: 'candidate', inputCount: 1 }; if (!match) return { status: 'missing' }; return { status: 'ready', selector: match.id ? '#' + CSS.escape(match.id) : '', inputCount: inputs.length }; }`, documentType);
      if (!['ready', 'candidate'].includes(result?.status)) { results.push({ documentType, status: result?.status || 'missing', pageFingerprint: snapshot.pageFingerprint }); continue; }
      const debuggerClient = view.webContents.debugger; let attached = false;
      try {
        if (!debuggerClient.isAttached()) { debuggerClient.attach('1.3'); attached = true; }
        const documentRef = await debuggerClient.sendCommand('Runtime.evaluate', { expression: 'document', returnByValue: false });
        const node = await debuggerClient.sendCommand('Runtime.callFunctionOn', { objectId: documentRef.result.objectId, returnByValue: false, functionDeclaration: `function (type) { const clean = (v) => String(v || '').replace(/\\s+/g, ' ').trim().toLowerCase(); return Array.from(document.querySelectorAll('input[type="file"]')).find((el) => { const text = clean((el.id || '') + ' ' + (el.name || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.closest('label')?.innerText || '')); return type === 'resume' ? /resume|cv/.test(text) : /cover|letter|writing sample/.test(text); }) || (document.querySelectorAll('input[type="file"]').length === 1 ? document.querySelector('input[type="file"]') : null); }`, arguments: [{ value: documentType }] });
        if (!node.result?.objectId) throw new Error('The document upload control changed.');
        await debuggerClient.sendCommand('DOM.getDocument');
        const { nodeId } = await debuggerClient.sendCommand('DOM.requestNode', { objectId: node.result.objectId });
        await debuggerClient.sendCommand('DOM.setFileInputFiles', { nodeId, files: [files[documentType]] });
        results.push({ documentType, status: 'uploaded', pageFingerprint: snapshot.pageFingerprint });
      } finally { if (attached && debuggerClient.isAttached()) debuggerClient.detach(); }
    }
    await inspect(); return { results };
  };
  const advance = async () => {
    const snapshot = await inspect();
    const candidate = snapshot.fields.find((field) => field.elementType === 'button' && field.category === 'navigation' && /^(next|continue|save and continue|proceed|review)$/i.test(field.label));
    if (!candidate) return { status: 'blocked', reason: 'next_control_not_found', pageFingerprint: snapshot.pageFingerprint };
    const result = await executeOnDocument(`function (field) { const clean = (v) => String(v || '').replace(/\\s+/g, ' ').trim(); const buttons = Array.from(document.querySelectorAll('button,input[type="button"],a[role="button"]')).filter((el) => !el.disabled); const matches = buttons.filter((el) => clean(el.innerText || el.value || el.getAttribute('aria-label')) === field.label); if (matches.length !== 1) return { status: 'blocked', reason: 'next_control_changed' }; const el = matches[0]; el.focus(); el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); return { status: 'activated' }; }`, candidate);
    if (result?.status !== 'activated') return result || { status: 'blocked', reason: 'next_control_failed' };
    await new Promise((resolve) => setTimeout(resolve, 150));
    const nextSnapshot = await inspect(); return { status: 'advanced', previousPageFingerprint: snapshot.pageFingerprint, pageFingerprint: nextSnapshot.pageFingerprint };
  };
  const activate = async ({ url = '', code = '' } = {}) => {
    if (!active) throw new Error('Open the employer application before activating the account.');
    if (url) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !active.approvedHosts.has(parsed.host)) throw new Error('The activation link is not an approved HTTPS employer host.');
      await view.webContents.loadURL(url);
      return { status: 'activated', method: 'link' };
    }
    if (!code) return { status: 'blocked', reason: 'activation_payload_missing' };
    const result = await executeOnDocument(`function (activationCode) { const clean = (v) => String(v || '').replace(/\\s+/g, ' ').trim(); const controls = Array.from(document.querySelectorAll('input')).filter((el) => !el.disabled && !el.readOnly && el.type !== 'hidden'); const matches = controls.filter((el) => /activation|verification|verify|confirmation|one.?time|otp|pin|code/i.test(clean((el.id || '') + ' ' + (el.name || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '') + ' ' + (el.closest('label')?.innerText || '')))); if (matches.length !== 1) return { status: 'blocked', reason: matches.length ? 'activation_control_ambiguous' : 'activation_control_not_found' }; const el = matches[0]; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; if (!setter) return { status: 'blocked', reason: 'activation_value_setter_unavailable' }; setter.call(el, activationCode); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); const buttons = Array.from(document.querySelectorAll('button,input[type="button"],a[role="button"]')).filter((item) => !item.disabled); const activationButtons = buttons.filter((item) => /activate|verify|confirm|continue/i.test(clean(item.innerText || item.value || item.getAttribute('aria-label')))); if (activationButtons.length === 1) { activationButtons[0].focus(); activationButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); } return { status: 'activated', method: 'code', buttonActivated: activationButtons.length === 1 }; }`, code);
    if (result?.status !== 'activated') return result || { status: 'blocked', reason: 'activation_failed' };
    await new Promise((resolve) => setTimeout(resolve, 150));
    const snapshot = await inspect();
    return { status: 'activated', method: 'code', pageFingerprint: snapshot.pageFingerprint };
  };
  const detectConfirmationPage = async () => {
    const snapshot = await inspect();
    // Confirmation detection receives only bounded title, URL, and control
    // labels; page text and field values never leave the isolated view.
    return detectConfirmation({ url: active.currentUrl, title: snapshot.pageTitle, text: snapshot.fields.map((field) => field.label).join(' ') });
  };
  const setBounds = (bounds) => { if (!view) return; const x = Math.max(0, Math.round(bounds?.x || 0)); const y = Math.max(0, Math.round(bounds?.y || 0)); const width = Math.max(1, Math.round(bounds?.width || 1)); const height = Math.max(1, Math.round(bounds?.height || 1)); view.setBounds({ x, y, width, height }); };
  const close = () => { if (view) { detachView(view); try { view.webContents.close(); } catch {} view = null; } active = null; };
  const publicState = () => active ? { applicationId: active.applicationId, status: active.status, initialHost: active.initialHost, currentHost: active.currentUrl ? (() => { try { return new URL(active.currentUrl).host; } catch { return ''; } })() : '', redirectedToExternalHost: Boolean(active.currentUrl && active.initialHost && (() => { try { return new URL(active.currentUrl).host !== active.initialHost; } catch { return false; } })()), currentUrl: active.currentUrl, pendingHost: active.pendingHost || '', snapshot: active.snapshot, lastObservedAt: active.lastObservedAt || null } : null;
  return { open, close, hide, setBounds, inspect, approveHost, createFillPlan, fillPlan, uploadDocuments, advance, activate, detectConfirmationPage, publicState, goBack: () => view?.webContents.canGoBack() && view.webContents.goBack(), goForward: () => view?.webContents.canGoForward() && view.webContents.goForward(), reload: () => view?.webContents.reload(), clearSession: async () => session.fromPartition('persist:job-application-copilot').clearStorageData() };
}
module.exports = { redactUrl, isHttps, decideNavigation, buildContextMenuTemplate, handleMouseNavigationInput, createApplicationBrowser };
