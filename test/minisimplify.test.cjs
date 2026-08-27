'use strict';

// MiniSimplify engine unit + contract tests. The engine itself runs inside a
// browser page; here we pin the compiled source contract (APIs, policy
// handling, decisive-radio logic) and the main-process profile mapping.

const test = require('node:test');
const assert = require('node:assert');
const { buildMiniSimplifySource, buildMiniSimplifyProfile } = require('../electron/jobs/automation/minisimplify.cjs');

const root = require('node:path').join(__dirname, '..');
const read = (p) => require('node:fs').readFileSync(require('node:path').join(root, p), 'utf8');

test('profile mapping flattens the North Star profile onto engine fields', () => {
  const profile = buildMiniSimplifyProfile({ profile: { firstName: 'Josh', lastName: 'Rivera', email: 'josh@example.com', phone: '555-0100', city: 'Austin', state: 'TX', postalCode: '78701', street: '1 Main St', requiresSponsorship: false, veteranStatus: true, openToRelocation: false }, job: { salaryExpectation: '$120k' } });
  assert.equal(profile.fullName, 'Josh Rivera');
  assert.equal(profile.email, 'josh@example.com');
  assert.equal(profile.zip, '78701');
  assert.equal(profile.salary, '$120k');
  assert.equal(profile.sponsor, false);
  assert.equal(profile.veteran, true);
  assert.equal(profile.relocate, false);
  assert.equal(profile.remoteOk, true);
});

test('compiled source is syntactically valid JavaScript with the boot payload baked in', () => {
  const profile = buildMiniSimplifyProfile({ profile: { firstName: 'A', email: 'a@b.co' } });
  const source = buildMiniSimplifySource({ profile, policy: { route: 'autopilot', force: false } });
  assert.doesNotThrow(() => new Function(source), 'compiled MiniSimplify source must parse');
  assert.ok(source.includes('"firstName":"A"'), 'profile must be injected into the boot payload');
  assert.ok(source.includes('"route":"autopilot"'), 'policy must be injected into the boot payload');
});

test('engine pins the agreed fill policy and safety behavior', () => {
  const source = buildMiniSimplifySource({ profile: {}, policy: {} });
  // Headless document injection (no native dialog) — the autopilot enabler.
  assert.match(source, /fillFileFromBase64/);
  assert.match(source, /DataTransfer/);
  // Autopilot overwrites stale values; assistant fills empties unless forced.
  assert.match(source, /overwriteText = POLICY\.route === 'autopilot' \|\| POLICY\.force === true/);
  assert.match(source, /kept\.push/);
  // Select support.
  assert.match(source, /setSelect/);
  // Decisive-evidence-only radios; undecided groups are reported, not guessed.
  assert.match(source, /decisive/);
  assert.match(source, /undecided\.push/);
  // Post-upload verification helper stays available.
  assert.match(source, /inspectFiles/);
});

test('engine never fills fields whose question text is unrecoverable', () => {
  const source = buildMiniSimplifySource({ profile: {}, policy: {} });
  // Hash-only or framework-internal hints (React state keys like page.label,
  // hex hashes like b8af6f) must not classify as fillable fields.
  assert.match(source, /plainIdentifier/, 'plain-identifier gate for name/id attributes');
  assert.match(source, /readableText/, 'readable-text gate for visible labels');
  assert.match(source, /if \(!visible\.length && !identifiers\.length\) return null;/);
  // data-automation-id counts as vendor-applied label evidence.
  assert.match(source, /data-automation-id/);
});

test('document slot discovery pierces shadow DOM and includes hidden inputs', () => {
  const source = buildMiniSimplifySource({ profile: {}, policy: {} });
  assert.match(source, /function fileInputs\(\)/, 'shared collector for light DOM and open shadow roots');
  assert.match(source, /shadowRoot/);
  assert.match(source, /slotContextLabel/);
  assert.match(source, /checkVisibility/, 'hidden slots are reported with an accurate visibility flag');
  // Both injection and inspection use the same discovery path.
  const uses = source.match(/fileInputs\(\)/g) || [];
  assert.ok(uses.length >= 2, 'fillFileFromBase64 and inspectFiles must share fileInputs()');
});

test('EEO self-identification groups are reported as skipped, never clicked', () => {
  const source = buildMiniSimplifySource({ profile: {}, policy: {} });
  assert.match(source, /eeo_self_identification/);
  assert.match(source, /eeoGroup\.test\(g\)/);
});

test('multi-step progress detection exposes step position and safe Next controls', () => {
  const source = buildMiniSimplifySource({ profile: {}, policy: {} });
  assert.match(source, /detectProgress/);
  assert.match(source, /nextControlPresent/);
});

test('main process wires the engine into both routes behind the shared channel', () => {
  const main = read('electron/main.cjs');
  assert.match(main, /require\('\.\/jobs\/automation\/minisimplify\.cjs'\)/);
  assert.match(main, /jobs:browser:minisimplify/);
  assert.match(main, /minisimplifyScanAndFill\(\{ applicationId, route: 'autopilot' \}/);
  assert.match(main, /minisimplifyAttachDocuments\(\{ applicationId, route: 'autopilot'/);
  assert.match(main, /event: 'minisimplify_scan'/);
  assert.match(main, /event: 'minisimplify_documents'/);
  // Legacy native-picker upload remains as fallback when injection finds nothing.
  assert.match(main, /uploadResults\.some\(\(entry\) => entry\.status === 'uploaded'\)/);
});

test('document bytes ship as bounded chunks, never one giant evaluate payload', () => {
  const main = read('electron/main.cjs');
  // The chunked sender exists with a hard per-call bound (256k chars).
  assert.match(main, /MINISIMPLIFY_CHUNK_CHARS = \d+/);
  assert.match(main, /sendBase64ToPage/);
  assert.doesNotMatch(main, /fillFileFromBase64\(\$\{JSON\.stringify\(file\.b64\)\}/, 'the full base64 blob must never be embedded in a single executeJavaScript call');
  // In-page failures surface their real message into the pipeline log.
  assert.match(main, /runScriptSafe/);
  assert.match(main, /event: 'minisimplify_attach_failed', applicationId, route, documentType, stage: 'transfer'/);
});

test('renderer exposes the quick actions and the autopilot handoff button', () => {
  const preload = read('electron/preload.cjs');
  assert.match(preload, /minisimplifyApplicationAssistant/);
  const panel = read('src/jobs/ApplicationBrowserPanel.jsx');
  assert.match(panel, /Quick fill page/);
  assert.match(panel, /Refill everything/);
  assert.match(panel, /Attach selected documents/);
  assert.match(panel, /action: 'scanAndFill', route: 'assistant', force/);
  assert.match(panel, /action: 'attachDocuments', route: 'assistant'/);
  const drawer = read('src/jobs/ApplicationQueueDrawer.jsx');
  assert.match(drawer, /Open in assistant/);
  assert.match(drawer, /onOpenWorkflowJob/);
  const jobsView = read('src/JobsView.jsx');
  assert.match(jobsView, /onOpenWorkflowJob=\{openWorkflowJob\}/);
  assert.match(jobsView, /'blocked', 'retry_wait'\]\.includes\(entry\.state\)\) void openApplication\(job, 'resume', true\)/);
});

