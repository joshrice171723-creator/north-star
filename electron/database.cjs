const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BetterSqlite3 = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { eq, isNull, and, asc, desc } = require('drizzle-orm');
const { sqliteTable, text, integer, index, uniqueIndex } = require('drizzle-orm/sqlite-core');

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

const tableMap = { projects, tasks, goals, checkIns, notes, briefings, integrationsMetadata, calendarEvents };
const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const nonEmpty = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;
const bounded = (value, max = 10000) => String(value ?? '').slice(0, max);

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

  seedDefaults();
  const hierarchyRepairResult = repairWorkspaceHierarchy();
  const seedResult = seedRoadmap();
  return {
    databasePath, seedResult, hierarchyRepairResult, db, sqlite, tables: tableMap,
    bootstrap, syncRoadmap, importRoadmap, saveNote, backup,
    workspaces: { list: () => allActiveProjects().filter((entry) => entry.kind === 'workspace').map(projectToRenderer), get: (recordId) => { const row = db.select().from(projects).where(and(eq(projects.id, recordId), eq(projects.kind, 'workspace'))).get(); return row ? projectToRenderer(row) : null; }, create: (input) => upsertProject(input, 'workspace'), update: (input) => upsertProject(input, 'workspace'), delete: (recordId) => softDeleteProject(recordId) },
    projects: { list: () => allActiveProjects().filter((entry) => entry.kind === 'project').map(projectToRenderer), get: (recordId) => { const row = db.select().from(projects).where(eq(projects.id, recordId)).get(); return row ? projectToRenderer(row) : null; }, create: (input) => upsertProject(input, 'project'), update: (input) => upsertProject(input, 'project'), delete: (recordId) => softDeleteProject(recordId) },
    tasks: { list: () => allActiveTasks().map(taskToRenderer), get: (recordId) => { const row = db.select().from(tasks).where(eq(tasks.id, recordId)).get(); return row ? taskToRenderer(row) : null; }, create: (input) => upsertTask(input, 'task'), update: (input) => upsertTask(input), delete: (recordId) => softDelete(tasks, recordId) },
    close: () => sqlite.close(),
  };
}

module.exports = { createDatabase, tables: { projects, tasks, goals, userSettings, checkIns, notes, briefings, integrationsMetadata, calendarEvents }, parseCsv };
