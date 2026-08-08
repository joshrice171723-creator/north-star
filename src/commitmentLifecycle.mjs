// Commitment lifecycle derivation for Follow-through and Accountability (AICC-PHA-002 / AICC-TSK-004).
//
// This is a pure, read-only module over the persisted roadmap. It never invents
// completion, never stores a second copy of task state, and never mutates the
// roadmap. It only *derives* explainable commitment signals from the existing
// SQLite-backed records (status, priority, due date, blocked reason, next
// action, updated_at, createdAt, archived, deletedAt).
//
// Contract source: .hermes/plans/PHASE-04-follow-through-accountability.md (AICC-SUB-002).

// The roadmap records may use P0..P4 (seed) and low/medium/high/urgent
// (app-created) priorities. Higher weight = more important / surfaced first.
const PRIORITY_WEIGHT = {
  urgent: 0, P0: 0,
  high: 1, P1: 1,
  medium: 2, P2: 2, P3: 2,
  low: 3, P4: 3
};

const STATUS_LABEL = (status) => ({
  backlog: 'Backlog', todo: 'To do', 'in-progress': 'In progress',
  blocked: 'Blocked', done: 'Done', skipped: 'Skipped'
}[status] || status || 'Backlog');

// A record is considered inactive/excluded from follow-through when it is
// completed, archived, or soft-deleted. Completion evidence is `status === 'done'`
// (or skipped) only — viewing/reviewing never counts as completion.
function isInactive(record) {
  if (!record) return true;
  if (record.archived === true) return true;
  if (record.deletedAt) return true;
  const status = (record.status || '').toLowerCase();
  return status === 'done' || status === 'skipped';
}

const todayString = () => new Date().toISOString().slice(0, 10);

// Returns the number of whole calendar days between an ISO date string and the
// reference date string. Negative means the record was updated before the
// reference date (stale), null means the date was unavailable.
function daysBefore(referenceDate, recordDate) {
  if (!recordDate) return null;
  const r = Date.parse(referenceDate + 'T00:00:00Z');
  const d = Date.parse(recordDate.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(r) || Number.isNaN(d)) return null;
  return Math.floor((d - r) / 86400000);
}

// Default staleness threshold: 7 calendar days, as defined in the phase contract.
const DEFAULT_STALE_DAYS = 7;

function explainStale(days, threshold) {
  if (days === null) return 'stale: updated_at unavailable';
  return `stale: no update for ${-days} of ${threshold} days`;
}

function explainNeglected() {
  return 'neglected: active task has no next action';
}

function explainBlocked(record) {
  const reason = (record.blockedReason || '').trim();
  return reason ? `blocked: ${reason}` : 'blocked';
}

function explainOverdue(record) {
  return `overdue: due ${record.dueDate}`;
}

// Derive the full set of commitment signals for a single active task/subtask.
// Returns null for completed/archived/deleted records so they are never surfaced.
export function commitmentForTask(record, referenceDateString, options = {}) {
  if (isInactive(record)) return null;
  const referenceDate = referenceDateString || todayString();
  const staleThreshold = options.staleThresholdDays ?? DEFAULT_STALE_DAYS;

  const status = (record.status || 'backlog').toLowerCase();
  const priority = record.priority || 'medium';
  const dueDate = record.dueDate || null;
  const blockedReason = (record.blockedReason || '').trim();
  const blocked = status === 'blocked' || blockedReason.length > 0;
  const overdue = Boolean(dueDate && dueDate < referenceDate);
  const inProgress = status === 'in-progress';

  const updatedAt = record.updatedAt || null;
  const days = daysBefore(referenceDate, updatedAt || null);
  const stale = days !== null && -days >= staleThreshold;

  // Neglected requires staleness, no next action, and no stronger blocked or
  // overdue explanation. In-progress work can still be neglected when it has
  // not been updated and has no concrete next action.
  const neglected = stale
    && !blocked
    && !overdue
    && (record.nextAction == null || String(record.nextAction).trim() === '');

  return {
    id: record.id,
    title: record.title || '',
    status,
    statusLabel: STATUS_LABEL(status),
    priority,
    priorityWeight: typeof PRIORITY_WEIGHT[priority] === 'number' ? PRIORITY_WEIGHT[priority] : 2,
    dueDate,
    overdue,
    blocked,
    blockedReason,
    inProgress,
    scheduled: Boolean(dueDate && !overdue && (status === 'todo' || status === 'backlog')),
    stale,
    neglected,
    nextAction: record.nextAction || '',
    definitionOfDone: record.definitionOfDone || '',
    updatedAt,
    orderIndex: typeof record.orderIndex === 'number' ? record.orderIndex : (record.order || 0),
    reasons: [
      blocked && blockedReason ? explainBlocked({ blockedReason }) : blocked ? 'blocked' : null,
      overdue ? explainOverdue({ dueDate }) : null,
      stale ? explainStale(days, staleThreshold) : null,
      neglected ? explainNeglected() : null
    ].filter(Boolean)
  };
}

// Derive all commitment signals for an entire roadmap (read-only). The input
// roadmap is never mutated. Stable task IDs are preserved.
export function buildCommitmentLifecycle(roadmap, referenceDateString, options = {}) {
  const referenceDate = referenceDateString || todayString();
  const collections = [
    ...(Array.isArray(roadmap?.tasks) ? roadmap.tasks : []),
    ...(Array.isArray(roadmap?.subtasks) ? roadmap.subtasks : [])
  ];

  const items = collections
    .map((record) => commitmentForTask(record, referenceDate, options))
    .filter((item) => item !== null);

  return {
    date: referenceDate,
    items,
    counts: {
      committed: items.length,
      blocked: items.filter((item) => item.blocked).length,
      inProgress: items.filter((item) => item.inProgress).length,
      overdue: items.filter((item) => item.overdue).length,
      stale: items.filter((item) => item.stale).length,
      neglected: items.filter((item) => item.neglected).length
    }
  };
}

export { DEFAULT_STALE_DAYS, isInactive };