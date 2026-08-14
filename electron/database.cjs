const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BetterSqlite3 = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { eq, isNull, and, asc, desc } = require('drizzle-orm');
const { sqliteTable, text, integer, index, uniqueIndex } = require('drizzle-orm/sqlite-core');
const { assertTransition, computeApplicationReadiness, validateAnswer } = require('./jobs/application-domain.cjs');
const { DOCUMENT_TYPES, STATUSES, renderPlainText, renderHtml } = require('./jobs/application-documents.cjs');
const { chunkText, searchChunks, stableEmailId } = require('./job-email-rag.cjs');

const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
  kind: text('kind').notNull().default('project'),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('backlog'),
  priority: text('priority').notNull().default('P1'),
  orderIndex: integer('order_index').notNull().default(0),
  dueDate: text('due_date'),
  nextAction: text('next_action').notNull().default(''),
  definitionOfDone: text('definition_of_done').notNull().default(''),
  blockedReason: text('blocked_reason').notNull().default(''),
  dependencies: text('dependencies').notNull().default(''),
  acceptanceCriteria: text('acceptance_criteria').notNull().default(''),
  securityPrivacyNotes: text('security_privacy_notes').notNull().default(''),
  sourceContext: text('source_context').notNull().default(''),
  confidence: text('confidence').notNull().default(''),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
}, (table) => ({ parentIdx: index('projects_parent_idx').on(table.parentId), statusIdx: index('projects_status_idx').on(table.status), activeIdx: index('projects_active_idx').on(table.archived, table.deletedAt) }));

const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  parentTaskId: text('parent_task_id'),
  releaseId: text('release_id'),
  phaseId: text('phase_id'),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('backlog'),
  priority: text('priority').notNull().default('P1'),
  orderIndex: integer('order_index').notNull().default(0),
  dueDate: text('due_date'),
  nextAction: text('next_action').notNull().default(''),
  definitionOfDone: text('definition_of_done').notNull().default(''),
  blockedReason: text('blocked_reason').notNull().default(''),
  dependencies: text('dependencies').notNull().default(''),
  acceptanceCriteria: text('acceptance_criteria').notNull().default(''),
  securityPrivacyNotes: text('security_privacy_notes').notNull().default(''),
  sourceContext: text('source_context').notNull().default(''),
  confidence: text('confidence').notNull().default(''),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
}, (table) => ({ projectIdx: index('tasks_project_idx').on(table.projectId), statusIdx: index('tasks_status_idx').on(table.status), dueIdx: index('tasks_due_idx').on(table.dueDate), hierarchyIdx: index('tasks_hierarchy_idx').on(table.releaseId, table.phaseId, table.parentTaskId), activeIdx: index('tasks_active_idx').on(table.archived, table.deletedAt) }));

const userSettings = sqliteTable('user_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});
const goals = sqliteTable('goals', {
  id: text('id').primaryKey(), title: text('title').notNull(), description: text('description').notNull().default(''), status: text('status').notNull().default('active'), orderIndex: integer('order_index').notNull().default(0), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), deletedAt: text('deleted_at'),
}, (table) => ({ statusIdx: index('goals_status_idx').on(table.status), activeIdx: index('goals_active_idx').on(table.deletedAt) }));
const checkIns = sqliteTable('check_ins', {
  id: text('id').primaryKey(), checkInDate: text('check_in_date').notNull(), energy: integer('energy'), mood: text('mood'), reflection: text('reflection').notNull().default(''), wins: text('wins').notNull().default(''), blockers: text('blockers').notNull().default(''), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), deletedAt: text('deleted_at'),
}, (table) => ({ dateIdx: index('check_ins_date_idx').on(table.checkInDate), activeIdx: index('check_ins_active_idx').on(table.deletedAt) }));
const notes = sqliteTable('notes', {
  id: text('id').primaryKey(), title: text('title').notNull().default(''), content: text('content').notNull().default(''), entityType: text('entity_type'), entityId: text('entity_id'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), deletedAt: text('deleted_at'),
}, (table) => ({ entityIdx: index('notes_entity_idx').on(table.entityType, table.entityId), activeIdx: index('notes_active_idx').on(table.deletedAt) }));
const briefings = sqliteTable('briefings', {
  id: text('id').primaryKey(), briefingDate: text('briefing_date').notNull(), briefingType: text('briefing_type').notNull().default('daily'), title: text('title').notNull().default(''), content: text('content').notNull().default(''), source: text('source').notNull().default(''), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), deletedAt: text('deleted_at'),
}, (table) => ({ dateIdx: index('briefings_date_idx').on(table.briefingDate), activeIdx: index('briefings_active_idx').on(table.deletedAt) }));
const integrationsMetadata = sqliteTable('integrations_metadata', {
  id: text('id').primaryKey(), provider: text('provider').notNull(), status: text('status').notNull().default('disconnected'), accountLabel: text('account_label').notNull().default(''), metadataJson: text('metadata_json').notNull().default('{}'), lastSyncAt: text('last_sync_at'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), deletedAt: text('deleted_at'),
}, (table) => ({ providerIdx: uniqueIndex('integrations_provider_idx').on(table.provider), statusIdx: index('integrations_status_idx').on(table.status) }));
const calendarEvents = sqliteTable('calendar_events', {
  id: text('id').primaryKey(), provider: text('provider').notNull().default('local'), externalId: text('external_id'), title: text('title').notNull(), description: text('description').notNull().default(''), startsAt: text('starts_at').notNull(), endsAt: text('ends_at').notNull(), location: text('location').notNull().default(''), allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false), metadataJson: text('metadata_json').notNull().default('{}'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), deletedAt: text('deleted_at'),
}, (table) => ({ timeIdx: index('calendar_events_time_idx').on(table.startsAt, table.endsAt), providerIdx: index('calendar_events_provider_idx').on(table.provider, table.externalId), activeIdx: index('calendar_events_active_idx').on(table.deletedAt) }));
const jobOpportunities = sqliteTable('job_opportunities', {
  id: text('id').primaryKey(), company: text('company').notNull(), roleTitle: text('role_title').notNull(), url: text('url').notNull().default(''), location: text('location').notNull().default(''), employmentType: text('employment_type').notNull().default(''), salaryRange: text('salary_range').notNull().default(''), source: text('source').notNull().default(''), stage: text('stage').notNull().default('target'), priority: text('priority').notNull().default('medium'), nextAction: text('next_action').notNull().default(''), followUpDate: text('follow_up_date'), contactName: text('contact_name').notNull().default(''), contactEmail: text('contact_email').notNull().default(''), notes: text('notes').notNull().default(''), appliedAt: text('applied_at'), externalId: text('external_id'), apiSource: text('api_source'), canonicalUrl: text('canonical_url').notNull().default(''), rawDataJson: text('raw_data_json').notNull().default('{}'), description: text('description').notNull().default(''), requirementsJson: text('requirements_json').notNull().default('[]'), postedAt: text('posted_at'), expiresAt: text('expires_at'), salaryMin: integer('salary_min'), salaryMax: integer('salary_max'), salaryCurrency: text('salary_currency').notNull().default('USD'), remoteType: text('remote_type').notNull().default('unknown'), matchScore: integer('match_score'), requirementsMatchScore: integer('requirements_match_score'), candidateMatchScore: integer('candidate_match_score'), fitTier: text('fit_tier'), matchSummary: text('match_summary').notNull().default(''), lastEvaluatedAt: text('last_evaluated_at'), lastSeenAt: text('last_seen_at'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), archived: integer('archived', { mode: 'boolean' }).notNull().default(false), deletedAt: text('deleted_at'),
}, (table) => ({ stageIdx: index('jobs_stage_idx').on(table.stage), followUpIdx: index('jobs_follow_up_idx').on(table.followUpDate), activeIdx: index('jobs_active_idx').on(table.archived, table.deletedAt) }));
const jobApplications = sqliteTable('job_applications', { id: text('id').primaryKey(), jobId: text('job_id').notNull(), status: text('status').notNull(), applicationUrl: text('application_url').notNull(), atsKey: text('ats_key').notNull(), readinessJson: text('readiness_json').notNull(), unresolvedCount: integer('unresolved_count').notNull(), startedAt: text('started_at').notNull(), lastActivityAt: text('last_activity_at').notNull(), submittedAt: text('submitted_at'), confirmationNumber: text('confirmation_number').notNull(), confirmationUrl: text('confirmation_url').notNull(), withdrawnAt: text('withdrawn_at'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), deletedAt: text('deleted_at') });
const jobApplicationAnswers = sqliteTable('job_application_answers', { id: text('id').primaryKey(), applicationId: text('application_id'), questionKey: text('question_key').notNull(), questionText: text('question_text').notNull(), normalizedCategory: text('normalized_category').notNull(), answerText: text('answer_text').notNull(), answerJson: text('answer_json').notNull(), scope: text('scope').notNull(), sensitivity: text('sensitivity').notNull(), approvalStatus: text('approval_status').notNull(), autofillPolicy: text('autofill_policy').notNull(), provenanceJson: text('provenance_json').notNull(), approvedAt: text('approved_at'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), deletedAt: text('deleted_at') });
const jobApplicationEvents = sqliteTable('job_application_events', { id: text('id').primaryKey(), applicationId: text('application_id').notNull(), eventType: text('event_type').notNull(), summary: text('summary').notNull(), metadataJson: text('metadata_json').notNull(), createdAt: text('created_at').notNull() });
const jobApplicationDocuments = sqliteTable('job_application_documents', { id: text('id').primaryKey(), applicationId: text('application_id').notNull(), documentType: text('document_type').notNull(), version: integer('version').notNull(), status: text('status').notNull(), title: text('title').notNull(), contentJson: text('content_json').notNull(), plainText: text('plain_text').notNull(), htmlText: text('html_text').notNull(), provenanceJson: text('provenance_json').notNull(), validationJson: text('validation_json').notNull(), sourceResumeVersion: integer('source_resume_version'), modelName: text('model_name').notNull(), promptVersion: text('prompt_version').notNull(), isSelected: integer('is_selected').notNull(), exportedPdfPath: text('exported_pdf_path').notNull(), exportedTextPath: text('exported_text_path').notNull(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), deletedAt: text('deleted_at') });

