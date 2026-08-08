// Today View derivation.
//
// Release 1 -> Today View contract (task AICC-TSK-002) and the grounded
// next-actions prototype (task AICC-TSK-003) are built here as a pure
// function over the persisted roadmap. The view never invents tasks or
// metrics, never stores a second copy of task state, and never mutates the
// roadmap. It only *derives* an ordered, explainable daily picture from the
// existing SQLite-backed records (status, priority, due date, blocked
// reason, next action, release, phase, project).

// Existing roadmap tasks use P0..P4 (seed) and low/medium/high/urgent
// (app-created). Higher weight = more important / surfaced first.
const PRIORITY_WEIGHT = {
  urgent: 0, P0: 0,
  high: 1, P1: 1,
  medium: 2, P2: 2, P3: 2,
  low: 3, P4: 3
};
const PRIORITY_LABEL = (priority) => {
  const value = String(priority || '').toUpperCase();
  if (value === 'URGENT') return 'Urgent';
  if (value === 'P0') return 'P0';
  if (value === 'P1') return 'High';
  if (value === 'P2') return 'Medium';
  if (value === 'P3') return 'Medium';
  if (value === 'P4') return 'Low';
  if (['HIGH', 'MEDIUM', 'LOW'].includes(value)) return value.charAt(0) + value.slice(1).toLowerCase();
  return 'Medium';
};
const STATUS_WEIGHT = { blocked: 0, 'in-progress': 1, todo: 2, backlog: 3 };
const STATUS_LABEL = (status) => ({
  backlog: 'Backlog', todo: 'To do', 'in-progress': 'In progress',
  blocked: 'Blocked', done: 'Done'
}[status] || status || 'Backlog');
const todayString = () => new Date().toISOString().slice(0, 10);
const isDone = (task) => task?.status === 'done' || task?.archived === true;

function labelFor(records, id) {
  if (!id) return null;
  const entry = records?.find((record) => record.id === id);
  return entry?.title || entry?.name || null;
}

// Gives the glyph/kind shown on the task row so the user can see where the
// grounded action lives in the hierarchy.
function contextFor(task, roadmap) {
  const project = labelFor(roadmap?.projects, task.projectId);
  const release = labelFor(roadmap?.releases, task.releaseId);
  const phase = labelFor(roadmap?.phases, task.phaseId);
  return { project, release, phase };
}

export function buildTodayView(roadmap, referenceDateString) {
  const today = referenceDateString || todayString();
  const projects = Array.isArray(roadmap?.projects) ? roadmap.projects : [];
  const releases = Array.isArray(roadmap?.releases) ? roadmap.releases : [];
  const phases = Array.isArray(roadmap?.phases) ? roadmap.phases : [];
  const tasks = [
    ...(Array.isArray(roadmap?.tasks) ? roadmap.tasks : []),
    ...(Array.isArray(roadmap?.subtasks) ? roadmap.subtasks : [])
  ];

  const items = tasks
    .filter((task) => !isDone(task) && task?.title)
    .map((task, index) => {
      const priority = task.priority || 'medium';
      const status = task.status || 'backlog';
      const context = contextFor(task, { projects, releases, phases });
      return {
        id: task.id,
        title: task.title,
        status,
        statusLabel: STATUS_LABEL(status),
        priority,
        priorityLabel: PRIORITY_LABEL(priority),
        dueDate: task.dueDate || null,
        overdue: Boolean(task.dueDate && task.dueDate < today),
        blocked: status === 'blocked' || Boolean(task.blockedReason),
        blockedReason: task.blockedReason || '',
        nextAction: task.nextAction || '',
        project: context.project,
        release: context.release,
        phase: context.phase,
        orderIndex: typeof task.orderIndex === 'number' ? task.orderIndex : (task.order || index),
        sortPriority: typeof PRIORITY_WEIGHT[priority] === 'number' ? PRIORITY_WEIGHT[priority] : 2,
        sortStatus: typeof STATUS_WEIGHT[status] === 'number' ? STATUS_WEIGHT[status] : 3
      };
    });

  const ordered = [...items].sort((a, b) =>
    a.sortStatus - b.sortStatus ||
    a.sortPriority - b.sortPriority ||
    (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99') ||
    a.title.localeCompare(b.title)
  );

  return {
    date: today,
    items: ordered,
    counts: {
      actionable: ordered.length,
      focus: ordered.filter((item) => item.status === 'in-progress' || item.status === 'todo').length,
      blocked: ordered.filter((item) => item.blocked).length,
      overdue: ordered.filter((item) => item.overdue).length
    }
  };
}
