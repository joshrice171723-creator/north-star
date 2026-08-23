const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeSnapshot } = require('../electron/jobs/application-inspector.cjs');
const { classifyField } = require('../electron/jobs/application-policy.cjs');
const { createApplicationBrowser } = require('../electron/jobs/application-browser.cjs');

test('generic application fixture exposes bounded inspection and safe page boundary', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'generic-application-form.json'), 'utf8'));
  const first = normalizeSnapshot(fixture.pages[0]);
  const second = normalizeSnapshot(fixture.pages[1]);
  assert.equal(first.fields.find((field) => field.label === 'Continue').category, 'navigation');
  assert.equal(second.fields.find((field) => field.label === 'Resume').category, 'file_upload');
  assert.equal(second.fields.find((field) => field.label === 'Submit application').category, 'final_submit');
  assert.notEqual(first.pageFingerprint, second.pageFingerprint);
  assert.equal(first.fields.some((field) => Object.hasOwn(field, 'value')), false);
});

test('Stage 2 browser adapter keeps uploads and next-page navigation separate from submission', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'jobs', 'application-browser.cjs'), 'utf8');
  assert.match(source, /DOM\.setFileInputFiles/);
  assert.match(source, /const advance = async/);
  assert.match(source, /category === 'navigation'/);
  assert.doesNotMatch(source, /requestSubmit\(|\.submit\(|\.click\(/);
  assert.equal(classifyField({ elementType: 'button', inputType: 'submit', label: 'Submit application' }), 'final_submit');
});

test('Stage 2 queue handoff opens one claimed application and checkpoints its first page', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(source, /async function startAutonomousApplicationQueue\(\)/);
  assert.match(source, /await applicationBrowser\.open\(\{ applicationId: claimed\.id \}\)/);
  assert.match(source, /externalApplicationUrl \|\| application\?\.applicationUrl/);
  assert.match(source, /\.\.\.application\.automationCheckpoint/);
  assert.match(source, /state: 'failed', checkpoint: \{ stage: 'opening', error: message \}/);
});

test('generic fixture drives adapter inspection, upload, and safe next-page navigation together', async () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'generic-application-form.json'), 'utf8'));
  const EventEmitter = require('node:events');
  let pageIndex = 0;
  const stateEvents = [];
  const webContents = new EventEmitter();
  webContents.isDestroyed = () => false;
  webContents.getURL = () => fixture.pages[pageIndex].url;
  webContents.executeJavaScript = async () => fixture.pages[pageIndex];
  webContents.loadURL = async (url) => { webContents.currentUrl = url; webContents.emit('did-finish-load'); };
  webContents.close = () => {};
  webContents.setWindowOpenHandler = () => {};
  webContents.canGoBack = () => false;
  webContents.canGoForward = () => false;
  webContents.debugger = {
    attached: false,
    isAttached() { return this.attached; },
    attach() { this.attached = true; },
    detach() { this.attached = false; },
    async sendCommand(command, input = {}) {
      if (command === 'Runtime.evaluate') return { result: { objectId: 'document' } };
      if (command === 'Runtime.callFunctionOn' && input.functionDeclaration.includes('input[type="file"]')) {
        if (input.functionDeclaration.includes('return { status:')) return { result: { value: { status: 'ready' } } };
        return { result: { objectId: 'file-input' } };
      }
      if (command === 'Runtime.callFunctionOn' && input.functionDeclaration.includes('const clean = (v)') && input.functionDeclaration.includes('candidates =')) return { result: { value: { fieldFingerprint: 'fixture-field', status: 'filled', reason: 'verified' } } };
      if (command === 'Runtime.callFunctionOn') { pageIndex = Math.min(pageIndex + 1, fixture.pages.length - 1); return { result: { value: { status: 'activated' } } }; }
      if (command === 'DOM.getDocument') return { root: { nodeId: 1 } };
      if (command === 'DOM.requestNode') return { nodeId: 2 };
      if (command === 'DOM.setFileInputFiles') return {};
      throw new Error(`Unexpected CDP command: ${command}`);
    }
  };
  class WebContentsView { constructor() { this.webContents = webContents; } setBounds() {} }
  const electron = {
    WebContentsView,
    session: { fromPartition: () => ({ setPermissionCheckHandler() {}, setPermissionRequestHandler() {} }) },
    Menu: { buildFromTemplate: () => ({ popup() {} }) },
    clipboard: { writeText() {} }
  };
  const adapter = createApplicationBrowser({
    electron,
    getApplicationUrl: () => fixture.pages[0].url,
    onState: (state) => stateEvents.push(state),
    attachView: () => {},
    detachView: () => {}
  });

  const opened = await adapter.open({ applicationId: 'fixture-application' });
  assert.equal(opened.snapshot.pageFingerprint, normalizeSnapshot(fixture.pages[0]).pageFingerprint);
  const plan = await adapter.createFillPlan({ firstName: 'Joshua', email: 'joshua@example.test' });
  const filled = await adapter.fillPlan(plan.id, { firstName: 'Joshua', email: 'joshua@example.test' });
  assert.equal(filled.results.filter((entry) => entry.status === 'filled').length, 2);
  assert.equal((await adapter.advance()).pageFingerprint, normalizeSnapshot(fixture.pages[1]).pageFingerprint);
  const upload = await adapter.uploadDocuments({ resume: 'C:\\approved\\resume.pdf' });
  assert.equal(upload.results[0].status, 'uploaded');
  const advanced = await adapter.advance();
  assert.equal(advanced.status, 'advanced');
  assert.equal(advanced.pageFingerprint, normalizeSnapshot(fixture.pages[2]).pageFingerprint);
  const confirmation = await adapter.detectConfirmationPage();
  assert.equal(confirmation.state, 'confirmed');
  assert.equal(confirmation.confirmationUrlRedacted, 'https://fixture.example/apply/confirmation');
  assert.equal(stateEvents.length > 0, true);
});