const tableMap = { projects, tasks, goals, checkIns, notes, briefings, integrationsMetadata, calendarEvents, jobOpportunities, jobApplications, jobApplicationAnswers, jobApplicationEvents, jobApplicationDocuments };
const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const nonEmpty = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;
const bounded = (value, max = 10000) => String(value ?? '').slice(0, max);
const normalizeEmailSender = (value) => {
  const text = String(value || '').trim().toLowerCase();
  const address = text.match(/<([^>]+)>/)?.[1] || text;
  return address.replace(/^mailto:/, '').trim();
};

function parseCsv(textValue) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < textValue.length; i += 1) {
    const char = textValue[i];
    if (quoted) {
      if (char === '"' && textValue[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter((entry) => entry.some(Boolean)).map((entry) => Object.fromEntries(headers.map((header, index) => [header, entry[index] || ''])));
}

function createDatabase({ userDataPath, seedPath } = {}) {
  if (!userDataPath) throw new Error('A user-data path is required.');
  fs.mkdirSync(userDataPath, { recursive: true });
  const databasePath = path.join(userDataPath, 'executive-coach.sqlite');
  const sqlite = new BetterSqlite3(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  const migrationDir = path.join(__dirname, 'migrations');
  sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(sqlite.prepare('SELECT id FROM schema_migrations').all().map((entry) => entry.id));
  for (const filename of fs.readdirSync(migrationDir).filter((entry) => entry.endsWith('.sql')).sort()) {
    if (applied.has(filename)) continue;
    sqlite.exec(fs.readFileSync(path.join(migrationDir, filename), 'utf8'));
    sqlite.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(filename, now());
  }

  const ordered = (table) => db.select().from(table).orderBy(asc(table.orderIndex), asc(table.createdAt)).all();
  const active = (table) => db.select().from(table).where(and(isNull(table.deletedAt), eq(table.archived, false))).orderBy(asc(table.orderIndex), asc(table.createdAt)).all();
  const allActiveProjects = () => active(projects);
  const allActiveTasks = () => active(tasks);
  const allProjects = () => ordered(projects);
  const allTasks = () => ordered(tasks);
  const insertOrUpdate = (table, record) => db.insert(table).values(record).onConflictDoUpdate({ target: table.id, set: { ...record, id: undefined } }).run();
  const safeRecord = (record, required, label) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`Invalid ${label}.`);
    for (const field of required) if (!nonEmpty(record[field])) throw new Error(`Invalid ${label}: ${field} is required.`);
    return record;
  };

  function projectRecord(input, kind = 'project') {
    const timestamp = now();
    const recordKind = input.kind || input.type || kind;
    return { id: bounded(nonEmpty(input.id, id(recordKind)), 160), parentId: input.parentId || null, kind: recordKind, title: bounded(nonEmpty(input.title, input.name), 500), description: bounded(input.description), status: bounded(nonEmpty(input.status, 'backlog'), 80), priority: bounded(nonEmpty(input.priority, 'P1'), 40), orderIndex: Number.isFinite(input.orderIndex ?? input.order) ? Number(input.orderIndex ?? input.order) : 0, dueDate: input.dueDate || null, nextAction: bounded(input.nextAction), definitionOfDone: bounded(input.definitionOfDone), blockedReason: bounded(input.blockedReason), dependencies: bounded(input.dependencies), acceptanceCriteria: bounded(input.acceptanceCriteria), securityPrivacyNotes: bounded(input.securityPrivacyNotes), sourceContext: bounded(input.sourceContext), confidence: bounded(input.confidence), archived: Boolean(input.archived), createdAt: input.createdAt || timestamp, updatedAt: timestamp, deletedAt: null };
  }
  function validateProjectHierarchy(record, source = db) {
    if (!['workspace', 'project', 'release', 'phase'].includes(record.kind)) throw new Error(`Invalid project kind: ${record.kind}.`);
    if (record.kind === 'workspace') {
      if (record.parentId) throw new Error('A workspace cannot have a parent.');
      return;
    }
    if (!record.parentId) throw new Error(`${record.kind} must belong to its parent.`);
    const parent = source.select().from(projects).where(eq(projects.id, record.parentId)).get();
    if (!parent) throw new Error(`${record.kind} parent does not exist.`);
    const expectedParent = { project: 'workspace', release: 'project', phase: 'release' }[record.kind];
    if (parent.kind !== expectedParent) throw new Error(`${record.kind} must belong to a ${expectedParent}.`);
  }
  function taskRecord(input, kind = 'task') {
    const timestamp = now();
    const recordKind = kind || (input.type === 'subtask' ? 'subtask' : 'task');
    const parentTaskId = recordKind === 'subtask' ? (input.parentTaskId || input.parentId || null) : null;
    return { id: bounded(nonEmpty(input.id, id(recordKind)), 160), projectId: bounded(nonEmpty(input.projectId), 160), parentTaskId, releaseId: input.releaseId || null, phaseId: input.phaseId || null, title: bounded(nonEmpty(input.title, input.name), 500), description: bounded(input.description), status: bounded(nonEmpty(input.status, 'backlog'), 80), priority: bounded(nonEmpty(input.priority, 'P1'), 40), orderIndex: Number.isFinite(input.orderIndex ?? input.order) ? Number(input.orderIndex ?? input.order) : 0, dueDate: input.dueDate || null, nextAction: bounded(input.nextAction), definitionOfDone: bounded(input.definitionOfDone), blockedReason: bounded(input.blockedReason), dependencies: bounded(input.dependencies), acceptanceCriteria: bounded(input.acceptanceCriteria), securityPrivacyNotes: bounded(input.securityPrivacyNotes), sourceContext: bounded(input.sourceContext), confidence: bounded(input.confidence), archived: Boolean(input.archived), createdAt: input.createdAt || timestamp, updatedAt: timestamp, deletedAt: null };
  }
  function jobRecord(input) {
    const timestamp = now();
    return {
      id: bounded(nonEmpty(input.id, id('job')), 160), company: bounded(nonEmpty(input.company), 300), roleTitle: bounded(nonEmpty(input.roleTitle), 500),
      url: bounded(input.url), location: bounded(input.location, 300), employmentType: bounded(input.employmentType, 120), salaryRange: bounded(input.salaryRange, 200), source: bounded(input.source, 200),
      stage: bounded(nonEmpty(input.stage, 'target'), 40), priority: bounded(nonEmpty(input.priority, 'medium'), 40), nextAction: bounded(input.nextAction), followUpDate: input.followUpDate || null,
      contactName: bounded(input.contactName, 300), contactEmail: bounded(input.contactEmail, 300), notes: bounded(input.notes, 10000), appliedAt: input.appliedAt || null, externalId: input.externalId || null, apiSource: input.apiSource || null, canonicalUrl: bounded(input.canonicalUrl || input.url), rawDataJson: JSON.stringify(input.rawData || {}), description: bounded(input.description, 50000), requirementsJson: JSON.stringify(Array.isArray(input.requirements) ? input.requirements : []), postedAt: input.postedAt || null, expiresAt: input.expiresAt || null, salaryMin: Number.isInteger(input.salaryMin) ? input.salaryMin : null, salaryMax: Number.isInteger(input.salaryMax) ? input.salaryMax : null, salaryCurrency: bounded(input.salaryCurrency || 'USD', 10), remoteType: bounded(input.remoteType || 'unknown', 20), matchScore: Number.isInteger(input.matchScore) ? input.matchScore : null, requirementsMatchScore: Number.isInteger(input.requirementsMatchScore) ? input.requirementsMatchScore : null, candidateMatchScore: Number.isInteger(input.candidateMatchScore) ? input.candidateMatchScore : null, fitTier: input.fitTier || null, matchSummary: bounded(input.matchSummary), lastEvaluatedAt: input.lastEvaluatedAt || null, lastSeenAt: input.lastSeenAt || null,
      createdAt: input.createdAt || timestamp, updatedAt: timestamp, archived: Boolean(input.archived), deletedAt: null
    };
  }
  function validateJobRecord(record) {
    if (!record.company || !record.roleTitle) throw new Error('A job requires a company and role title.');
    if (!['target', 'researching', 'ready', 'applied', 'screen', 'interviewing', 'final', 'offer', 'accepted', 'rejected'].includes(record.stage)) throw new Error('Invalid job stage.');
    if (!['low', 'medium', 'high'].includes(record.priority)) throw new Error('Invalid job priority.');
    for (const field of ['url', 'location', 'employmentType', 'salaryRange', 'source', 'nextAction', 'contactName', 'contactEmail', 'notes']) if (typeof record[field] !== 'string') throw new Error(`Invalid job ${field}.`);
    for (const field of ['followUpDate', 'appliedAt']) if (record[field] !== null && record[field] !== undefined && (typeof record[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record[field]))) throw new Error(`Invalid job ${field}.`);
    return record;
  }
  const JOB_STAGE_ORDER = ['target', 'researching', 'ready', 'applied', 'screen', 'interviewing', 'final', 'offer', 'accepted', 'rejected'];
  function jobToRenderer(row) { let rawData = {}; let requirements = []; try { rawData = JSON.parse(row.rawDataJson || '{}'); } catch {} try { requirements = JSON.parse(row.requirementsJson || '[]'); } catch {} return { ...row, rawData, requirements, archived: Boolean(row.archived) }; }
  function upsertJob(input) {
    const record = validateJobRecord(jobRecord(input));
    const existing = db.select().from(jobOpportunities).where(eq(jobOpportunities.id, record.id)).get();
    if (existing) {
      // Applied is a forward-only milestone: preserving this invariant here
      // prevents board edits, detail edits, and IPC callers from moving a job
      // back to a pre-application stage after submission.
      const currentStageIndex = JOB_STAGE_ORDER.indexOf(existing.stage);
      const nextStageIndex = JOB_STAGE_ORDER.indexOf(record.stage);
      if (nextStageIndex < currentStageIndex) throw new Error(`A job cannot move backward from ${existing.stage}.`);
      db.update(jobOpportunities).set({ ...record, id: undefined, createdAt: existing.createdAt }).where(eq(jobOpportunities.id, record.id)).run();
      if (existing.stage !== record.stage) recordJobActivity(record.id, 'stage_changed', `Stage changed to ${record.stage}.`, { from: existing.stage, to: record.stage });
    } else {
      db.insert(jobOpportunities).values(record).run();
      recordJobActivity(record.id, 'job_saved', 'Opportunity added to the job pipeline.');
    }
    return jobToRenderer(db.select().from(jobOpportunities).where(eq(jobOpportunities.id, record.id)).get());
  }
  function listJobs() { return db.select().from(jobOpportunities).where(and(isNull(jobOpportunities.deletedAt), eq(jobOpportunities.archived, false))).orderBy(asc(jobOpportunities.stage), desc(jobOpportunities.updatedAt)).all().map(jobToRenderer); }
  function requirePipelineJob(jobId) { const job = db.select().from(jobOpportunities).where(and(eq(jobOpportunities.id, bounded(jobId, 160)), isNull(jobOpportunities.deletedAt))).get(); if (!job) throw new Error('Pipeline job not found.'); return job; }
  function requirePostApplicationJob(jobId) { const job = requirePipelineJob(jobId); if (JOB_STAGE_ORDER.indexOf(job.stage) < JOB_STAGE_ORDER.indexOf('applied')) throw new Error('Follow-ups and interview deadlines are available after the job is Applied.'); return job; }
  function recordJobActivity(jobId, activityType, summary, metadata = {}) { requirePipelineJob(jobId); const timestamp = now(); const row = { id: id('job-activity'), job_id: bounded(jobId, 160), activity_type: bounded(activityType, 80), summary: bounded(summary, 2000), metadata_json: JSON.stringify(metadata || {}), created_at: timestamp }; sqlite.prepare('INSERT INTO job_detail_activity (id, job_id, activity_type, summary, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(row.id, row.job_id, row.activity_type, row.summary, row.metadata_json, row.created_at); return { id: row.id, jobId: row.job_id, activityType: row.activity_type, summary: row.summary, metadata, createdAt: row.created_at }; }
  function listJobActivity(jobId) { requirePipelineJob(jobId); return sqlite.prepare('SELECT * FROM job_detail_activity WHERE job_id = ? ORDER BY created_at DESC LIMIT 100').all(bounded(jobId, 160)).map((row) => ({ id: row.id, jobId: row.job_id, activityType: row.activity_type, summary: row.summary, metadata: jsonField(row.metadata_json, {}), createdAt: row.created_at })); }
  function listJobEmails(jobId) { requirePipelineJob(jobId); return sqlite.prepare('SELECT e.* FROM email_messages e JOIN email_job_links l ON l.email_id = e.id WHERE l.job_id = ? ORDER BY e.received_at DESC, e.updated_at DESC').all(bounded(jobId, 160)).map(emailToRenderer); }
  function createJobFollowUp(input = {}) { requirePostApplicationJob(input.jobId); const timestamp = now(); const title = bounded(nonEmpty(input.title), 500); if (!title) throw new Error('A follow-up task needs a title.'); const dueDate = input.dueDate || null; if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('Invalid follow-up due date.'); const task = { id: bounded(nonEmpty(input.id, id('job-follow-up')), 160), jobId: bounded(input.jobId, 160), title, dueDate, status: 'open', sourceEmailId: input.sourceEmailId || null, createdAt: timestamp, updatedAt: timestamp, completedAt: null, deletedAt: null }; sqlite.prepare('INSERT INTO job_follow_up_tasks (id, job_id, title, due_date, status, source_email_id, created_at, updated_at, completed_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(task.id, task.jobId, task.title, task.dueDate, task.status, task.sourceEmailId, task.createdAt, task.updatedAt, null, null); recordJobActivity(task.jobId, 'follow_up_created', `Follow-up created: ${task.title}`, { taskId: task.id, dueDate: task.dueDate }); return task; }
  function listJobFollowUps(jobId) { requirePipelineJob(jobId); return sqlite.prepare("SELECT id, job_id AS jobId, title, due_date AS dueDate, status, source_email_id AS sourceEmailId, created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt FROM job_follow_up_tasks WHERE job_id = ? AND deleted_at IS NULL ORDER BY status ASC, due_date ASC, created_at DESC").all(bounded(jobId, 160)); }
  function completeJobFollowUp(taskId, completed) { const task = sqlite.prepare('SELECT * FROM job_follow_up_tasks WHERE id = ? AND deleted_at IS NULL').get(bounded(taskId, 160)); if (!task) throw new Error('Follow-up task not found.'); const timestamp = now(); const status = completed ? 'completed' : 'open'; sqlite.prepare('UPDATE job_follow_up_tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?').run(status, completed ? timestamp : null, timestamp, task.id); recordJobActivity(task.job_id, completed ? 'follow_up_completed' : 'follow_up_reopened', `${completed ? 'Completed' : 'Reopened'} follow-up: ${task.title}`, { taskId: task.id }); return { ...task, jobId: task.job_id, dueDate: task.due_date, sourceEmailId: task.source_email_id, status, updatedAt: timestamp, completedAt: completed ? timestamp : null }; }
  function createJobCalendarEvent(input = {}) { requirePostApplicationJob(input.jobId); const title = bounded(nonEmpty(input.title), 500); if (!title) throw new Error('A calendar event needs a title.'); const startsAt = bounded(nonEmpty(input.startsAt), 80); const endsAt = bounded(nonEmpty(input.endsAt, startsAt), 80); if (!startsAt || !endsAt) throw new Error('Calendar event start and end are required.'); const timestamp = now(); const event = { id: bounded(nonEmpty(input.id, id('job-calendar')), 160), provider: 'local', externalId: null, title, description: bounded(input.description, 5000), startsAt, endsAt, location: bounded(input.location, 500), allDay: Boolean(input.allDay), metadataJson: JSON.stringify({ jobId: input.jobId }), createdAt: timestamp, updatedAt: timestamp, deletedAt: null }; db.insert(calendarEvents).values(event).run(); sqlite.prepare('INSERT INTO job_calendar_links (job_id, calendar_event_id, created_at) VALUES (?, ?, ?)').run(bounded(input.jobId, 160), event.id, timestamp); recordJobActivity(input.jobId, 'calendar_event_created', `Calendar event added: ${title}`, { calendarEventId: event.id, startsAt }); return event; }
  function listJobCalendarEvents(jobId) { requirePipelineJob(jobId); return sqlite.prepare('SELECT c.* FROM calendar_events c JOIN job_calendar_links l ON l.calendar_event_id = c.id WHERE l.job_id = ? AND c.deleted_at IS NULL ORDER BY c.starts_at ASC').all(bounded(jobId, 160)); }
  const jsonField = (value, fallback = []) => { try { const parsed = JSON.parse(value || ''); return parsed; } catch { return fallback; } };
  function profileRecord(input = {}) { const timestamp = now(); const current = sqlite.prepare('SELECT * FROM user_profiles WHERE id = ?').get('current'); return { id: 'current', full_name: bounded(input.fullName ?? current?.full_name), first_name: bounded(input.firstName ?? current?.first_name, 120), last_name: bounded(input.lastName ?? current?.last_name, 120), email: bounded(input.email ?? current?.email), phone: bounded(input.phone ?? current?.phone), linkedin_url: bounded(input.linkedinUrl ?? current?.linkedin_url), github_url: bounded(input.githubUrl ?? current?.github_url), portfolio_url: bounded(input.portfolioUrl ?? current?.portfolio_url), target_roles_json: JSON.stringify(input.targetRoles ?? jsonField(current?.target_roles_json)), target_industries_json: JSON.stringify(input.targetIndustries ?? jsonField(current?.target_industries_json)), target_locations_json: JSON.stringify(input.targetLocations ?? jsonField(current?.target_locations_json)), must_have_skills_json: JSON.stringify(input.mustHaveSkills ?? jsonField(current?.must_have_skills_json)), nice_to_have_skills_json: JSON.stringify(input.niceToHaveSkills ?? jsonField(current?.nice_to_have_skills_json)), radius_miles: Number.isFinite(Number(input.radiusMiles)) ? Math.max(0, Math.min(100, Number(input.radiusMiles))) : (current?.radius_miles ?? null), remote_preference: bounded(input.remotePreference ?? current?.remote_preference ?? 'any', 20), minimum_salary: Number.isInteger(input.minimumSalary) ? input.minimumSalary : (current?.minimum_salary ?? null), salary_currency: bounded(input.salaryCurrency ?? current?.salary_currency ?? 'USD', 10), work_authorization: bounded(input.workAuthorization ?? current?.work_authorization), requires_sponsorship: input.requiresSponsorship === undefined ? Number(current?.requires_sponsorship || 0) : (input.requiresSponsorship ? 1 : 0), security_clearance: bounded(input.securityClearance ?? current?.security_clearance), years_experience: Number.isInteger(input.yearsExperience) ? input.yearsExperience : (current?.years_experience ?? null), interests_json: JSON.stringify(input.interests ?? jsonField(current?.interests_json)), excluded_keywords_json: JSON.stringify(input.excludedKeywords ?? jsonField(current?.excluded_keywords_json)), preferred_job_types_json: JSON.stringify(input.preferredJobTypes ?? jsonField(current?.preferred_job_types_json, ['full-time'])), street: bounded(input.street ?? current?.street, 300), city: bounded(input.city ?? current?.city, 120), state: bounded(input.state ?? current?.state, 120), postal_code: bounded(input.postalCode ?? current?.postal_code, 40), country: bounded(input.country ?? current?.country, 120), desired_salary: Number.isInteger(input.desiredSalary) ? input.desiredSalary : (current?.desired_salary ?? null), notice_period: bounded(input.noticePeriod ?? current?.notice_period, 120), available_start_date: bounded(input.availableStartDate ?? current?.available_start_date, 40), relocation_willingness: bounded(input.relocationWillingness ?? current?.relocation_willingness, 40), travel_willingness: bounded(input.travelWillingness ?? current?.travel_willingness, 40), created_at: current?.created_at || timestamp, updated_at: timestamp }; }
  const profileRenderer = (row) => row ? ({ ...row, fullName: row.full_name, firstName: row.first_name, lastName: row.last_name, linkedinUrl: row.linkedin_url, githubUrl: row.github_url, portfolioUrl: row.portfolio_url, targetRoles: jsonField(row.target_roles_json), targetIndustries: jsonField(row.target_industries_json), targetLocations: jsonField(row.target_locations_json), mustHaveSkills: jsonField(row.must_have_skills_json), niceToHaveSkills: jsonField(row.nice_to_have_skills_json), radiusMiles: row.radius_miles, remotePreference: row.remote_preference, minimumSalary: row.minimum_salary, salaryCurrency: row.salary_currency, workAuthorization: row.work_authorization, requiresSponsorship: Boolean(row.requires_sponsorship), securityClearance: row.security_clearance, yearsExperience: row.years_experience, interests: jsonField(row.interests_json), excludedKeywords: jsonField(row.excluded_keywords_json), preferredJobTypes: jsonField(row.preferred_job_types_json), street: row.street, city: row.city, state: row.state, postalCode: row.postal_code, country: row.country, desiredSalary: row.desired_salary, noticePeriod: row.notice_period, availableStartDate: row.available_start_date, relocationWillingness: row.relocation_willingness, travelWillingness: row.travel_willingness }) : null;
  function getProfile() { return profileRenderer(sqlite.prepare('SELECT * FROM user_profiles WHERE id = ?').get('current')); }
  function upsertProfile(input) { const record = profileRecord(input); sqlite.prepare(`INSERT INTO user_profiles (${Object.keys(record).join(',')}) VALUES (${Object.keys(record).map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${Object.keys(record).filter((key) => key !== 'id').map((key) => `${key}=excluded.${key}`).join(',')}`).run(...Object.values(record)); return getProfile(); }
  function getResume() { const row = sqlite.prepare('SELECT * FROM master_resumes WHERE id = ?').get('current'); return row ? { ...row, rawText: row.raw_text, professionalSummary: row.professional_summary, sourceFilename: row.source_filename, sourceType: row.source_type, experience: jsonField(row.experience_json), education: jsonField(row.education_json), skills: jsonField(row.skills_json), projects: jsonField(row.projects_json), certifications: jsonField(row.certifications_json), achievements: jsonField(row.achievements_json) } : null; }
  function upsertResume(input = {}) { const old = sqlite.prepare('SELECT * FROM master_resumes WHERE id = ?').get('current'); const record = { id: 'current', raw_text: bounded(input.rawText ?? old?.raw_text, 100000), professional_summary: bounded(input.professionalSummary ?? old?.professional_summary), experience_json: JSON.stringify(input.experience ?? jsonField(old?.experience_json)), education_json: JSON.stringify(input.education ?? jsonField(old?.education_json)), skills_json: JSON.stringify(input.skills ?? jsonField(old?.skills_json)), projects_json: JSON.stringify(input.projects ?? jsonField(old?.projects_json)), certifications_json: JSON.stringify(input.certifications ?? jsonField(old?.certifications_json)), achievements_json: JSON.stringify(input.achievements ?? jsonField(old?.achievements_json)), source_filename: bounded(input.sourceFilename ?? old?.source_filename), source_type: bounded(input.sourceType ?? old?.source_type ?? 'manual'), version: (old?.version || 0) + 1, created_at: old?.created_at || now(), updated_at: now() }; sqlite.prepare(`INSERT INTO master_resumes (${Object.keys(record).join(',')}) VALUES (${Object.keys(record).map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${Object.keys(record).filter((key) => key !== 'id').map((key) => `${key}=excluded.${key}`).join(',')}`).run(...Object.values(record)); return getResume(); }
  const parseObject = (value, fallback = {}) => { try { const parsed = JSON.parse(value || ''); return parsed && typeof parsed === 'object' ? parsed : fallback; } catch { return fallback; } };
  const applicationToRenderer = (row) => row ? ({ ...row, jobId: row.job_id, readiness: parseObject(row.readiness_json), unresolvedCount: row.unresolved_count, applicationUrl: row.application_url, atsKey: row.ats_key, startedAt: row.started_at, lastActivityAt: row.last_activity_at, submittedAt: row.submitted_at, confirmationNumber: row.confirmation_number, confirmationUrl: row.confirmation_url, withdrawnAt: row.withdrawn_at, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at }) : null;
  const answerToRenderer = (row) => ({ ...row, applicationId: row.application_id, questionKey: row.question_key, questionText: row.question_text, normalizedCategory: row.normalized_category, answerText: row.answer_text, answer: jsonField(row.answer_json, null), approvalStatus: row.approval_status, autofillPolicy: row.autofill_policy, provenance: jsonField(row.provenance_json) });
  const eventToRenderer = (row) => ({ ...row, applicationId: row.application_id, eventType: row.event_type, metadata: parseObject(row.metadata_json), createdAt: row.created_at });
  function refreshApplicationReadiness(applicationId) { const app = sqlite.prepare('SELECT * FROM job_applications WHERE id = ? AND deleted_at IS NULL').get(applicationId); if (!app) return null; const job = jobToRenderer(sqlite.prepare('SELECT * FROM job_opportunities WHERE id = ?').get(app.job_id)); const readiness = computeApplicationReadiness({ job, profile: getProfile() || {}, resume: getResume() || {} }); const stamp = now(); sqlite.prepare('UPDATE job_applications SET readiness_json = ?, last_activity_at = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(readiness), stamp, stamp, applicationId); return applicationToRenderer(sqlite.prepare('SELECT * FROM job_applications WHERE id = ?').get(applicationId)); }
  function recordApplicationEvent(input = {}) { const appId = bounded(input.applicationId, 160); if (!appId) throw new Error('Invalid application id.'); const metadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? input.metadata : {}; const record = { id: id('application-event'), application_id: appId, event_type: bounded(input.eventType, 80) || 'updated', summary: bounded(input.summary, 1000), metadata_json: JSON.stringify(metadata), created_at: now() }; sqlite.prepare('INSERT INTO job_application_events (id, application_id, event_type, summary, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(...Object.values(record)); return eventToRenderer(record); }
  function createOrResumeApplication(input = {}) { const jobId = bounded(input.jobId, 160); const job = sqlite.prepare('SELECT * FROM job_opportunities WHERE id = ? AND deleted_at IS NULL').get(jobId); if (!job) throw new Error('Job not found.'); const current = sqlite.prepare('SELECT * FROM job_applications WHERE job_id = ? AND deleted_at IS NULL').get(jobId); if (current) return refreshApplicationReadiness(current.id);
    const stamp = now(); const appId = id('application'); const readiness = computeApplicationReadiness({ job: jobToRenderer(job), profile: getProfile() || {}, resume: getResume() || {} });
    sqlite.transaction(() => { if (['target', 'researching'].includes(job.stage)) sqlite.prepare("UPDATE job_opportunities SET stage = 'ready', updated_at = ? WHERE id = ?").run(stamp, jobId); sqlite.prepare('INSERT INTO job_applications (id, job_id, status, application_url, ats_key, readiness_json, unresolved_count, started_at, last_activity_at, submitted_at, confirmation_number, confirmation_url, withdrawn_at, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, NULL)').run(appId, jobId, 'drafting', bounded(job.url || job.canonical_url, 2000), 'unknown', JSON.stringify(readiness), 0, stamp, stamp, '', '', stamp, stamp); recordApplicationEvent({ applicationId: appId, eventType: 'started', summary: 'Application workspace created.' }); })();
    return applicationToRenderer(sqlite.prepare('SELECT * FROM job_applications WHERE id = ?').get(appId)); }
  function getApplication(applicationId) { return applicationToRenderer(sqlite.prepare('SELECT * FROM job_applications WHERE id = ? AND deleted_at IS NULL').get(applicationId)); }
  function transitionApplication(input = {}) { const app = getApplication(bounded(input.id, 160)); if (!app) throw new Error('Application not found.'); assertTransition(app.status, input.status, { trustedCompletion: false }); const stamp = now(); sqlite.prepare('UPDATE job_applications SET status = ?, last_activity_at = ?, updated_at = ? WHERE id = ?').run(input.status, stamp, stamp, app.id); recordApplicationEvent({ applicationId: app.id, eventType: 'status_changed', summary: `Status changed to ${input.status}.` }); return refreshApplicationReadiness(app.id); }
  function abandonApplication(applicationId) { const app = getApplication(bounded(applicationId, 160)); if (!app) throw new Error('Application not found.'); const stamp = now(); sqlite.prepare('UPDATE job_applications SET status = ?, deleted_at = ?, withdrawn_at = ?, last_activity_at = ?, updated_at = ? WHERE id = ?').run('withdrawn', stamp, stamp, stamp, stamp, app.id); recordApplicationEvent({ applicationId: app.id, eventType: 'abandoned', summary: 'Application workspace abandoned.' }); return { ...app, status: 'withdrawn', deletedAt: stamp, withdrawnAt: stamp }; }
  function completeSubmission(input = {}) { const app = getApplication(bounded(input.applicationId, 160)); if (!app) throw new Error('Application not found.'); if (!input.userAcknowledged) throw new Error('User acknowledgment is required before recording submission.'); const stamp = now(); const followUpDate = /^\d{4}-\d{2}-\d{2}$/.test(input.followUpDate || '') ? input.followUpDate : null; sqlite.transaction(() => { sqlite.prepare('UPDATE job_applications SET status = ?, submitted_at = ?, confirmation_number = ?, confirmation_url = ?, last_activity_at = ?, updated_at = ? WHERE id = ?').run('submitted', stamp, bounded(input.confirmationNumber, 160), bounded(input.confirmationUrl, 2000), stamp, stamp, app.id); sqlite.prepare('UPDATE job_opportunities SET stage = ?, applied_at = ?, follow_up_date = ?, next_action = ?, updated_at = ? WHERE id = ?').run('applied', stamp.slice(0, 10), followUpDate, bounded(input.nextAction, 1000), stamp, app.jobId); recordApplicationEvent({ applicationId: app.id, eventType: 'submitted', summary: 'User confirmed application submission.' }); })(); return getApplication(app.id); }
  function saveApplicationAnswer(input = {}) { const answer = validateAnswer(input); if (answer.scope === 'application' && !getApplication(bounded(answer.applicationId, 160))) throw new Error('Application not found.'); const stamp = now(); const record = { id: bounded(answer.id, 160) || id('application-answer'), application_id: answer.applicationId || null, question_key: answer.questionKey, question_text: answer.questionText, normalized_category: answer.normalizedCategory, answer_text: answer.answerText, answer_json: JSON.stringify(answer.answer ?? null), scope: answer.scope, sensitivity: answer.sensitivity, approval_status: answer.approvalStatus, autofill_policy: answer.autofillPolicy, provenance_json: JSON.stringify(answer.provenance), approved_at: answer.approvalStatus === 'approved' ? (answer.approvedAt || stamp) : null, created_at: stamp, updated_at: stamp, deleted_at: null }; sqlite.prepare('INSERT INTO job_application_answers (id, application_id, question_key, question_text, normalized_category, answer_text, answer_json, scope, sensitivity, approval_status, autofill_policy, provenance_json, approved_at, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET question_text=excluded.question_text, answer_text=excluded.answer_text, answer_json=excluded.answer_json, scope=excluded.scope, approval_status=excluded.approval_status, autofill_policy=excluded.autofill_policy, provenance_json=excluded.provenance_json, approved_at=excluded.approved_at, updated_at=excluded.updated_at').run(...Object.values(record)); return answerToRenderer(sqlite.prepare('SELECT * FROM job_application_answers WHERE id = ?').get(record.id)); }
  // Keep the renderer DTO camel-cased, including export-ready renderings.  The
  // PDF IPC handler receives this DTO, so omitting these aliases produced PDFs
  // containing the literal text "undefined" despite valid stored HTML.
  const documentToRenderer = (row) => row ? ({ ...row, applicationId: row.application_id, documentType: row.document_type, content: parseObject(row.content_json), plainText: row.plain_text, htmlText: row.html_text, provenance: jsonField(row.provenance_json), validation: parseObject(row.validation_json), sourceResumeVersion: row.source_resume_version, modelName: row.model_name, promptVersion: row.prompt_version, isSelected: Boolean(row.is_selected), exportedPdfPath: row.exported_pdf_path, exportedTextPath: row.exported_text_path, createdAt: row.created_at, updatedAt: row.updated_at }) : null;
  function requireEditableApplicationDocument(applicationId) {
    const application = getApplication(applicationId);
    if (!application) throw new Error('Application not found.');
    const job = sqlite.prepare('SELECT stage FROM job_opportunities WHERE id = ? AND deleted_at IS NULL').get(application.jobId);
    if (job?.stage === 'applied' || (job && JOB_STAGE_ORDER.indexOf(job.stage) > JOB_STAGE_ORDER.indexOf('applied'))) throw new Error('Application documents are locked after the job is Applied.');
    return application;
  }
  function saveDocument(input = {}) { if (!DOCUMENT_TYPES.has(input.documentType)) throw new Error('Invalid document type.'); requireEditableApplicationDocument(input.applicationId); const stamp = now(); const content = input.content && typeof input.content === 'object' ? input.content : {}; const validation = input.validation && typeof input.validation === 'object' ? input.validation : {}; const version = Number.isInteger(input.version) ? input.version : Number(sqlite.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM job_application_documents WHERE application_id = ? AND document_type = ?').get(input.applicationId, input.documentType).next); const record = { id: bounded(input.id, 160) || id('document'), application_id: bounded(input.applicationId, 160), document_type: input.documentType, version, status: STATUSES.has(input.status) ? input.status : 'draft', title: bounded(input.title, 500), content_json: JSON.stringify(content), plain_text: bounded(input.plainText || renderPlainText(input.documentType, content), 100000), html_text: bounded(input.htmlText || renderHtml(input.documentType, content), 150000), provenance_json: JSON.stringify(Array.isArray(input.provenance) ? input.provenance : []), validation_json: JSON.stringify(validation), source_resume_version: Number.isInteger(input.sourceResumeVersion) ? input.sourceResumeVersion : null, model_name: bounded(input.modelName, 200), prompt_version: bounded(input.promptVersion, 100), is_selected: 0, exported_pdf_path: bounded(input.exportedPdfPath, 2000), exported_text_path: bounded(input.exportedTextPath, 2000), created_at: stamp, updated_at: stamp, deleted_at: null }; sqlite.prepare('INSERT INTO job_application_documents (id, application_id, document_type, version, status, title, content_json, plain_text, html_text, provenance_json, validation_json, source_resume_version, model_name, prompt_version, is_selected, exported_pdf_path, exported_text_path, created_at, updated_at, deleted_at) VALUES (@id,@application_id,@document_type,@version,@status,@title,@content_json,@plain_text,@html_text,@provenance_json,@validation_json,@source_resume_version,@model_name,@prompt_version,@is_selected,@exported_pdf_path,@exported_text_path,@created_at,@updated_at,@deleted_at)').run(record); return documentToRenderer(sqlite.prepare('SELECT * FROM job_application_documents WHERE id = ?').get(record.id)); }
  function listDocuments(applicationId, documentType) { return sqlite.prepare(`SELECT * FROM job_application_documents WHERE application_id = ? AND deleted_at IS NULL ${documentType ? 'AND document_type = ?' : ''} ORDER BY document_type, version DESC`).all(...(documentType ? [applicationId, documentType] : [applicationId])).map(documentToRenderer); }
  function getDocument(documentId) { return documentToRenderer(sqlite.prepare('SELECT * FROM job_application_documents WHERE id = ? AND deleted_at IS NULL').get(documentId)); }
  function updateDocument(documentId, changes = {}) { const current = getDocument(documentId); if (!current) throw new Error('Document not found.'); requireEditableApplicationDocument(current.applicationId); const content = changes.content || current.content; const validation = changes.validation || current.validation; sqlite.prepare('UPDATE job_application_documents SET status = ?, content_json = ?, plain_text = ?, html_text = ?, provenance_json = ?, validation_json = ?, updated_at = ? WHERE id = ?').run(STATUSES.has(changes.status) ? changes.status : current.status, JSON.stringify(content), renderPlainText(current.documentType, content), renderHtml(current.documentType, content), JSON.stringify(changes.provenance || current.provenance), JSON.stringify(validation), now(), documentId); return getDocument(documentId); }
  function selectDocument(documentId) { const current = getDocument(documentId); if (!current) throw new Error('Document not found.'); requireEditableApplicationDocument(current.applicationId); if (current.status !== 'approved' || current.validation.errors?.length) throw new Error('Only approved, error-free documents can be selected.'); sqlite.transaction(() => { sqlite.prepare('UPDATE job_application_documents SET is_selected = 0, status = CASE WHEN is_selected = 1 THEN \'superseded\' ELSE status END, updated_at = ? WHERE application_id = ? AND document_type = ? AND deleted_at IS NULL').run(now(), current.applicationId, current.documentType); sqlite.prepare('UPDATE job_application_documents SET is_selected = 1, status = \'approved\', updated_at = ? WHERE id = ?').run(now(), documentId); })(); return getDocument(documentId); }
  function approveDocument(documentId) { const current = getDocument(documentId); if (!current) throw new Error('Document not found.'); requireEditableApplicationDocument(current.applicationId); if (current.validation.errors?.length || current.validation.valid === false) throw new Error('Documents with validation errors cannot be approved.'); sqlite.prepare('UPDATE job_application_documents SET status = \'approved\', updated_at = ? WHERE id = ?').run(now(), documentId); return getDocument(documentId); }
  function markDocumentExport(documentId, paths = {}) { const current = getDocument(documentId); if (!current) throw new Error('Document not found.'); sqlite.prepare('UPDATE job_application_documents SET exported_pdf_path = COALESCE(?, exported_pdf_path), exported_text_path = COALESCE(?, exported_text_path), updated_at = ? WHERE id = ?').run(paths.pdfPath || null, paths.textPath || null, now(), documentId); return getDocument(documentId); }
  function validateTaskHierarchy(record) {
    const project = db.select().from(projects).where(eq(projects.id, record.projectId)).get();
    if (!project || project.kind !== 'project') throw new Error('Task must belong to a real project.');
    if (record.releaseId) {
      const release = db.select().from(projects).where(eq(projects.id, record.releaseId)).get();
      if (!release || release.kind !== 'release' || release.parentId !== record.projectId) throw new Error('Task release does not belong to its project.');
    }
    if (record.phaseId) {
      const phase = db.select().from(projects).where(eq(projects.id, record.phaseId)).get();
      if (!phase || phase.kind !== 'phase' || phase.parentId !== record.releaseId) throw new Error('Task phase does not belong to its release.');
    }
    if (record.parentTaskId) {
      const parent = db.select().from(tasks).where(eq(tasks.id, record.parentTaskId)).get();
      if (!parent || parent.parentTaskId || parent.projectId !== record.projectId) throw new Error('Subtask parent must be a top-level task in the same project.');
      if ((parent.releaseId || null) !== (record.releaseId || null) || (parent.phaseId || null) !== (record.phaseId || null)) throw new Error('Subtask must share its parent task context.');
    }
  }

  function repairWorkspaceHierarchy() {
    const markerKey = 'workspace_hierarchy_repair_v1';
    const marker = db.select().from(userSettings).where(eq(userSettings.key, markerKey)).get();
    if (marker) return { repaired: [], marker: JSON.parse(marker.value) };
    const invalid = db.select({ id: projects.id, title: projects.title, parentId: projects.parentId }).from(projects).where(and(eq(projects.kind, 'workspace'), isNull(projects.deletedAt))).all().filter((entry) => entry.parentId);
    const repairedAt = now();
    db.transaction((tx) => {
      for (const entry of invalid) tx.update(projects).set({ parentId: null, updatedAt: repairedAt }).where(eq(projects.id, entry.id)).run();
      tx.insert(userSettings).values({ key: markerKey, value: JSON.stringify({ version: 1, repairedAt, repaired: invalid }), updatedAt: repairedAt }).run();
    });
    return { repaired: invalid, marker: { version: 1, repairedAt, repaired: invalid } };
  }

  function seedDefaults() {
    const defaults = { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', coachMode: 'local-first', integrationsEnabled: false };
    for (const [key, value] of Object.entries(defaults)) {
      if (!db.select().from(userSettings).where(eq(userSettings.key, key)).get()) db.insert(userSettings).values({ key, value: JSON.stringify(value), updatedAt: now() }).run();
    }
  }

  function seedRoadmap() {
    if (!seedPath || !fs.existsSync(seedPath)) return { seeded: false, reason: 'seed-file-missing' };
    const marker = db.select().from(userSettings).where(eq(userSettings.key, 'roadmap_seed_version')).get();
    if (marker) return { seeded: false, reason: 'already-seeded' };
    const rows = parseCsv(fs.readFileSync(seedPath, 'utf8'));
    const timestamp = now();
    db.transaction((tx) => {
      for (const [index, row] of rows.entries()) {
        const common = { id: row.item_id, parentId: row.parent_id || null, title: row.title, description: row.description, status: row.status || 'backlog', priority: row.priority || 'P1', orderIndex: Number(row.order_index || index), dueDate: row.due_date || null, nextAction: row.next_action, definitionOfDone: row.definition_of_done, blockedReason: row.blocked_reason, dependencies: row.dependencies, acceptanceCriteria: row.acceptance_criteria, securityPrivacyNotes: row.security_privacy_notes, sourceContext: row.source_context, confidence: row.confidence, createdAt: timestamp, updatedAt: timestamp, archived: false, deletedAt: null };
        if (row.item_type === 'workspace' || row.item_type === 'project' || row.item_type === 'release' || row.item_type === 'phase') tx.insert(projects).values({ ...common, kind: row.item_type, parentId: row.item_type === 'workspace' ? null : (row.parent_id || null) }).onConflictDoNothing().run();
        else tx.insert(tasks).values({ ...common, projectId: row.project_id, parentTaskId: row.item_type === 'subtask' ? row.parent_id || null : null, releaseId: row.release_id || null, phaseId: row.phase_id || null }).onConflictDoNothing().run();
      }
      tx.insert(userSettings).values({ key: 'roadmap_seed_version', value: JSON.stringify({ source: path.basename(seedPath), rows: rows.length }), updatedAt: now() }).run();
    });
    return { seeded: true, rows: rows.length };
  }

  function projectToRenderer(row) { return { ...row, type: row.kind, name: row.title, archived: Boolean(row.archived), order: row.orderIndex }; }
  function taskToRenderer(row) { return { ...row, type: row.parentTaskId ? 'subtask' : 'task', name: row.title, parentId: row.parentTaskId || row.phaseId || row.releaseId || row.projectId || null, order: row.orderIndex, archived: Boolean(row.archived) }; }
  function bootstrap() {
    const projectRows = allProjects().map(projectToRenderer);
    const taskRows = allTasks().map(taskToRenderer);
    const workspaces = projectRows.filter((row) => row.kind === 'workspace');
    const workspace = workspaces[0] || { id: 'default', kind: 'workspace', type: 'workspace', title: 'Executive workspace', archived: false };
    return { roadmap: { schemaVersion: 3, workspace, workspaces, projects: projectRows.filter((row) => row.kind === 'project'), releases: projectRows.filter((row) => row.kind === 'release'), phases: projectRows.filter((row) => row.kind === 'phase'), tasks: taskRows.filter((row) => row.type === 'task'), subtasks: taskRows.filter((row) => row.type === 'subtask') }, notes: db.select().from(notes).where(eq(notes.id, 'personal-notes')).get()?.content || '', settings: Object.fromEntries(db.select().from(userSettings).all().map((setting) => [setting.key, JSON.parse(setting.value)])) };
  }
  function upsertProject(input, kind) {
    const record = projectRecord(safeRecord(input, ['id', 'title'], 'project'), kind);
    validateProjectHierarchy(record);
    const existing = db.select().from(projects).where(eq(projects.id, record.id)).get();
    insertOrUpdate(projects, record);
    if (existing?.archived && !record.archived) {
      db.update(tasks).set({ archived: false, deletedAt: null, updatedAt: now() }).where(eq(tasks.projectId, record.id)).run();
    }
    return projectToRenderer(db.select().from(projects).where(eq(projects.id, record.id)).get());
  }
  function upsertTask(input, kind) {
    const safeInput = safeRecord(input, ['id', 'title', 'projectId'], 'task');
    const recordKind = safeInput.type === 'subtask' || Boolean(safeInput.parentTaskId) ? 'subtask' : (kind || 'task');
    const record = taskRecord(safeInput, recordKind);
    validateTaskHierarchy(record);
    insertOrUpdate(tasks, record);
    return taskToRenderer(db.select().from(tasks).where(eq(tasks.id, record.id)).get());
  }
  function softDelete(table, recordId) { if (!nonEmpty(recordId) || recordId.length > 160) throw new Error('Invalid record id.'); const result = db.update(table).set({ deletedAt: now(), updatedAt: now(), archived: true }).where(eq(table.id, recordId)).run(); return result.changes > 0; }
  function softDeleteProject(recordId) {
    if (!nonEmpty(recordId) || recordId.length > 160) throw new Error('Invalid project id.');
    const timestamp = now();
    return db.transaction((tx) => {
      const projectResult = tx.update(projects).set({ deletedAt: timestamp, updatedAt: timestamp, archived: true }).where(eq(projects.id, recordId)).run();
      tx.update(tasks).set({ deletedAt: timestamp, updatedAt: timestamp, archived: true }).where(eq(tasks.projectId, recordId)).run();
      return projectResult.changes > 0;
    });
  }
  function syncRoadmap(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid roadmap payload.');
    const collections = ['projects', 'releases', 'phases', 'tasks', 'subtasks'];
    if (collections.some((key) => !Array.isArray(payload[key]))) throw new Error('Invalid roadmap collections.');
    db.transaction((tx) => {
      const workspaceRows = (Array.isArray(payload.workspaces) ? payload.workspaces : []).map((entry) => projectRecord(entry, 'workspace'));
      const projectRows = [...workspaceRows, ...payload.projects.map((entry) => projectRecord(entry, entry.kind || entry.type || 'project')), ...payload.releases.map((entry) => projectRecord(entry, 'release')), ...payload.phases.map((entry) => projectRecord(entry, 'phase'))];
      const taskRows = [...payload.tasks.map((entry) => taskRecord(entry, 'task')), ...payload.subtasks.map((entry) => taskRecord(entry, 'subtask'))];
      const projectOrder = { workspace: 0, project: 1, release: 2, phase: 3 };
      for (const record of projectRows.sort((a, b) => projectOrder[a.kind] - projectOrder[b.kind])) { validateProjectHierarchy(record, tx); tx.insert(projects).values(record).onConflictDoUpdate({ target: projects.id, set: { ...record, id: undefined } }).run(); }
      for (const record of taskRows) tx.insert(tasks).values(record).onConflictDoUpdate({ target: tasks.id, set: { ...record, id: undefined } }).run();
      const projectIds = new Set(projectRows.map((entry) => entry.id));
      const taskIds = new Set(taskRows.map((entry) => entry.id));
      for (const row of tx.select({ id: projects.id, kind: projects.kind }).from(projects).where(isNull(projects.deletedAt)).all()) if (!projectIds.has(row.id) && row.kind !== 'workspace') tx.update(projects).set({ deletedAt: now(), archived: true, updatedAt: now() }).where(eq(projects.id, row.id)).run();
      for (const row of tx.select({ id: tasks.id }).from(tasks).where(isNull(tasks.deletedAt)).all()) if (!taskIds.has(row.id)) tx.update(tasks).set({ deletedAt: now(), archived: true, updatedAt: now() }).where(eq(tasks.id, row.id)).run();
    });
    return bootstrap();
  }
  function importRoadmap(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid roadmap payload.');
    const collections = ['projects', 'releases', 'phases', 'tasks', 'subtasks'];
    if (collections.some((key) => !Array.isArray(payload[key]))) throw new Error('Invalid roadmap collections.');
    for (const entry of [...payload.projects, ...payload.releases, ...payload.phases]) if (entry.id && (entry.title || entry.name)) upsertProject(entry, entry.kind || entry.type || 'project');
    for (const entry of [...payload.tasks, ...payload.subtasks]) if (entry.id && (entry.title || entry.name) && entry.projectId) upsertTask(entry, entry.parentTaskId || entry.parentId ? 'subtask' : 'task');
    return bootstrap();
  }
  function saveNote(content, title = 'Personal notes') {
    const timestamp = now();
    const record = { id: 'personal-notes', title: bounded(title, 500), content: bounded(content, 100000), entityType: 'workspace', entityId: 'default', createdAt: timestamp, updatedAt: timestamp, deletedAt: null };
    db.insert(notes).values(record).onConflictDoUpdate({ target: notes.id, set: { title: record.title, content: record.content, updatedAt: timestamp, deletedAt: null } }).run();
    return db.select().from(notes).where(eq(notes.id, record.id)).get();
  }
  function backup() {
    const backupDir = path.join(userDataPath, 'backups'); fs.mkdirSync(backupDir, { recursive: true });
    const destination = path.join(backupDir, `executive-coach-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
    return sqlite.backup(destination).then(() => destination);
  }
  function createJobSearchRun(input = {}) {
    const runId = bounded(nonEmpty(input.id, id('search-run')), 160);
    sqlite.prepare('INSERT INTO job_search_runs (id, status, started_at, finished_at, result_count, warning) VALUES (?, ?, ?, NULL, 0, ?)').run(runId, bounded(input.status || 'running', 40), now(), bounded(input.warning || '', 1000));
    return runId;
  }
  function recordJobSearchAttempt(input = {}) {
    let requestJson = '{}';
    let previewJson = '[]';
    try { requestJson = JSON.stringify(input.request || {}); } catch {}
    try {
      previewJson = JSON.stringify((Array.isArray(input.preview) ? input.preview : []).slice(0, 2).map((job) => ({
        providerKey: bounded(job.providerKey, 40), externalId: bounded(job.externalId, 160), title: bounded(job.title, 300), company: bounded(job.company || job.agency, 240), location: bounded(job.location, 240), canonicalUrl: bounded(job.canonicalUrl, 1000), applicationUrl: bounded(job.applicationUrl, 1000), postedAt: job.postedAt || null,
      })));
    } catch {}
    sqlite.prepare('INSERT INTO job_search_attempts (id, run_id, provider, lane_id, query, location, request_json, http_status, result_count, total_available, duration_ms, error_code, error_message, error_detail, preview_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id('search-attempt'), input.runId, bounded(input.provider, 40), bounded(input.laneId, 160), bounded(input.query, 300), bounded(input.location, 300), bounded(requestJson, 4000), Number.isInteger(input.httpStatus) ? input.httpStatus : null, Number(input.resultCount) || 0, Number(input.totalAvailable) || 0, Number(input.durationMs) || 0, bounded(input.errorCode || '', 80) || null, bounded(input.errorMessage || '', 1000) || null, bounded(input.errorDetail || '', 500) || null, bounded(previewJson, 12000), now());
  }
  function recordApiCall(input = {}) {
    const json = (value, fallback = '{}') => { try { return JSON.stringify(value ?? JSON.parse(fallback)); } catch { return fallback; } };
    sqlite.prepare('INSERT INTO api_call_log (id, run_id, purpose, method, url, request_headers_json, request_body, response_status, response_headers_json, response_body, response_ok, duration_ms, timed_out, error_name, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      input.id || id('api-call'), input.runId || null, bounded(input.purpose || 'unknown', 100), bounded(input.method || 'GET', 12), bounded(input.url, 4000), json(input.requestHeaders), String(input.requestBody ?? ''), Number.isInteger(input.responseStatus) ? input.responseStatus : null, json(input.responseHeaders), String(input.responseBody ?? ''), input.responseOk === null || input.responseOk === undefined ? null : (Number(input.responseOk) ? 1 : 0), Number(input.durationMs) || 0, Number(input.timedOut) ? 1 : 0, bounded(input.errorName, 120), bounded(input.errorMessage, 4000), now(),
    );
  }
  function listApiCalls(runId) {
    const rows = sqlite.prepare(runId ? 'SELECT * FROM api_call_log WHERE run_id = ? ORDER BY created_at ASC' : 'SELECT * FROM api_call_log ORDER BY created_at ASC').all(...(runId ? [runId] : []));
    return rows.map((row) => {
      let request = null;
      try { request = JSON.parse(row.request_body || 'null'); } catch {}
      const messages = Array.isArray(request?.messages) ? request.messages : [];
      const userPayload = messages.find((message) => message?.role === 'user')?.content || '';
      let parsedUser = null;
      try { parsedUser = JSON.parse(userPayload); } catch {}
      return { ...row, requestBodyCharacters: String(row.request_body || '').length, estimatedRequestTokens: Math.ceil(String(row.request_body || '').length / 4), model: request?.model || null, maxTokens: Number.isFinite(Number(request?.max_tokens)) ? Number(request.max_tokens) : null, messageCount: messages.length, jobCount: Array.isArray(parsedUser?.jobs) ? parsedUser.jobs.length : null, assessmentCount: Array.isArray(parsedUser?.assessments) ? parsedUser.assessments.length : null, requestHeaders: (() => { try { return JSON.parse(row.request_headers_json || '{}'); } catch { return {}; } })(), responseHeaders: (() => { try { return JSON.parse(row.response_headers_json || '{}'); } catch { return {}; } })() };
    });
  }
  function recordJobSearchRankingBatch(input = {}) {
    sqlite.prepare('INSERT INTO job_search_ranking_batches (id, run_id, batch_number, submitted_count, assessed_count, response_length, status, error_code, error_message, created_at, finished_at, call_number, total_calls, prompt_characters, max_tokens, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      id('ranking-batch'), input.runId, Number(input.batchNumber) || 0, Number(input.submittedCount) || 0, Number(input.assessedCount) || 0, Number(input.responseLength) || 0, bounded(input.status || 'failed', 40), bounded(input.errorCode || '', 120) || null, bounded(input.errorMessage || '', 2000) || null, input.createdAt || now(), input.finishedAt || now(), Number(input.callNumber) || 0, Number(input.totalCalls) || 0, Number(input.promptCharacters) || 0, Number(input.maxTokens) || 0, Number(input.durationMs) || 0,
    );
  }
  function listJobSearchRankingBatches(runId) {
    return sqlite.prepare('SELECT * FROM job_search_ranking_batches WHERE run_id = ? ORDER BY batch_number ASC').all(runId);
  }
  function finishJobSearchRun(runId, input = {}) {
    sqlite.prepare('UPDATE job_search_runs SET status = ?, finished_at = ?, result_count = ?, warning = ? WHERE id = ?').run(bounded(input.status || 'completed', 40), now(), Number(input.resultCount) || 0, bounded(input.warning || '', 1000), runId);
  }
  function listJobSearchAttempts(runId) {
    return sqlite.prepare('SELECT * FROM job_search_attempts WHERE run_id = ? ORDER BY created_at ASC').all(runId).map((row) => ({ ...row, request: (() => { try { return JSON.parse(row.request_json || '{}'); } catch { return {}; } })(), preview: (() => { try { const parsed = JSON.parse(row.preview_json || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })() }));
  }
  function upsertEmail(input = {}) {
    const timestamp = now();
    const emailId = input.id || stableEmailId(input.provider || 'gmail', input.externalId);
    const matchedTerms = Array.isArray(input.matchedTerms) ? input.matchedTerms.slice(0, 30) : [];
    const matchedPipelineSignals = Array.isArray(input.matchedPipelineSignals) ? input.matchedPipelineSignals.slice(0, 30) : [];
    const sender = String(input.from || '').slice(0, 500);
    const senderKey = normalizeEmailSender(sender);
    sqlite.prepare(`INSERT INTO email_messages (id, provider, external_id, thread_id, subject, sender, sender_key, recipients, received_at, body, is_job_related, classification_score, matched_terms_json, matched_pipeline_signals_json, created_at, updated_at, seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(provider, external_id) DO UPDATE SET thread_id=excluded.thread_id, subject=excluded.subject, sender=excluded.sender, sender_key=excluded.sender_key, recipients=excluded.recipients, received_at=excluded.received_at, body=excluded.body, is_job_related=excluded.is_job_related, classification_score=excluded.classification_score, matched_terms_json=excluded.matched_terms_json, matched_pipeline_signals_json=excluded.matched_pipeline_signals_json, updated_at=excluded.updated_at`).run(
      emailId, String(input.provider || 'gmail').slice(0, 40), String(input.externalId || '').slice(0, 300), String(input.threadId || '').slice(0, 300), String(input.subject || '').slice(0, 1000), sender, senderKey, String(input.to || '').slice(0, 1000), input.receivedAt || null, String(input.body || '').slice(0, 200000), input.isJobRelated ? 1 : 0, Number(input.score) || 0, JSON.stringify(matchedTerms), JSON.stringify(matchedPipelineSignals), input.createdAt || timestamp, timestamp,
    );
    sqlite.prepare('DELETE FROM email_chunks WHERE email_id = ?').run(emailId);
    const insertChunk = sqlite.prepare('INSERT INTO email_chunks (id, email_id, chunk_index, content, created_at) VALUES (?, ?, ?, ?, ?)');
    for (const chunk of chunkText(`${input.subject || ''}\n${input.from || ''}\n${input.body || ''}`)) insertChunk.run(id('email-chunk'), emailId, chunk.index, chunk.content, timestamp);
    return getEmail(emailId);
  }
  function getEmail(emailId) {
    const row = sqlite.prepare('SELECT * FROM email_messages WHERE id = ?').get(String(emailId));
    if (!row) return null;
    return emailToRenderer(row);
  }
  function emailToRenderer(row) {
    const linkedJobIds = sqlite.prepare('SELECT job_id FROM email_job_links WHERE email_id = ? ORDER BY created_at ASC').all(row.id).map((entry) => entry.job_id);
    const senderKey = row.sender_key || normalizeEmailSender(row.sender);
    const isBlocked = Boolean(sqlite.prepare('SELECT 1 FROM email_sender_blocks WHERE sender_key = ?').get(senderKey));
    return { ...row, senderKey, isJobRelated: Boolean(row.is_job_related), isExcluded: Boolean(row.user_excluded), isSeen: Boolean(row.seen_at), isBlocked, matchedTerms: JSON.parse(row.matched_terms_json || '[]'), matchedPipelineSignals: JSON.parse(row.matched_pipeline_signals_json || '[]'), linkedJobIds };
  }
  function listEmails({ jobOnly = true, includeExcluded = false, includeBlocked = false, limit = 50 } = {}) {
    const conditions = [];
    if (jobOnly) conditions.push('is_job_related = 1');
    if (!includeExcluded) conditions.push('user_excluded = 0');
    if (!includeBlocked) conditions.push('NOT EXISTS (SELECT 1 FROM email_sender_blocks b WHERE b.sender_key = email_messages.sender_key)');
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = sqlite.prepare(`SELECT * FROM email_messages ${where} ORDER BY received_at DESC, updated_at DESC LIMIT ?`).all(Math.min(200, Math.max(1, Number(limit) || 50)));
    return rows.map(emailToRenderer);
  }
  function setEmailExcluded(input = {}) {
    const emailId = bounded(input.emailId, 160);
    if (!sqlite.prepare('SELECT 1 FROM email_messages WHERE id = ?').get(emailId)) throw new Error('Email not found.');
    sqlite.prepare('UPDATE email_messages SET user_excluded = ?, updated_at = ? WHERE id = ?').run(input.excluded ? 1 : 0, now(), emailId);
    return getEmail(emailId);
  }
  function markEmailSeen(input = {}) {
    const emailId = bounded(input.emailId, 160);
    if (!sqlite.prepare('SELECT 1 FROM email_messages WHERE id = ?').get(emailId)) throw new Error('Email not found.');
    const timestamp = now();
    sqlite.prepare('UPDATE email_messages SET seen_at = COALESCE(seen_at, ?), updated_at = ? WHERE id = ?').run(timestamp, timestamp, emailId);
    return getEmail(emailId);
  }
  function blockEmailSender(input = {}) {
    const sender = bounded(input.sender || input.senderKey, 500).trim();
    const senderKey = normalizeEmailSender(input.senderKey || sender);
    if (!senderKey) throw new Error('A sender is required.');
    const timestamp = now();
    sqlite.transaction(() => {
      sqlite.prepare('INSERT INTO email_sender_blocks (sender_key, sender, created_at) VALUES (?, ?, ?) ON CONFLICT(sender_key) DO UPDATE SET sender = excluded.sender').run(senderKey, sender || senderKey, timestamp);
      // Blocking a sender is also a relevance decision: every existing message from that sender is marked not relevant.
      sqlite.prepare('UPDATE email_messages SET user_excluded = 1, updated_at = ? WHERE sender_key = ?').run(timestamp, senderKey);
    })();
    return { senderKey, sender: sender || senderKey };
  }
  function unblockEmailSender(input = {}) {
    const senderKey = normalizeEmailSender(input.senderKey || input.sender);
    sqlite.prepare('DELETE FROM email_sender_blocks WHERE sender_key = ?').run(senderKey);
    return { senderKey };
  }
  function listBlockedEmailSenders() {
    return sqlite.prepare('SELECT sender_key AS senderKey, sender, created_at AS createdAt FROM email_sender_blocks ORDER BY sender COLLATE NOCASE ASC').all();
  }
  function linkEmailToJob(input = {}) {
    const emailId = bounded(input.emailId, 160); const jobId = bounded(input.jobId, 160);
    if (!sqlite.prepare('SELECT 1 FROM email_messages WHERE id = ?').get(emailId)) throw new Error('Email not found.');
    if (!sqlite.prepare('SELECT 1 FROM job_opportunities WHERE id = ? AND deleted_at IS NULL').get(jobId)) throw new Error('Pipeline job not found.');
    // An email is assigned to one pipeline job; replacing a link keeps the decision explicit and reversible.
    sqlite.prepare('INSERT INTO email_job_links (email_id, job_id, created_at) VALUES (?, ?, ?) ON CONFLICT(email_id) DO UPDATE SET job_id = excluded.job_id, created_at = excluded.created_at').run(emailId, jobId, now());
    return getEmail(emailId);
  }
  function unlinkEmailFromJob(input = {}) {
    const emailId = bounded(input.emailId, 160); const jobId = bounded(input.jobId, 160);
    sqlite.prepare('DELETE FROM email_job_links WHERE email_id = ? AND job_id = ?').run(emailId, jobId);
    return getEmail(emailId);
  }
  function searchEmailRag(query, limit = 10) {
    const chunks = sqlite.prepare('SELECT c.id, c.email_id AS emailId, c.chunk_index AS chunkIndex, c.content, e.subject, e.sender, e.received_at AS receivedAt FROM email_chunks c JOIN email_messages e ON e.id = c.email_id WHERE e.is_job_related = 1 AND e.user_excluded = 0').all();
    const bestByEmail = new Map();
    for (const chunk of searchChunks(chunks, query, Math.min(200, Math.max(1, Number(limit) || 10) * 20))) {
      const current = bestByEmail.get(chunk.emailId);
      if (!current || chunk.score > current.score || (chunk.score === current.score && chunk.chunkIndex < current.chunkIndex)) bestByEmail.set(chunk.emailId, chunk);
    }
    return [...bestByEmail.values()].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(b.receivedAt || '').localeCompare(String(a.receivedAt || ''));
    }).slice(0, Math.min(20, Math.max(1, Number(limit) || 10)));
  }

  seedDefaults();
  const hierarchyRepairResult = repairWorkspaceHierarchy();
  const seedResult = seedRoadmap();
  return {
    databasePath, seedResult, hierarchyRepairResult, db, sqlite, tables: tableMap,
    bootstrap, syncRoadmap, importRoadmap, saveNote, backup,
    createJobSearchRun, recordJobSearchAttempt, recordApiCall, listApiCalls, recordJobSearchRankingBatch, listJobSearchRankingBatches, finishJobSearchRun, listJobSearchAttempts,
    email: { upsert: upsertEmail, get: getEmail, list: listEmails, listForJob: listJobEmails, search: searchEmailRag, link: linkEmailToJob, unlink: unlinkEmailFromJob, setExcluded: setEmailExcluded, markSeen: markEmailSeen, blockSender: blockEmailSender, unblockSender: unblockEmailSender, listBlockedSenders: listBlockedEmailSenders },
    workspaces: { list: () => allActiveProjects().filter((entry) => entry.kind === 'workspace').map(projectToRenderer), get: (recordId) => { const row = db.select().from(projects).where(and(eq(projects.id, recordId), eq(projects.kind, 'workspace'))).get(); return row ? projectToRenderer(row) : null; }, create: (input) => upsertProject(input, 'workspace'), update: (input) => upsertProject(input, 'workspace'), delete: (recordId) => softDeleteProject(recordId) },
    projects: { list: () => allActiveProjects().filter((entry) => entry.kind === 'project').map(projectToRenderer), get: (recordId) => { const row = db.select().from(projects).where(eq(projects.id, recordId)).get(); return row ? projectToRenderer(row) : null; }, create: (input) => upsertProject(input, 'project'), update: (input) => upsertProject(input, 'project'), delete: (recordId) => softDeleteProject(recordId) },
    tasks: { list: () => allActiveTasks().map(taskToRenderer), get: (recordId) => { const row = db.select().from(tasks).where(eq(tasks.id, recordId)).get(); return row ? taskToRenderer(row) : null; }, create: (input) => upsertTask(input, 'task'), update: (input) => upsertTask(input), delete: (recordId) => softDelete(tasks, recordId) },
    jobs: { list: listJobs, create: upsertJob, update: upsertJob, delete: (recordId) => softDelete(jobOpportunities, recordId), activity: { list: listJobActivity, record: recordJobActivity }, followUps: { list: listJobFollowUps, create: createJobFollowUp, complete: completeJobFollowUp }, calendar: { list: listJobCalendarEvents, create: createJobCalendarEvent } }, profiles: { getCurrent: getProfile, upsert: upsertProfile }, resumes: { getMaster: getResume, upsertMaster: upsertResume },
    applications: { createOrResume: createOrResumeApplication, get: getApplication, getForJob: (jobId) => applicationToRenderer(sqlite.prepare('SELECT * FROM job_applications WHERE job_id = ? AND deleted_at IS NULL').get(bounded(jobId, 160))), listActive: () => sqlite.prepare('SELECT * FROM job_applications WHERE deleted_at IS NULL ORDER BY last_activity_at DESC').all().map(applicationToRenderer), transition: transitionApplication, abandon: abandonApplication, completeSubmission, listEvents: (applicationId) => sqlite.prepare('SELECT * FROM job_application_events WHERE application_id = ? ORDER BY created_at ASC').all(bounded(applicationId, 160)).map(eventToRenderer), recordEvent: recordApplicationEvent, listAnswers: (applicationId) => sqlite.prepare("SELECT * FROM job_application_answers WHERE deleted_at IS NULL AND (application_id = ? OR scope = 'global') ORDER BY updated_at DESC").all(bounded(applicationId, 160)).map(answerToRenderer), saveAnswer: saveApplicationAnswer, refreshReadiness: refreshApplicationReadiness, documents: { save: saveDocument, list: listDocuments, get: getDocument, update: updateDocument, approve: approveDocument, select: selectDocument, markExport: markDocumentExport } },
    close: () => sqlite.close(),
  };
}

module.exports = { createDatabase, tables: { projects, tasks, goals, userSettings, checkIns, notes, briefings, integrationsMetadata, calendarEvents, jobOpportunities, jobApplications, jobApplicationAnswers, jobApplicationEvents, jobApplicationDocuments }, parseCsv };
