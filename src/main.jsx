import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BriefcaseBusiness, BookOpen, Brain, CalendarClock, Check, ChevronDown, ChevronRight, ExternalLink, FileText, Flame, LayoutDashboard, ListChecks, Pencil, Play, Plus, Search, Settings, Star, Target, Trash2, X } from 'lucide-react';
import JobsView, { EmailMonitorPanel } from './JobsView.jsx';
import './styles.css';
import './theme.css';
import { buildRoadmapHierarchy, workspaceProjects, kanbanTasksForScope } from './roadmapHierarchy.mjs';
import { buildTodayView } from './todayView.mjs';
import { buildFollowThroughView } from './followThroughView.mjs';
import { buildCoachContext, buildDeterministicCoachGuidance } from './coachContext.mjs';
import { buildCoachCardModel } from './coachPresentation.mjs';
import { buildCoachProviderMessages, normalizeCoachProviderResponse, OPENROUTER_COACH_MODEL } from './coachProvider.mjs';

const examFacts = [
  ['Exam code', 'CCAR-P'], ['Questions', '63 questions'], ['Duration', '120 minutes'],
  ['Question types', 'Multiple-choice & multiple-response'], ['Passing score', '720 / 1,000 scaled score'],
  ['Exam fee', '$175 USD'], ['Delivery', 'Online proctored or Pearson VUE test center'], ['Validity', '12 months']
];

const examDomains = [
  ['Integration', 19], ['Solution Design & Architecture', 17], ['Evaluation, Testing & Optimization', 16],
  ['Governance, Safety & Risk Management', 14], ['Stakeholder Communication & Lifecycle Management', 14],
  ['Claude Models, Prompting & Context Engineering', 13], ['Developer Productivity & Operational Enablement', 7]
];
const domainBlueprint = examDomains.map(([label, weight], index) => ({ id: `domain-${index + 1}`, label, weight }));

const STATUS_LABELS = ['Not started', 'In progress', 'Complete', 'Skipped / already experienced'];
const item = (id, title, type, meta = {}, children = []) => ({ id, title, type, status: 'Not started', children, ...meta });
const numbered = (prefix, count, type) => Array.from({ length: count }, (_, index) => item(`${prefix}-${index + 1}`, `${type === 'lecture' ? 'Lecture' : 'Quiz'} ${String(index + 1).padStart(2, '0')}`, type));
const flattenItems = (items) => items.flatMap((entry) => [entry, ...flattenItems(entry.children || [])]);
const getStatus = (entry) => entry.children?.length ? (entry.children.every((child) => child.status === 'Complete') ? 'Complete' : entry.children.some((child) => child.status !== 'Not started') ? 'In progress' : 'Not started') : entry.status;
const getProgress = (entry) => entry.children?.length ? Math.round(entry.children.filter((child) => child.status === 'Complete').length / entry.children.length * 100) : (getStatus(entry) === 'Complete' || getStatus(entry) === 'Skipped / already experienced' ? 100 : getStatus(entry) === 'In progress' ? 50 : 0);
const updateEntries = (items, id, status) => items.map((entry) => entry.id === id ? { ...entry, status } : { ...entry, children: updateEntries(entry.children || [], id, status) });

const curriculum = [
  { id: 'recommended', title: 'Official recommended preparation', accent: '#6d8cff', type: 'official-recommended', note: 'Recommended preparation only. Anthropic does not make course order or completion mandatory.', lessons: [
    item('claude-101', 'Claude 101', 'course', { duration: 'Course', academyUrl: 'https://anthropic.skilljar.com/claude-101', domainIds: ['domain-6'] }),
    item('ai-fluency', 'AI Fluency: Framework & Foundations', 'course', { duration: 'Course', academyUrl: 'https://anthropic.skilljar.com/ai-fluency-framework-foundations', domainIds: ['domain-5', 'domain-6'] }),
    item('ai-capabilities', 'AI Capabilities and Limitations', 'course', { duration: 'Course', academyUrl: 'https://anthropic.skilljar.com/ai-capabilities-and-limitations', domainIds: ['domain-4', 'domain-6'] }),
    item('claude-api', 'Building with the Claude API', 'course', { duration: '84 lectures / 10 quizzes', academyUrl: 'https://anthropic.skilljar.com/claude-with-the-anthropic-api', domainIds: ['domain-1', 'domain-6', 'domain-7'], note: 'Anthropic displayed total: 84 lectures and 10 quizzes. Public section counts total 87 lectures; both figures are shown because they differ.' }),
    item('mcp-intro', 'Introduction to Model Context Protocol', 'course', { duration: '16 lectures / 1 quiz', academyUrl: 'https://anthropic.skilljar.com/introduction-to-model-context-protocol', domainIds: ['domain-1', 'domain-6'] }),
    item('claude-code', 'Claude Code in Action', 'course', { duration: 'Course', academyUrl: 'https://anthropic.skilljar.com/claude-code-in-action', domainIds: ['domain-7'] })
  ]},
  { id: 'professional-prep', title: 'Official Professional Prep Course', accent: '#7d9edc', type: 'professional-prep', note: 'Official Professional Prep Course  /  733 minutes total (approximately 12 hours 13 minutes).', lessons: [
    item('platform-design', 'Claude Platform & Solution Design', 'module', { duration: '238 min', domainIds: ['domain-2', 'domain-3'] }),
    item('enterprise-production', 'Enterprise Integration & Production', 'module', { duration: '158 min', domainIds: ['domain-1', 'domain-4'] }),
    item('responsible-ai', 'Responsible AI, Safety & Risk for Architects', 'module', { duration: '114 min', domainIds: ['domain-4'] }),
    item('stakeholder-lifecycle', 'Stakeholder Engagement, Lifecycle & GTM', 'module', { duration: '178 min', domainIds: ['domain-5'] }),
    item('team-enablement', 'Team Enablement & Operational Productivity', 'module', { duration: '45 min', domainIds: ['domain-7', 'domain-5'] })
  ]},
  { id: 'supplemental', title: 'Official supplemental preparation', accent: '#b394df', type: 'supplemental', note: 'Optional preparation. Platform branches are not required Professional-path steps.', lessons: [
    item('mcp-advanced', 'Model Context Protocol: Advanced Topics', 'course', { duration: '15 lectures  /  2 quizzes  /  ~1.1 hr', academyUrl: 'https://anthropic.skilljar.com/model-context-protocol-advanced-topics', domainIds: ['domain-1', 'domain-6'], note: 'Lecture names are unavailable until authenticated course access. Numbered placeholders preserve the public count without inventing titles.' }, [...numbered('mcp-advanced-lecture', 15, 'lecture'), ...numbered('mcp-advanced-quiz', 2, 'quiz')]),
    item('bedrock', 'Claude with Amazon Bedrock', 'course', { duration: '85 lectures  /  10 quizzes', academyUrl: 'https://anthropic.skilljar.com/claude-in-amazon-bedrock', domainIds: ['domain-1'], note: 'Optional platform specialization' }),
    item('google-cloud', 'Claude on Google Cloud', 'course', { duration: '85 lectures  /  10 quizzes', academyUrl: 'https://anthropic.skilljar.com/claude-with-google-vertex', domainIds: ['domain-1'], note: 'Optional platform specialization' })
  ]},
  { id: 'practice', title: 'App-created practice', accent: '#72b997', type: 'practice', note: 'Practice created by this app, not official Anthropic Academy content or official exam questions.', lessons: [
    item('practice-solution', 'Solution design scenarios', 'practice', { duration: 'Practice set' }),
    item('practice-integration', 'Integration scenarios', 'practice', { duration: 'Practice set' }),
    item('practice-evaluation', 'Evaluation and optimization drills', 'practice', { duration: 'Practice set' }),
    item('practice-governance', 'Governance and safety drills', 'practice', { duration: 'Practice set' }),
    item('practice-stakeholder', 'Stakeholder/lifecycle drills', 'practice', { duration: 'Practice set' }),
    item('practice-cross-domain', 'Cross-domain scenarios', 'practice', { duration: 'Practice set' }),
    item('practice-mock', 'Full mock exam', 'practice', { duration: 'Practice set' })
  ]}
];

const prompts = ['Explain this lesson simply', 'Quiz me on what I studied', 'Give me an architecture scenario'];
const STORAGE_KEY = 'claude-architect-study-workspace-v1';
const PROJECT_STATUSES = [['backlog','Backlog'],['todo','To do'],['in-progress','In progress'],['blocked','Blocked'],['done','Done']];
const TASK_PRIORITIES = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['urgent', 'Urgent']];
const priorityLabel = (priority) => TASK_PRIORITIES.find(([value]) => value === priority)?.[1] || 'Medium';
const isTaskOverdue = (task) => Boolean(task.dueDate && task.status !== 'done' && task.dueDate < new Date().toISOString().slice(0, 10));
const emptyRoadmap = () => ({ schemaVersion: 3, workspace: { id: 'default', kind: 'workspace', type: 'workspace', title: 'Executive workspace', archived: false }, workspaces: [], projects: [], releases: [], phases: [], tasks: [], subtasks: [] });
const normalizeRoadmap = (parsed) => {
  if ([2, 3].includes(parsed?.schemaVersion) && parsed.workspace && ['projects','releases','phases','tasks','subtasks'].every((key) => Array.isArray(parsed[key]))) {
    const normalize = (entry, fallbackKind) => ({ ...entry, kind: entry.kind || fallbackKind, type: entry.type || entry.kind || fallbackKind, title: entry.title || entry.name || 'Untitled', archived: Boolean(entry.archived) });
    const workspaces = (Array.isArray(parsed.workspaces) ? parsed.workspaces : [parsed.workspace]).map((entry) => normalize(entry, 'workspace'));
    return { ...emptyRoadmap(), ...parsed, workspace: normalize(parsed.workspace, 'workspace'), workspaces, projects: parsed.projects.map((entry) => normalize(entry, 'project')).filter((entry) => entry.kind === 'project'), releases: parsed.releases.map((entry) => normalize(entry, 'release')), phases: parsed.phases.map((entry) => normalize(entry, 'phase')), tasks: parsed.tasks.map((entry) => normalize(entry, 'task')), subtasks: parsed.subtasks.map((entry) => normalize(entry, 'subtask')) };
  }
  if (parsed?.schemaVersion === 1 && Array.isArray(parsed.projects) && Array.isArray(parsed.tasks)) {
    const projects = parsed.projects.map((p) => ({ ...p, title: p.title || p.name || 'Untitled project', description: p.description || '', type: 'project', archived: Boolean(p.archived) }));
    const projectIds = new Set(projects.map((p) => p.id));
    return { ...emptyRoadmap(), projects, tasks: parsed.tasks.filter((t) => projectIds.has(t.projectId)).map((t) => ({ ...t, type: 'task', parentId: null })) };
  }
  return emptyRoadmap();
};

const ROADMAP_STATUS_OPTIONS = [['backlog', 'Backlog'], ['todo', 'To do'], ['in-progress', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done']];
const ROADMAP_PRIORITY_OPTIONS = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['urgent', 'Urgent']];
const dbRecordId = (prefix) => `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const roadmapCollections = (roadmap) => [...roadmap.projects, ...roadmap.releases, ...roadmap.phases, ...roadmap.tasks, ...roadmap.subtasks];

function DatabaseRoadmapWorkspace({ roadmap, refreshRoadmap, selectedProjectId, setSelectedProjectId, focusTaskId, onFocusTaskHandled }) {
  const [mode, setMode] = useState('roadmap');
  const [draft, setDraft] = useState('');
  const [workspaceComposerOpen, setWorkspaceComposerOpen] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(roadmap.workspace?.id || null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [detail, setDetail] = useState(null);
  const [kanbanScope, setKanbanScope] = useState(null);
  const [expanded, setExpanded] = useState({ 'AICC-WS-001': true });
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nodes = roadmapCollections(roadmap);
  const projectNodes = roadmap.projects;
  const hierarchy = useMemo(() => buildRoadmapHierarchy(roadmap), [roadmap]);
  const workspaceNodes = hierarchy.workspaces;
  const selectedProject = projectNodes.find((entry) => entry.id === selectedProjectId) || null;
  const selectedWorkspaceId = selectedProject?.parentId || activeWorkspaceId || null;
  const selectedWorkspace = workspaceNodes.find((entry) => entry.id === selectedWorkspaceId) || null;
  const scopedProjectNodes = projectNodes.filter((entry) => !selectedWorkspaceId || entry.parentId === selectedWorkspaceId);
  const children = (parentId) => (hierarchy.childrenById.get(parentId) || []).filter((entry) => entry.kind !== 'workspace' && entry.type !== 'workspace').filter((entry) => showArchived || !entry.archived).sort((a, b) => (a.orderIndex ?? a.order ?? 0) - (b.orderIndex ?? b.order ?? 0));
  const allRoadmapTasks = [...roadmap.tasks, ...roadmap.subtasks].filter((task) => !task.archived);
  const topLevelTasks = roadmap.tasks.filter((task) => !task.archived);
  const assignedTaskCount = (entry) => {
    if (entry.kind === 'workspace') return topLevelTasks.filter((task) => projectNodes.some((project) => project.parentId === entry.id && project.id === task.projectId)).length;
    if (entry.kind === 'project') return topLevelTasks.filter((task) => task.projectId === entry.id).length;
    if (entry.kind === 'release') return topLevelTasks.filter((task) => task.releaseId === entry.id).length;
    if (entry.kind === 'phase') return topLevelTasks.filter((task) => task.phaseId === entry.id).length;
    return allRoadmapTasks.filter((task) => task.parentTaskId === entry.id).length;
  };
  const visibleTasks = (kanbanScope ? kanbanTasksForScope(roadmap, kanbanScope, topLevelTasks) : topLevelTasks.filter((task) => !selectedProjectId || task.projectId === selectedProjectId)).filter((task) => (!query.trim() || JSON.stringify(task).toLowerCase().includes(query.trim().toLowerCase())) && (statusFilter === 'all' || task.status === statusFilter) && (priorityFilter === 'all' || task.priority === priorityFilter)).sort((a, b) => (a.orderIndex ?? a.order ?? 0) - (b.orderIndex ?? b.order ?? 0));
  const unscheduledTasks = visibleTasks.filter((task) => !task.releaseId && !task.phaseId);
  const subtasksFor = (taskId) => roadmap.subtasks.filter((subtask) => !subtask.archived && subtask.parentTaskId === taskId).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  useEffect(() => {
    if (!focusTaskId) return;
    const record = allRoadmapTasks.find((task) => task.id === focusTaskId);
    if (record) {
      setDetail(record);
      onFocusTaskHandled?.();
    }
  }, [focusTaskId, roadmap.tasks, roadmap.subtasks]);
  const run = async (operation) => { setBusy(true); setError(''); try { await operation(); await refreshRoadmap(); } catch (cause) { setError(cause?.message || 'Database operation failed.'); } finally { setBusy(false); } };
  const makeWorkspace = async () => { const title = draft.trim(); if (!title) return; let createdId = null; await run(async () => { const created = await window.desktopShell.createWorkspace({ id: dbRecordId('workspace'), kind: 'workspace', type: 'workspace', title, status: 'backlog', priority: 'medium', orderIndex: workspaceNodes.length }); createdId = created?.id || null; }); if (createdId) { setActiveWorkspaceId(createdId); setSelectedProjectId(null); setWorkspaceComposerOpen(false); setDraft(''); } };
  const makeProject = async () => { const title = draft.trim(); if (!title || !selectedWorkspaceId) return; let createdId = null; await run(async () => { const created = await window.desktopShell.createProject({ id: dbRecordId('project'), parentId: selectedWorkspaceId, kind: 'project', title, status: 'backlog', priority: 'medium', orderIndex: projectNodes.filter((entry) => entry.parentId === selectedWorkspaceId).length }); createdId = created?.id || null; }); if (createdId) setSelectedProjectId(createdId); setDraft(''); };
  const makeTask = async (parent) => { const title = draft.trim(); if (!title || !selectedProjectId) return; const phase = parent?.type === 'phase' ? parent : roadmap.phases.find((entry) => entry.id === parent?.id) || null; await run(() => window.desktopShell.createTask({ id: dbRecordId('task'), projectId: selectedProjectId, parentTaskId: null, phaseId: phase?.id || null, releaseId: phase?.parentId || null, title, status: 'todo', priority: 'medium', orderIndex: visibleTasks.filter((entry) => entry.status === 'todo').length })); setDraft(''); };
  const makeSubtask = async (parentTask) => { const title = draft.trim(); if (!title || !parentTask) return; await run(() => window.desktopShell.createTask({ id: dbRecordId('subtask'), projectId: parentTask.projectId, parentTaskId: parentTask.id, phaseId: parentTask.phaseId || null, releaseId: parentTask.releaseId || null, title, status: 'todo', priority: parentTask.priority || 'medium', orderIndex: subtasksFor(parentTask.id).length, type: 'subtask' })); setDraft(''); };
  const saveDetail = async () => { if (!detail?.title?.trim()) return; if (detail.status === 'blocked' && !detail.blockedReason?.trim()) { setError('Add a reason before saving a blocked item.'); return; } const payload = { ...detail, title: detail.title.trim(), orderIndex: detail.orderIndex ?? detail.order ?? 0 }; await run(() => detail.type === 'task' || detail.type === 'subtask' ? window.desktopShell.updateTask(payload) : window.desktopShell.updateProject(payload)); setDetail(null); };
  const deleteRecord = async (record) => { if (!record || !window.confirm(`Delete "${record.title}"?`)) return; await run(() => record.type === 'task' || record.type === 'subtask' ? window.desktopShell.deleteTask(record.id) : window.desktopShell.deleteProject(record.id)); setDetail(null); };
  const deleteDetail = () => deleteRecord(detail);
  const archiveProject = (project) => run(() => window.desktopShell.updateProject({ ...project, title: project.title || project.name, archived: !project.archived, deletedAt: null }));
  const updateTaskStatus = (task, status) => { if (status === 'blocked' && !task.blockedReason?.trim()) { setDetail({ ...task, status }); return; } return run(() => window.desktopShell.updateTask({ ...task, title: task.title, status, orderIndex: visibleTasks.filter((entry) => entry.status === status && entry.id !== task.id).length })); };
  const updateTaskOrder = (task, status, targetId = null) => { const destination = visibleTasks.filter((entry) => entry.projectId === task.projectId && entry.status === status && entry.id !== task.id); const foundIndex = targetId ? destination.findIndex((entry) => entry.id === targetId) : destination.length; const index = foundIndex < 0 ? destination.length : foundIndex; destination.splice(index, 0, { ...task, status }); run(async () => { for (const [orderIndex, entry] of destination.entries()) await window.desktopShell.updateTask({ ...entry, status, orderIndex }); }); };
  const openRoadmapRecord = (task) => {
    const nodeById = new Map(nodes.map((entry) => [entry.id, entry]));
    const pathIds = [];
    let parentId = task.parentId || task.parentTaskId || task.phaseId || task.releaseId || task.projectId;
    while (parentId) {
      pathIds.push(parentId);
      parentId = nodeById.get(parentId)?.parentId || null;
    }
    if (roadmap.workspace?.id) pathIds.push(roadmap.workspace.id);
    setSelectedProjectId(task.projectId);
    setExpanded(Object.fromEntries([...new Set(pathIds)].map((id) => [id, true])));
    setDetail(null);
    setMode('roadmap');
  };
  const openKanbanScope = (entry) => { setKanbanScope(entry); setDetail(null); setStatusFilter('all'); setQuery(''); setMode('kanban'); };
  const clearKanbanScope = () => setKanbanScope(null);
  const tree = (entry, depth = 0) => <div key={entry.id}><div className={`roadmap-row ${detail?.id === entry.id ? 'selected' : ''}`} style={{ paddingLeft: 10 + depth * 18 }} onClick={() => { if (entry.kind === 'project') { setActiveWorkspaceId(entry.parentId); setSelectedProjectId(entry.id); } else if (entry.kind === 'workspace') { setActiveWorkspaceId(entry.id); setSelectedProjectId(null); } setDetail(entry); }}><button className="roadmap-kanban-link" onClick={(event) => { event.stopPropagation(); openKanbanScope(entry); }}>Kanban</button><button aria-label={`Toggle ${entry.title}`} onClick={(event) => { event.stopPropagation(); setExpanded((current) => ({ ...current, [entry.id]: !current[entry.id] })); }}>{children(entry.id).length ? (expanded[entry.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span style={{ width: 13 }} />}</button><span className={`type-pill ${entry.type || entry.kind}`}>{entry.type || entry.kind}</span><b>{entry.title}</b><span className="roadmap-task-count">{assignedTaskCount(entry)} {assignedTaskCount(entry) === 1 ? 'task' : 'tasks'}</span><span className={`status-chip ${entry.status}`}>{entry.status}</span></div>{expanded[entry.id] && children(entry.id).map((child) => tree(child, depth + 1))}</div>;
  const renderTaskCard = (task) => <div className="task-card" draggable key={task.id} onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)} onDoubleClick={() => setDetail(task)}><div className="task-card-top"><b>{task.title}</b><span className="priority-badge">{task.priority}</span></div>{task.status === 'blocked' && <div className="blocked-summary"><b>Why blocked</b><span>{task.blockedReason || 'Reason required - open this item to add one.'}</span></div>}<div className="subtask-summary">{subtasksFor(task.id).length} subtask{subtasksFor(task.id).length === 1 ? '' : 's'}</div><div className="task-card-actions"><button className="roadmap-link" onClick={() => openRoadmapRecord(task)}>Roadmap</button><select aria-label={`Status for ${task.title}`} value={task.status} onChange={(event) => updateTaskStatus(task, event.target.value)}>{ROADMAP_STATUS_OPTIONS.map(([value, optionLabel]) => <option key={value} value={value}>{optionLabel}</option>)}</select><button aria-label={`Edit ${task.title}`} onClick={() => setDetail(task)}><Pencil size={13} /></button><button aria-label={`Delete ${task.title}`} onClick={() => deleteRecord(task)}><Trash2 size={13} /></button></div></div>;
  return <section className="projects-workspace"><div className="section-head compact"><div><span className="eyebrow">SQLITE-BACKED ROADMAP</span><h2>Workspaces, projects, releases, phases, and tasks</h2><p>{busy ? 'Saving database changes...' : 'Canonical hierarchy and local work state.'}</p></div><div className="roadmap-tabs"><button className={mode === 'roadmap' ? 'active' : ''} onClick={() => setMode('roadmap')}>Roadmap</button><button className={mode === 'kanban' ? 'active' : ''} onClick={() => setMode('kanban')}>Kanban</button></div></div>{error && <div className="database-error" role="alert">{error}</div>}<div className="roadmap-toolbar"><button className={showArchived ? 'secondary active' : 'secondary'} onClick={() => setShowArchived((value) => !value)}>{showArchived ? 'Hide archived' : 'Show archived'}</button><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={workspaceComposerOpen ? 'New workspace name' : selectedProjectId ? 'New task or project title' : 'New project title'} onKeyDown={(event) => { if (event.key === 'Enter') workspaceComposerOpen ? makeWorkspace() : selectedProjectId ? makeTask() : makeProject(); }} />{workspaceComposerOpen ? <button className="primary" disabled={busy || !draft.trim()} onClick={makeWorkspace}><Plus size={14} /> Add Workspace</button> : selectedProjectId ? <><button className="primary" disabled={busy} onClick={() => makeTask()}><Plus size={14} /> Add task</button><button className="secondary" disabled={busy || !selectedWorkspaceId} onClick={() => makeProject()}><Plus size={14} /> Add project</button></> : <><button className="secondary" disabled={busy || !selectedWorkspaceId} onClick={makeProject}><Plus size={14} /> Add project</button></>}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks..." /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{ROADMAP_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={label}>{label}</option>)}</select><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">All priorities</option>{ROADMAP_PRIORITY_OPTIONS.map(([value, label]) => <option key={value} value={label}>{label}</option>)}</select></div>{mode === 'roadmap' ? <div className="roadmap-layout"><aside className="projects-list"><button className={`workspace-row${workspaceComposerOpen ? ' active' : ''}`} disabled={busy} onClick={() => { setWorkspaceComposerOpen(true); setSelectedProjectId(null); setDraft(''); }}><Plus size={14} /> New Workspace</button><div className="workspace-list-label">Workspaces</div>{workspaceNodes.filter((entry) => showArchived || !entry.archived).map((workspace) => { const projectCount = workspaceProjects(roadmap, workspace.id).filter((project) => showArchived || !project.archived).length; return <button key={workspace.id} className={`workspace-heading${activeWorkspaceId === workspace.id && !workspaceComposerOpen ? ' active' : ''}`} onClick={() => { setActiveWorkspaceId(workspace.id); setSelectedProjectId(null); setWorkspaceComposerOpen(false); setDraft(''); }}><b>{workspace.title}</b><small>{projectCount} {projectCount === 1 ? 'project' : 'projects'}</small></button>; })}</aside><div className="roadmap-tree">{workspaceNodes.filter((entry) => showArchived || !entry.archived).map((workspace) => tree(workspace, 0))}</div></div> : <div className="kanban-board roadmap-kanban">{kanbanScope && <div className="kanban-scope"><span className="kanban-scope-label"><b>{kanbanScope.type || kanbanScope.kind}</b>  /  {kanbanScope.title}</span><button className="secondary" onClick={clearKanbanScope}><X size={13} /> Clear filter</button></div>}{ROADMAP_STATUS_OPTIONS.map(([status, label]) => <div className="kanban-column" key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain'); const task = visibleTasks.find((entry) => entry.id === id); if (task) updateTaskOrder(task, status); }}><div className="column-heading"><b>{label}</b><span>{visibleTasks.filter((entry) => entry.status === status).length}</span></div>{visibleTasks.filter((entry) => entry.status === status).map(renderTaskCard)}</div>)}</div>}{detail && <div className="modal" onClick={() => setDetail(null)}><div className="notes roadmap-detail" onClick={(event) => event.stopPropagation()}><button className="close" onClick={() => setDetail(null)}><X size={18} /></button><span className="eyebrow">DATABASE RECORD</span><h2>Edit {detail.type || detail.kind}</h2><input className="edit-field" value={detail.title} onChange={(event) => setDetail({ ...detail, title: event.target.value })} /><textarea value={detail.description || ''} onChange={(event) => setDetail({ ...detail, description: event.target.value })} placeholder="Description" />{(detail.type === 'task' || detail.type === 'subtask') && <><div className="subtask-editor"><h3>Subtasks</h3>{subtasksFor(detail.id).map((subtask) => <div className="subtask-row" key={subtask.id}><span>{subtask.title}</span><button onClick={() => setDetail(subtask)}><Pencil size={13} /></button></div>)}<div className="subtask-create"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="New subtask" /><button className="secondary" onClick={() => makeSubtask(detail)}><Plus size={14} /> Add subtask</button></div></div></>}{detail.status === 'blocked' && <div className="blocked-reason-section"><h3>Why itâ€™s blocked</h3><p>Explain what is preventing this item from moving forward.</p><textarea aria-label="Why it is blocked" value={detail.blockedReason || ''} onChange={(event) => setDetail({ ...detail, blockedReason: event.target.value })} placeholder="Example: Waiting for approval, information, access, or another taskâ€¦" required /></div>}<div className="detail-grid"><label>Status<select value={detail.status || 'backlog'} onChange={(event) => setDetail({ ...detail, status: event.target.value })}>{ROADMAP_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Priority<select value={detail.priority || 'medium'} onChange={(event) => setDetail({ ...detail, priority: event.target.value })}>{ROADMAP_PRIORITY_OPTIONS.map(([value, label]) => <option key={value} value={label}>{label}</option>)}</select></label><label>Order<input type="number" min="0" value={detail.orderIndex  /  detail.order  /  0} onChange={(event) => setDetail({ ...detail, orderIndex: Number(event.target.value) })} /></label><label>Due date<input type="date" value={detail.dueDate || ''} onChange={(event) => setDetail({ ...detail, dueDate: event.target.value || null })} /></label></div><div className="modal-actions"><button className="secondary" onClick={deleteDetail}>Delete</button>{(detail.kind === 'project') && <button className="secondary" onClick={() => archiveProject(detail)}>Archive</button>}<button className="primary" onClick={saveDetail}>Save</button></div></div></div>}</section>;
}


const makeLocalId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const defaultExpanded = { recommended: true, 'professional-prep': true, supplemental: false, practice: false };
const practiceDrills = [
  { id: 'drill-integration', title: 'Integration boundary drill', domainIds: ['domain-1'], prompt: 'A team needs Claude to summarize support tickets while keeping customer records in its own systems. Which design choice best preserves a clear integration boundary?', options: ['Send the full customer database to the model on every request.', 'Use a controlled service boundary that retrieves only the relevant fields and logs the request.', 'Let each client call the model directly with a shared production key.'], answer: 1, rationale: 'A controlled boundary limits data exposure, centralizes policy, and makes the integration observable.' },
  { id: 'drill-solution-design', title: 'Solution design trade-off', domainIds: ['domain-2', 'domain-3'], prompt: 'A production team wants to improve answer quality without changing the model immediately. What is the strongest first step?', options: ['Define representative test cases and measure the current system against them.', 'Remove all safety checks so the model can be more creative.', 'Tune prompts based only on the last user complaint.'], answer: 0, rationale: 'Representative evaluation cases establish a baseline and make optimization decisions evidence-based.' },
  { id: 'drill-governance', title: 'Governance and risk drill', domainIds: ['domain-4'], prompt: 'Before deploying a high-impact workflow, which activity most directly supports responsible operation?', options: ['Document risk owners, escalation paths, and monitoring signals.', 'Assume the vendor handles every downstream risk.', 'Disable logging to reduce operational overhead.'], answer: 0, rationale: 'Clear ownership, escalation, and monitoring make risk controls actionable after launch.' },
  { id: 'drill-stakeholder', title: 'Stakeholder lifecycle drill', domainIds: ['domain-5'], prompt: 'A stakeholder asks why an AI workflow should be piloted before broad rollout. What is the best response?', options: ['A pilot creates a feedback loop to validate outcomes, adoption, and operational fit.', 'Pilots are required for every Anthropic product.', 'A pilot guarantees the system will pass the certification exam.'], answer: 0, rationale: 'Pilots reduce rollout risk and create evidence for iteration with the people who use and govern the system.' },
  { id: 'drill-context', title: 'Context engineering drill', domainIds: ['domain-6'], prompt: 'A long-running assistant receives inconsistent results because its context grows without structure. What should the team try first?', options: ['Add every prior message forever.', 'Define a deliberate context strategy with relevant retrieval, structure, and limits.', 'Randomly change the model temperature after each response.'], answer: 1, rationale: 'A deliberate context strategy keeps information relevant, structured, and within operational limits.' },
  { id: 'drill-operations', title: 'Operational enablement drill', domainIds: ['domain-7'], prompt: 'What most helps developers operate a Claude-powered feature consistently?', options: ['A shared runbook covering deployment, observability, rollback, and ownership.', 'A single undocumented local script.', 'Avoiding version control for prompts and configuration.'], answer: 0, rationale: 'A shared runbook turns operational knowledge into a repeatable team capability.' }
];

const readSavedState = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
};
const restoreModules = (savedModules) => {
  if (!Array.isArray(savedModules)) return curriculum;
  const saved = new Map(flattenItems(savedModules).map((entry) => [entry.id, entry.status]));
  const restore = (items) => items.map((entry) => ({ ...entry, status: saved.get(entry.id) || entry.status, children: restore(entry.children || []) }));
  return curriculum.map((module) => ({ ...module, lessons: restore(module.lessons) }));
};

const getCommandCenterSnapshot = ({ current, completed, total, progress, readinessOverall, reviewQueue, practiceQueue, captures, studyMaterials, studyReviews }) => {
  const needsReview = studyMaterials.filter((material) => studyReviews?.[material.id]?.status === 'Needs review').length;
  const unreviewed = studyMaterials.filter((material) => !studyReviews?.[material.id] || studyReviews[material.id].status === 'Not reviewed').length;
  return {
    current,
    completion: { completed, total, progress },
    readiness: readinessOverall,
    nextActions: [
      ...reviewQueue.slice(0, 5).map((lesson) => ({ id: `lesson:${lesson.id}`, kind: 'lesson', label: lesson.title, detail: `${getStatus(lesson)}  /  ${lesson.duration}`, item: lesson })),
      ...studyMaterials.filter((material) => studyReviews?.[material.id]?.status === 'Needs review').slice(0, 3).map((material) => ({ id: `flashcard:${material.id}`, kind: 'flashcard', label: material.sourceTitle || 'Academy flashcard', detail: 'Needs review', item: material })),
      ...practiceQueue.slice(0, 3).map((drill) => ({ id: `practice:${drill.id}`, kind: 'practice', label: drill.title, detail: 'App-created practice', item: drill }))
    ].slice(0, 8),
    counts: { remainingOfficial: reviewQueue.length, practice: practiceQueue.length, captures: captures.length, materials: studyMaterials.length, needsReview, unreviewed }
  };
};

function FollowThroughView({ queue, acknowledgedIds, onAcknowledge, onUpdate, onDefer, actionState, notice }) {
  return <section className="follow-through-view">
    <div className="follow-through-intro">
      <div>
        <span className="eyebrow">AICC-PHA-002 · FOLLOW-THROUGH</span>
        <h2>Review what needs your attention.</h2>
        <p>This queue is derived from active tasks and subtasks in the local roadmap. Opening or acknowledging an item never marks it complete.</p>
      </div>
      <div className="follow-through-total"><strong>{queue.counts.review}</strong><small>item{queue.counts.review === 1 ? '' : 's'} to review</small></div>
    </div>
    <div className="follow-through-grid">
      <div className="follow-through-stat"><label>BLOCKED</label><b>{queue.counts.blocked}</b><small>Needs an unblocking decision</small></div>
      <div className="follow-through-stat"><label>OVERDUE</label><b>{queue.counts.overdue}</b><small>Past the stored due date</small></div>
      <div className="follow-through-stat"><label>STALE</label><b>{queue.counts.stale}</b><small>No update for at least seven days</small></div>
      <div className="follow-through-stat"><label>NEGLECTED</label><b>{queue.counts.neglected}</b><small>Stale work without a next action</small></div>
    </div>
    <div className="follow-through-panel">
      {notice && <div className={`follow-through-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.message}</div>}
      <div className="section-head compact">
        <div><h2>Review queue</h2><p>Sorted by blocked, overdue, stale, and neglected signals. Counts are derived from stored roadmap records.</p></div>
        <span className="queue-count">{queue.counts.review} shown</span>
      </div>
      {queue.items.length ? <div className="follow-through-list">{queue.items.map((item) => {
        const acknowledged = acknowledgedIds.has(item.id);
        return <article className={`follow-through-item${acknowledged ? ' acknowledged' : ''}`} key={item.id}>
          <div className="follow-through-item-head">
            <div><span className="follow-through-reasons">{item.reasonKinds.map((kind) => <span className={`follow-through-reason ${kind}`} key={kind}>{kind}</span>)}</span><h3>{item.title}</h3></div>
            <span className={`priority-badge priority-${String(item.priority || 'medium').toLowerCase()}`}>{item.priority}</span>
          </div>
          <div className="follow-through-context">{[item.project, item.release, item.phase].filter(Boolean).join(' · ') || 'Roadmap context unavailable'} · {item.statusLabel}{item.dueDate ? ` · due ${item.dueDate}` : ''}</div>
          <div className="follow-through-details">
            <div><label>Why review</label><p>{item.reasons.join(' · ')}</p></div>
            <div><label>Next action</label><p>{item.nextAction || 'No next action recorded.'}</p></div>
            <div><label>Definition of done</label><p>{item.definitionOfDone || 'No definition of done recorded.'}</p></div>
          </div>
          <div className="follow-through-actions">
            <button className="secondary" disabled={acknowledged} onClick={() => onAcknowledge(item.id)}><Check size={13}/>{acknowledged ? 'Acknowledged this session' : 'Acknowledge'}</button>
            <button className="secondary" disabled={actionState === item.id} onClick={() => onUpdate(item)}><Pencil size={13}/> Update</button>
            <button className="secondary" disabled={actionState === item.id} onClick={() => onDefer(item)}><CalendarClock size={13}/> Defer</button>
          </div>
        </article>;
      })}</div> : <div className="review-empty"><Check size={18}/> No blocked, overdue, stale, or neglected active work was found. The queue is empty based on the current roadmap.</div>}
      <p className="follow-through-note">Acknowledgements are session-only because the existing database has no review-record table. Defer uses the existing task update API and never changes a task to Done.</p>
    </div>
  </section>;
}

function DeferModal({ item, nextAction, dueDate, error, saving, onNextActionChange, onDueDateChange, onCancel, onSubmit }) {
  return <div className="modal" role="dialog" aria-modal="true" aria-labelledby="defer-title" onClick={onCancel}>
    <form className="defer-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="defer-modal-head"><div><span className="eyebrow">FOLLOW-THROUGH · DEFER</span><h2 id="defer-title">Move this commitment forward</h2><p>{item.title}</p></div><button className="close" type="button" onClick={onCancel} aria-label="Cancel defer"><X size={18}/></button></div>
      <label className="defer-field">Next action<input autoFocus value={nextAction} onChange={(event) => onNextActionChange(event.target.value)} placeholder="What is the next concrete step?" /></label>
      <label className="defer-field">Due date <span>(optional)</span><input type="date" value={dueDate} onChange={(event) => onDueDateChange(event.target.value)} aria-label="Deferred due date" /></label>
      {error && <div className="defer-error" role="alert">{error}</div>}
      <p className="defer-help">Defer updates only the next action and due date. It never marks this task complete. If it remains blocked, it will stay in the review queue.</p>
      <div className="defer-actions"><button className="secondary" type="button" onClick={onCancel} disabled={saving}>Cancel</button><button className="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save defer'} <Check size={14}/></button></div>
    </form>
  </div>;
}

function CoachApprovalModal({ task, nextAction, error, saving, onCancel, onApply }) {
  return <div className="modal" role="dialog" aria-modal="true" aria-labelledby="coach-approval-title" onClick={onCancel}>
    <section className="coach-approval-modal" onClick={(event) => event.stopPropagation()}>
      <div className="defer-modal-head"><div><span className="eyebrow">AI COACH · APPROVAL</span><h2 id="coach-approval-title">Apply proposed next action?</h2><p>{task.title}</p></div><button className="close" type="button" onClick={onCancel} aria-label="Cancel coach approval"><X size={18}/></button></div>
      <div className="coach-approval-change"><div><label>Current next action</label><p>{task.nextAction?.trim() || 'No next action recorded.'}</p></div><div className="coach-approval-arrow">↓</div><div><label>Proposed next action</label><p>{nextAction}</p></div></div>
      {error && <div className="defer-error" role="alert">{error}</div>}
      <p className="defer-help">Nothing changes until you apply this proposal. The update will use the existing task update path and will not mark the task complete.</p>
      <div className="defer-actions"><button className="secondary" type="button" onClick={onCancel} disabled={saving}>Cancel</button><button className="primary" type="button" onClick={onApply} disabled={saving}>{saving ? 'Applying…' : 'Apply change'} <Check size={14}/></button></div>
    </section>
  </div>;
}

const THEMES = {
  graphite: { name: 'Midnight', description: 'Deep indigo space with a radiant solar signal.', colors: ['#070b22', '#1c2559', '#ff7138'] },
  'mission-control': { name: 'Mission Control', description: 'Industrial charcoal with an electric lime signal.', colors: ['#0b0d0c', '#1b1f1d', '#b7ff2a'] },
  ember: { name: 'Ember', description: 'Warm contrast with a restrained copper accent.', colors: ['#17110f', '#33201d', '#e47b58'] },
  arctic: { name: 'Arctic', description: 'Clean blue surfaces with crisp cyan highlights.', colors: ['#0b1520', '#1a3044', '#65c7e8'] },
  moss: { name: 'Moss', description: 'Quiet green tones for a grounded study space.', colors: ['#101814', '#203127', '#8fcb9b'] },
  orchid: { name: 'Orchid', description: 'Deep violet surfaces with a creative lift.', colors: ['#15111e', '#2d2140', '#b893ff'] },
  paper: { name: 'Paper', description: 'A bright, warm reading-room alternative.', colors: ['#f3f0ea', '#e9e4da', '#6d56c7'] },
  'sunset-citadel': { name: 'Sunset Citadel', description: 'High-contrast solar yellow and flame orange over a midnight sky.', colors: ['#05072e', '#ff3b00', '#ffe600'] },
  'arcane-cobalt': { name: 'Arcane Cobalt', description: 'Vivid cobalt and ultraviolet with a hot-magenta signal.', colors: ['#030b3d', '#004cff', '#ff16a8'] },
  dragonfire: { name: 'Dragonfire', description: 'Crimson, electric blue, and blazing orange at full intensity.', colors: ['#10002d', '#e40046', '#ff5a00'] }
};

function ThemeModal({ theme, onChange, onClose }) {
  return <div className="modal" role="dialog" aria-modal="true" aria-labelledby="theme-title" onClick={onClose}>
    <section className="theme-modal" onClick={(event) => event.stopPropagation()}>
      <div className="theme-modal-head"><div><span className="eyebrow">WORKSPACE SETTINGS</span><h2 id="theme-title">Choose an appearance</h2><p>Change the application colors without changing your study data or layout.</p></div><button className="close" type="button" onClick={onClose} aria-label="Close appearance settings"><X size={18}/></button></div>
      <div className="theme-options" role="radiogroup" aria-label="Color themes">{Object.entries(THEMES).map(([id, option]) => <button key={id} type="button" role="radio" aria-checked={theme === id} className={`theme-option${theme === id ? ' selected' : ''}`} onClick={() => onChange(id)}><span className="theme-swatches">{option.colors.map((color) => <i key={color} style={{ backgroundColor: color }}/>)}</span><span className="theme-option-copy"><b>{option.name}</b><small>{option.description}</small></span>{theme === id && <Check size={16}/>}</button>)}</div>
      <div className="theme-modal-foot"><span>Current theme: <b>{THEMES[theme]?.name || THEMES.graphite.name}</b></span><button className="primary" type="button" onClick={onClose}>Done <Check size={14}/></button></div>
    </section>
  </div>;
}

function App() {
  const savedState = useMemo(readSavedState, []);
  const [modules, setModules] = useState(() => restoreModules(savedState?.modules));
  const [roadmap, setRoadmap] = useState(() => emptyRoadmap());
  const [jobs, setJobs] = useState([]);
  const [jobDetailsOpen, setJobDetailsOpen] = useState(false);
  const [roadmapStatus, setRoadmapStatus] = useState({ state: 'loading', message: 'Loading the local roadmapâ€¦' });
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [activeLesson, setActiveLesson] = useState(() => savedState?.activeLesson || 'platform-design');
  const [view, setView] = useState(() => ['today', 'overview', 'curriculum', 'practice', 'command-center', 'projects', 'jobs', 'follow-through'].includes(savedState?.view) ? savedState.view : 'today');
  const [expanded, setExpanded] = useState(() => ({ ...defaultExpanded, ...(savedState?.expanded || {}) }));
  const [notes, setNotes] = useState(() => savedState?.notes || '');
  const [practiceResults, setPracticeResults] = useState(() => savedState?.practiceResults || {});
  const [activeDrillId, setActiveDrillId] = useState(() => savedState?.activeDrillId || practiceDrills[0].id);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [curriculumQuery, setCurriculumQuery] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [academyOpen, setAcademyOpen] = useState(() => savedState?.academyOpen ?? true);
  const [captureState, setCaptureState] = useState({ status: 'idle', message: '' });
  const [captures, setCaptures] = useState([]);
  const [captureQuery, setCaptureQuery] = useState('');
  const [selectedCaptureId, setSelectedCaptureId] = useState(null);
  const [selectedCaptureIds, setSelectedCaptureIds] = useState([]);
  const [studyMaterials, setStudyMaterials] = useState([]);
  const [studyReviews, setStudyReviews] = useState({});
  const [acknowledgedFollowThrough, setAcknowledgedFollowThrough] = useState(() => new Set());
  const [focusTaskId, setFocusTaskId] = useState(null);
  const [followThroughAction, setFollowThroughAction] = useState(null);
  const [deferItem, setDeferItem] = useState(null);
  const [deferNextAction, setDeferNextAction] = useState('');
  const [deferDueDate, setDeferDueDate] = useState('');
  const [deferError, setDeferError] = useState('');
  const [deferSaving, setDeferSaving] = useState(false);
  const [theme, setTheme] = useState(() => THEMES[savedState?.theme] ? savedState.theme : 'graphite');
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [followThroughNotice, setFollowThroughNotice] = useState(null);
  const appRef = useRef(null);
  const splitterRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const allLessons = useMemo(() => modules.flatMap((m) => flattenItems(m.lessons)), [modules]);
  const officialLessons = allLessons.filter((lesson) => lesson.type !== 'practice');
  const current = allLessons.find((lesson) => lesson.id === activeLesson) || allLessons[0];
  const reviewQueue = useMemo(() => officialLessons
    .filter((lesson) => !['Complete', 'Skipped / already experienced'].includes(getStatus(lesson)))
    .sort((a, b) => ({ 'In progress': 0, 'Not started': 1 }[getStatus(a)] - ({ 'In progress': 0, 'Not started': 1 }[getStatus(b)]))), [officialLessons]);
  const readiness = useMemo(() => domainBlueprint.map((domain) => {
    const mapped = officialLessons.filter((lesson) => lesson.domainIds?.includes(domain.id));
    const assessed = mapped.filter((lesson) => getStatus(lesson) !== 'Skipped / already experienced');
    const evidence = assessed.length ? Math.round(assessed.reduce((sum, lesson) => sum + ({ Complete: 100, 'In progress': 50, 'Not started': 0 }[getStatus(lesson)] || 0), 0) / assessed.length) : null;
    return { ...domain, mapped, evidence };
  }), [officialLessons]);
  const readinessOverall = useMemo(() => {
    const assessed = readiness.filter((domain) => domain.evidence !== null);
    return assessed.length ? Math.round(assessed.reduce((sum, domain) => sum + domain.evidence * domain.weight, 0) / assessed.reduce((sum, domain) => sum + domain.weight, 0)) : null;
  }, [readiness]);
  const normalizedQuery = curriculumQuery.trim().toLowerCase();
  const visibleModules = useMemo(() => modules.map((module) => ({ ...module, lessons: module.lessons.filter((lesson) => !normalizedQuery || `${module.title} ${module.note || ''} ${lesson.title} ${lesson.type} ${lesson.note || ''}`.toLowerCase().includes(normalizedQuery)) })).filter((module) => module.lessons.length), [modules, normalizedQuery]);
  const completed = officialLessons.filter((lesson) => getStatus(lesson) === 'Complete' || getStatus(lesson) === 'Skipped / already experienced').length;
  const progress = Math.round((completed / officialLessons.length) * 100);
  const selectedCapture = captures.find((capture) => capture.id === selectedCaptureId) || captures[0] || null;
  const visibleCaptures = useMemo(() => {
    const query = captureQuery.trim().toLowerCase();
    return captures.filter((capture) => !query || `${capture.pageTitle} ${capture.sourceUrl} ${capture.courseLessonId || ''} ${capture.contentType} ${capture.content}`.toLowerCase().includes(query));
  }, [captures, captureQuery]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ modules, activeLesson, view, expanded, notes, practiceResults, activeDrillId, academyOpen, theme })); } catch { /* local persistence is best-effort */ }
  }, [modules, activeLesson, view, expanded, notes, practiceResults, activeDrillId, academyOpen, theme]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    const crumb = document.querySelector('.crumb');
    const jobSearch = crumb?.querySelector('b');
    if (!crumb || !jobSearch || view !== 'jobs') return undefined;
    // The shared header remains outside JobsView, so it tells the nested detail workspace to return to the pipeline.
    const goToJobSearch = () => window.dispatchEvent(new CustomEvent('job-search-navigation'));
    const goToNorthStar = (event) => { if (event.target === jobSearch) return; setView('today'); };
    const keydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); goToJobSearch(); } };
    jobSearch.setAttribute('role', 'button'); jobSearch.setAttribute('tabindex', '0'); jobSearch.setAttribute('title', 'Return to Job search');
    jobSearch.addEventListener('click', goToJobSearch); jobSearch.addEventListener('keydown', keydown); crumb.addEventListener('click', goToNorthStar);
    return () => { jobSearch.removeEventListener('click', goToJobSearch); jobSearch.removeEventListener('keydown', keydown); crumb.removeEventListener('click', goToNorthStar); jobSearch.removeAttribute('role'); jobSearch.removeAttribute('tabindex'); jobSearch.removeAttribute('title'); };
  }, [view]);
  const refreshJobs = useCallback(async () => { const records = await window.desktopShell?.listJobs?.(); setJobs(Array.isArray(records) ? records : []); }, []);
  useEffect(() => { refreshJobs().catch(() => setJobs([])); }, [refreshJobs]);
  const refreshRoadmap = useCallback(async () => {
    const bootstrap = await window.desktopShell?.coachBootstrap?.();
    if (!bootstrap?.roadmap) throw new Error('The local roadmap database returned no roadmap.');
    const normalized = normalizeRoadmap(bootstrap.roadmap);
    setRoadmap(normalized);
    setSelectedProjectId((currentId) => {
      const activeProjects = normalized.projects.filter((project) => !project.archived);
      if (activeProjects.some((project) => project.id === currentId)) return currentId;
      const populatedProject = activeProjects.find((project) => normalized.tasks.some((task) => task.projectId === project.id));
      return populatedProject?.id || activeProjects[0]?.id || null;
    });
    setRoadmapStatus({ state: 'ready', message: '' });
    return normalized;
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bootstrap = await window.desktopShell?.coachBootstrap?.();
        if (!bootstrap?.roadmap) throw new Error('The local roadmap database is unavailable.');
        if (cancelled) return;
        const normalized = normalizeRoadmap(bootstrap.roadmap);
        setRoadmap(normalized);
        setSelectedProjectId(normalized.projects.find((project) => !project.archived)?.id || null);
        setRoadmapStatus({ state: 'ready', message: '' });
      } catch (cause) {
        if (!cancelled) setRoadmapStatus({ state: 'error', message: cause?.message || 'Could not load the local roadmap database.' });
      }
    })();
    return () => { cancelled = true; };
  }, []);


  const openReviewItem = (lesson) => {
    const module = modules.find((entry) => flattenItems(entry.lessons).some((item) => item.id === lesson.id));
    setActiveLesson(lesson.id);
    setCurriculumQuery('');
    setExpanded((currentExpanded) => module ? { ...currentExpanded, [module.id]: true } : currentExpanded);
    setView('curriculum');
  };
  const openAcademyCourse = (lesson) => {
    if (lesson?.academyUrl) window.desktopShell?.navigateAcademy?.(lesson.academyUrl);
  };
  const captureAcademyPage = async () => {
    if (!window.desktopShell?.captureAcademyPage) {
      setCaptureState({ status: 'error', message: 'Academy capture is unavailable in this runtime.' });
      return;
    }
    setCaptureState({ status: 'busy', message: 'Reading the currently displayed Academy pageâ€¦' });
    const result = await window.desktopShell.captureAcademyPage();
    setCaptureState(result?.ok
      ? { status: 'success', message: `Captured â€œ${result.capture.pageTitle || 'Academy page'}â€ (${result.capture.contentLength} characters).` }
      : { status: 'error', message: result?.error || 'Academy capture failed safely.' });
    if (result?.ok) {
      const loaded = await window.desktopShell.getAcademyCaptures();
      if (loaded?.ok) { setCaptures(loaded.captures); setSelectedCaptureId(result.capture.id); }
    }
  };
  const loadCaptures = async () => {
    if (!window.desktopShell?.getAcademyCaptures) return;
    const result = await window.desktopShell.getAcademyCaptures();
    if (result?.ok) { setCaptures(result.captures); if (!selectedCaptureId && result.captures[0]) setSelectedCaptureId(result.captures[0].id); }
    else setCaptureState({ status: 'error', message: result?.error || 'Could not load captured Academy pages.' });
  };
  const deleteSelectedCapture = async () => {
    if (!selectedCapture) return;
    const result = await window.desktopShell?.deleteAcademyCapture?.(selectedCapture.id);
    if (result?.ok) { setCaptures(result.captures); setSelectedCaptureId(result.captures[0]?.id || null); setSelectedCaptureIds((ids) => ids.filter((id) => id !== selectedCapture.id)); setCaptureState({ status: 'success', message: 'Capture deleted from the local Academy library.' }); }
    else setCaptureState({ status: 'error', message: result?.error || 'Capture deletion failed safely.' });
  };
  const loadStudyMaterials = async () => {
    const result = await window.desktopShell?.getAcademyStudyMaterials?.();
    if (result?.ok) setStudyMaterials(result.materials);
    const reviews = await window.desktopShell?.getAcademyStudyReviews?.();
    if (reviews?.ok) setStudyReviews(reviews.reviews || {});
  };
  const generateFlashcards = async () => {
    if (!selectedCaptureIds.length) { setCaptureState({ status: 'error', message: 'Select one or more saved captures first.' }); return; }
    const result = await window.desktopShell?.generateAcademyFlashcards?.(selectedCaptureIds);
    if (result?.ok) { setStudyMaterials(result.materials); setCaptureState({ status: 'success', message: `Generated ${selectedCaptureIds.length} deterministic flashcard${selectedCaptureIds.length === 1 ? '' : 's'} from selected captures.` }); }
    else setCaptureState({ status: 'error', message: result?.error || 'Flashcard generation failed safely.' });
  };
  const deleteStudyMaterial = async (id) => {
    const result = await window.desktopShell?.deleteAcademyStudyMaterial?.(id);
    if (result?.ok) { setStudyMaterials(result.materials); setCaptureState({ status: 'success', message: 'Generated flashcard deleted.' }); }
    else setCaptureState({ status: 'error', message: result?.error || 'Flashcard deletion failed safely.' });
  };
  useEffect(() => { if (view === 'command-center' || view === 'captures' || view === 'materials') { loadCaptures(); loadStudyMaterials(); } }, [view]);
  const activeDrill = practiceDrills.find((drill) => drill.id === activeDrillId) || practiceDrills[0];
  const practiceQueue = practiceDrills.filter((drill) => !practiceResults[drill.id]);
  const commandCenter = useMemo(() => getCommandCenterSnapshot({ current, completed, total: officialLessons.length, progress, readinessOverall, reviewQueue, practiceQueue, captures, studyMaterials, studyReviews }), [current, completed, officialLessons.length, progress, readinessOverall, reviewQueue, practiceQueue, captures, studyMaterials, studyReviews]);
  const todayView = useMemo(() => buildTodayView(roadmap), [roadmap]);
  const followThroughView = useMemo(() => buildFollowThroughView(roadmap), [roadmap]);
  const coachContext = useMemo(() => buildCoachContext(roadmap, todayView.date, { focusView: todayView, followThroughView }), [roadmap, todayView, followThroughView]);
  const coachGuidance = useMemo(() => buildDeterministicCoachGuidance(coachContext), [coachContext]);
  const coachCard = useMemo(() => buildCoachCardModel(coachGuidance), [coachGuidance]);
  const [coachRefreshState, setCoachRefreshState] = useState('idle');
  const [aiCoachState, setAiCoachState] = useState({ status: 'idle', recommendation: null, model: OPENROUTER_COACH_MODEL, error: '' });
  const [coachApproval, setCoachApproval] = useState(null);
  const refreshCoachGuidance = async () => {
    setCoachRefreshState('refreshing');
    try { await refreshRoadmap(); setCoachRefreshState('idle'); }
    catch { setCoachRefreshState('error'); }
  };
  const askAiCoach = async () => {
    setAiCoachState({ status: 'loading', recommendation: null, model: OPENROUTER_COACH_MODEL, error: '' });
    try {
      const result = await window.desktopShell?.openRouterChat?.(buildCoachProviderMessages(coachContext), { model: OPENROUTER_COACH_MODEL });
      const normalized = normalizeCoachProviderResponse(result, coachContext);
      setAiCoachState({ status: normalized.ok ? 'success' : 'error', recommendation: normalized.recommendation, model: normalized.model, error: normalized.error || '' });
    } catch (error) {
      setAiCoachState({ status: 'error', recommendation: null, model: OPENROUTER_COACH_MODEL, error: error?.message || 'AI coaching request failed safely.' });
    }
  };
  const reviewCoachTask = () => {
    if (!coachCard.taskId) return;
    const record = roadmap.tasks.concat(roadmap.subtasks).find((task) => task.id === coachCard.taskId);
    if (!record) return;
    setSelectedProjectId(record.projectId || null);
    setFocusTaskId(record.id);
    setView('projects');
  };
  const dismissAiRecommendation = () => setAiCoachState((currentState) => ({ ...currentState, status: 'dismissed', recommendation: null, error: '' }));
  const requestCoachApproval = () => {
    const recommendation = aiCoachState.recommendation;
    if (!recommendation?.taskId || !recommendation.nextStep?.trim()) return;
    const task = roadmap.tasks.concat(roadmap.subtasks).find((candidate) => candidate.id === recommendation.taskId);
    if (task) setCoachApproval({ task, nextAction: recommendation.nextStep.trim(), error: '', saving: false });
  };
  const applyCoachApproval = async () => {
    if (!coachApproval) return;
    const record = roadmap.tasks.concat(roadmap.subtasks).find((task) => task.id === coachApproval.task.id);
    if (!record) { setCoachApproval((currentApproval) => ({ ...currentApproval, error: 'This task is no longer available in the local roadmap.' })); return; }
    if (!coachContext.focus.some((item) => item.id === record.id)) { setCoachApproval((currentApproval) => ({ ...currentApproval, error: 'This recommendation is no longer current. Ask AI coach again.' })); return; }
    setCoachApproval((currentApproval) => ({ ...currentApproval, saving: true, error: '' }));
    try {
      const result = await window.desktopShell?.updateTask?.({ ...record, nextAction: coachApproval.nextAction });
      if (!result || result.ok === false) throw new Error(result?.error || 'The local roadmap did not confirm the update.');
      await refreshRoadmap();
      setCoachApproval(null);
      setAiCoachState({ status: 'applied', recommendation: null, model: OPENROUTER_COACH_MODEL, error: '' });
    } catch (error) {
      setCoachApproval((currentApproval) => ({ ...currentApproval, saving: false, error: error?.message || 'The coach proposal could not be applied.' }));
    }
  };
  const acknowledgeFollowThrough = (id) => setAcknowledgedFollowThrough((currentIds) => new Set(currentIds).add(id));
  const updateFollowThrough = (item) => {
    setSelectedProjectId(roadmap.tasks.concat(roadmap.subtasks).find((task) => task.id === item.id)?.projectId || null);
    setFocusTaskId(item.id);
    setView('projects');
  };
  const deferFollowThrough = async (item) => {
    const record = roadmap.tasks.concat(roadmap.subtasks).find((task) => task.id === item.id);
    if (!record) return;
    setDeferItem(item);
    setDeferNextAction(item.nextAction || '');
    setDeferDueDate(record.dueDate || '');
    setDeferError('');
    setFollowThroughNotice(null);
  };
  const cancelDefer = () => {
    if (deferSaving) return;
    setDeferItem(null);
    setDeferError('');
  };
  const submitDefer = async () => {
    if (!deferItem) return;
    const record = roadmap.tasks.concat(roadmap.subtasks).find((task) => task.id === deferItem.id);
    if (!record) { setDeferError('This task is no longer available in the local roadmap.'); return; }
    const nextAction = deferNextAction.trim();
    const dueDate = deferDueDate.trim();
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) { setDeferError('Use a due date in YYYY-MM-DD format.'); return; }
    setDeferSaving(true);
    setFollowThroughAction(deferItem.id);
    try {
      const result = await window.desktopShell?.updateTask?.({ ...record, nextAction, dueDate: dueDate || null });
      if (!result || result.ok === false) throw new Error(result?.error || 'The local roadmap did not confirm the update.');
      await refreshRoadmap();
      setDeferItem(null);
      setDeferError('');
      setFollowThroughNotice({ type: 'success', message: `Defer saved for “${record.title}”. The task remains active and was not marked Done.` });
    } catch (cause) {
      setDeferError(cause?.message || 'The commitment could not be deferred.');
    } finally {
      setFollowThroughAction(null);
      setDeferSaving(false);
    }
  };
  const submitDrill = () => {
    if (selectedAnswer === null) return;
    setPracticeResults((results) => ({ ...results, [activeDrill.id]: { answer: selectedAnswer, correct: selectedAnswer === activeDrill.answer, completedAt: new Date().toISOString() } }));
  };
  const selectNextDrill = () => { const next = practiceQueue.find((drill) => drill.id !== activeDrill.id) || practiceDrills.find((drill) => drill.id !== activeDrill.id) || activeDrill; setActiveDrillId(next.id); setSelectedAnswer(null); };
  const setNotesOpen = (open) => { setShowNotes(open); };
  const toggleAcademy = () => setAcademyOpen((open) => !open);
  useEffect(() => {
    window.desktopShell?.setAcademyVisible?.(view === 'curriculum' && academyOpen && !showNotes);
    const visible = view === 'curriculum' && academyOpen;
    appRef.current?.style.setProperty('--academy-width', visible ? (appRef.current.style.getPropertyValue('--academy-width') && appRef.current.style.getPropertyValue('--academy-width') !== '0px' ? appRef.current.style.getPropertyValue('--academy-width') : '44%') : '0px');
    if (!visible) window.desktopShell?.setAcademyBounds?.({ x: window.innerWidth, width: 0 });
  }, [view, academyOpen, showNotes]);
  const syncAcademyBounds = useCallback(() => {
    if (!appRef.current || !splitterRef.current) return;
    const appRect = appRef.current.getBoundingClientRect();
    const splitterRect = splitterRef.current.getBoundingClientRect();
    window.desktopShell?.setAcademyBounds?.({ x: splitterRect.right - appRect.left, width: appRect.right - splitterRect.right });
  }, []);
  useEffect(() => { const observer = new ResizeObserver(syncAcademyBounds); if (appRef.current) observer.observe(appRef.current); if (view === 'curriculum' && academyOpen) syncAcademyBounds(); return () => observer.disconnect(); }, [syncAcademyBounds, view, academyOpen]);
  useEffect(() => {
    if (!dragging) return undefined;
    const move = (event) => { const appRect = appRef.current?.getBoundingClientRect(); if (!appRect) return; const academyWidth = Math.max(320, Math.min(appRect.width - 210 - 260, appRect.right - event.clientX)); appRef.current.style.setProperty('--academy-width', `${academyWidth}px`); syncAcademyBounds(); };
    const stop = () => setDragging(false); window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); document.body.classList.add('is-resizing');
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); document.body.classList.remove('is-resizing'); };
  }, [dragging, syncAcademyBounds]);

  return <div className="app" ref={appRef} data-theme={theme}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon" aria-hidden="true"><Star className="brand-star" size={19} fill="currentColor" strokeWidth={1.8}/></div><div><b>North Star</b><small>Command center</small></div></div>
      <div className="nav-label">COMMAND CENTER</div>
      <nav>
        <button className={view === 'today' ? 'nav active' : 'nav'} onClick={() => setView('today')}><Flame size={17}/> Today’s Focus</button>
        <button className={view === 'command-center' ? 'nav active' : 'nav'} onClick={() => setView('command-center')}><ListChecks size={17}/> Command center</button>
        <button className={view === 'follow-through' ? 'nav active' : 'nav'} onClick={() => setView('follow-through')}><Check size={17}/> Follow-through <em>{followThroughView.counts.review}</em></button>
        <button className={view === 'projects' ? 'nav active' : 'nav'} onClick={() => { setView('projects'); }}><Target size={17}/> Projects <em>{roadmap.projects.filter((project) => project.kind === 'project' && !project.archived).length}</em></button>
        <button className={view === 'projects' ? 'nav active' : 'nav'} onClick={() => { setView('projects'); }}><FileText size={17}/> Archive <em>{roadmap.projects.filter((project) => project.kind === 'project' && project.archived).length}</em></button>
        <button className={view === 'jobs' ? 'nav active' : 'nav'} onClick={() => setView('jobs')}><BriefcaseBusiness size={17}/> Job search <em>{jobs.filter((job) => !['accepted', 'rejected'].includes(job.stage)).length}</em></button>
        <button className={view === 'overview' ? 'nav active' : 'nav'} onClick={() => setView('overview')}><LayoutDashboard size={17}/> Readiness</button>
      </nav>
      <div className="nav-label nav-label-spaced">LEARNING &amp; DEVELOPMENT</div>
      <nav>
        <button className={view === 'curriculum' ? 'nav active' : 'nav'} onClick={() => setView('curriculum')}><BookOpen size={17}/> Learning path <em>{completed}/{officialLessons.length}</em></button>
        <button className="nav" onClick={() => setNotesOpen(true)}><FileText size={17}/> Personal notes</button>
        <button className={view === 'practice' ? 'nav active' : 'nav'} onClick={() => setView('practice')}><Brain size={17}/> Practice</button>
      </nav>
      <div className="path-card"><div className="path-symbol"><Target size={16}/></div><div><b>CCAR-P</b><small>Claude Certified Architect</small></div><ChevronRight size={15}/></div>
      <div className="sidebar-footer"><div className="local-badge"><span className="local-dot"/> Local-first workspace</div><div className="profile"><div className="avatar">J</div><div className="profile-copy"><b>Josh</b><small>Executive workspace</small></div><button className="profile-settings" type="button" onClick={() => setShowThemeSettings(true)} aria-label="Open appearance settings" title="Appearance settings"><Settings size={16}/></button></div></div>
    </aside>

    <main className="main">
      <header><div className="crumb">NORTH STAR <ChevronRight size={14}/> <b>{view === 'today' ? 'Today’s Focus' : view === 'command-center' ? 'Command center' : view === 'follow-through' ? 'Follow-through' : view === 'projects' ? 'Projects' : view === 'jobs' ? 'Job search' : view === 'curriculum' ? 'Learning & Development' : view === 'practice' ? 'Practice' : 'Readiness'}</b></div><div className="header-actions"><div className="streak"><Target size={15}/> Grounded local workspace</div>{view === 'curriculum' && <button className="academy-toggle" onClick={toggleAcademy} aria-pressed={academyOpen}>{academyOpen ? <ChevronRight size={15}/> : <ExternalLink size={15}/>} {academyOpen ? 'Close Academy' : 'Open Academy'}</button>}</div></header>
      <div className="main-scroll">
        {['curriculum', 'overview', 'practice', 'command-center'].includes(view) && (
        <section className="hero"><div><span className="eyebrow">NORTH STAR · COMMAND CENTER</span><h1>See what matters. Choose what moves. <Star className="hero-star" size={23} fill="currentColor" strokeWidth={1.8}/></h1><p>A calm, local-first operating picture for priorities, projects, decisions, learning, and follow-through.</p></div><div className="progress"><strong>{progress}%</strong><small>learning module completion</small></div></section>
      )}
        {view === 'jobs' ? null : (
<section className="stats"><div className="stat"><label>LEARNING &amp; DEVELOPMENT</label><b>{completed}/{officialLessons.length} items</b><div className="bar"><i style={{ width: `${progress}%` }} /></div><small>Preserved certification curriculum and local study progress</small></div><div className="stat"><label>READINESS EVIDENCE</label><b>{readinessOverall === null ? 'Not assessed' : `${readinessOverall}% evidence`}</b><small>App-derived estimate  /  not an official passing prediction</small></div><div className="stat"><label>COMMAND CENTER STATUS</label><b>Foundation active</b><small>{roadmapStatus.state === 'ready' ? `${roadmap.projects.filter((project) => project.kind === 'project' && !project.archived).length} local project${roadmap.projects.filter((project) => project.kind === 'project' && !project.archived).length === 1 ? '' : 's'}  /  ${roadmap.tasks.filter((task) => !task.archived).length + roadmap.subtasks.filter((task) => !task.archived).length} task${roadmap.tasks.filter((task) => !task.archived).length + roadmap.subtasks.filter((task) => !task.archived).length === 1 ? '' : 's'}` : 'Loading local roadmapâ€¦'}</small></div></section>
)}
        {view === 'jobs' && <>{!jobDetailsOpen && <EmailMonitorPanel jobs={jobs} />}<JobsView jobs={jobs} onRefresh={refreshJobs} onDetailChange={setJobDetailsOpen} /></>}
        {view === 'today' && (roadmapStatus.state === 'loading'
          ? <section className="database-state"><div className="loading-spinner" aria-hidden="true"/><h2>Loading your local roadmapâ€¦</h2><p>Reading the canonical hierarchy from SQLite.</p></section>
          : roadmapStatus.state === 'error'
            ? <section className="database-state database-error" role="alert"><h2>Roadmap database unavailable</h2><p>{roadmapStatus.message}</p><button className="primary" onClick={() => refreshRoadmap().catch((cause) => setRoadmapStatus({ state: 'error', message: cause?.message || 'Could not load the local roadmap database.' }))}>Retry</button></section>
            : <section className="today-view">
              <div className="today-intro">
                <div>
                  <span className="eyebrow">RELEASE 1  /  PERSONAL EXECUTION FOUNDATION</span>
                  <h2>Today’s Focus</h2>
                  <p>A small, coach-selected list of tasks you can work on now. Work waiting on dependencies, approvals, or other people appears separately.</p>
                </div>
                <div className="today-date">
                  <strong>{todayView.counts.focus}</strong>
                  <small>focus item{todayView.counts.focus === 1 ? '' : 's'} today</small>
                </div>
              </div>
              <div className="today-grid">
                <div className="today-stat"><label>READY NOW</label><b>{todayView.counts.ready}</b><small>Validated work with completed dependencies</small></div>
                <div className="today-stat"><label>WAITING</label><b>{todayView.counts.waiting}</b><small>Blocked or dependency-locked work</small></div>
                <div className="today-stat"><label>OVERDUE</label><b>{todayView.counts.overdue}</b><small>Ready work past its stored due date</small></div>
              </div>
              <section className={`coach-card coach-${coachCard.tone}`} aria-label="Local coach guidance">
                <div className="coach-card-head">
                  <div><span className="eyebrow">{coachCard.eyebrow}</span><h2>{coachCard.heading}</h2></div>
                  <div className="coach-card-actions"><button className="coach-refresh" type="button" onClick={refreshCoachGuidance} disabled={coachRefreshState === 'refreshing' || aiCoachState.status === 'loading'}>{coachRefreshState === 'refreshing' ? 'Refreshing…' : 'Refresh guidance'} <Brain size={14}/></button><button className="coach-ask" type="button" onClick={askAiCoach} disabled={aiCoachState.status === 'loading'}>{aiCoachState.status === 'loading' ? 'Asking AI…' : 'Ask AI coach'} <Brain size={14}/></button></div>
                </div>
                <p className="coach-guidance">{coachCard.guidance}</p>
                {coachCard.title && <div className="coach-source"><span><b>Source task</b> {coachCard.title}</span><code>{coachCard.taskId}</code></div>}
                <p className="coach-reason"><b>Why:</b> {coachCard.reason}</p>
                <div className="coach-card-foot"><small>Local guidance is computed from Today’s Focus and Waiting. AI is user-triggered, sends bounded context, and never changes tasks.</small>{coachCard.actionLabel && <button className="secondary" type="button" onClick={reviewCoachTask}>{coachCard.actionLabel} <ChevronRight size={14}/></button>}</div>
                {coachRefreshState === 'error' && <div className="coach-error" role="alert">Local guidance could not refresh. The previous recommendation remains unchanged.</div>}
                {aiCoachState.status === 'success' && aiCoachState.recommendation && <div className="coach-ai-response"><div><span className="eyebrow">AI COACH · {aiCoachState.model}</span><p><b>{aiCoachState.recommendation.title || 'Roadmap status'}</b>{aiCoachState.recommendation.nextStep && <>: {aiCoachState.recommendation.nextStep}</>} </p><small>{aiCoachState.recommendation.explanation} · Uncertainty: {aiCoachState.recommendation.uncertainty}</small></div><div className="coach-ai-actions"><button className="secondary" type="button" onClick={() => { const task = roadmap.tasks.concat(roadmap.subtasks).find((candidate) => candidate.id === aiCoachState.recommendation.taskId); if (task) { setSelectedProjectId(task.projectId || null); setFocusTaskId(task.id); setView('projects'); } }}>Open task <ChevronRight size={14}/></button>{aiCoachState.recommendation.nextStep && <button className="primary" type="button" onClick={requestCoachApproval}>Apply proposed action <Check size={14}/></button>}<button className="coach-dismiss" type="button" onClick={dismissAiRecommendation}>Dismiss</button></div><small>Validated against the current Focus list. Nothing changes unless you explicitly apply the proposal.</small></div>}
                {aiCoachState.status === 'applied' && <div className="coach-success" role="status">Coach proposal applied. The task’s next action was updated.</div>}
                {aiCoachState.status === 'error' && <div className="coach-error" role="alert">AI coaching unavailable: {aiCoachState.error}</div>}
              </section>
              <div className="today-panel">
                <div className="section-head compact">
                  <div>
                    <h2>Focus queue</h2>
                    <p>Up to three ready tasks, ordered by in-progress status, to-do status, backlog, priority, due date, title, and ID.</p>
                  </div>
                  <span className="queue-count">{todayView.counts.focus} of {todayView.counts.ready} shown</span>
                </div>
                {todayView.focus.length ? (
                  <div className="today-list">
                    {todayView.items.map((item) => (
                      <div className="today-item" key={item.id}>
                        <span className={'priority-badge priority-' + String(item.priority || 'medium').toLowerCase()}>{item.focusRole}</span>
                        <div className="today-item-body">
                          <div className="today-item-top">
                            <b>{item.title}</b>
                            {item.overdue && <span className="overdue-label">Overdue</span>}
                          </div>
                          {item.nextAction && <small>{item.nextAction}</small>}
                          <span className="today-context">
                            {item.statusLabel}{item.release ? '  /  ' + item.release : item.project ? '  /  ' + item.project : ''}
                            {item.dueDate ? '  /  due ' + item.dueDate + (item.overdue ? ' (overdue)' : '') : ''}
                          </span>
                          <div className="blocked-summary"><b>Why this is here</b><span>{item.selectionReasons.join(' ')}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="review-empty"><Check size={18}/> No validated ready work is available. Open Waiting below for the current blockers.</div>
                )}
                <details className="today-waiting">
                  <summary><span>Waiting</span><span>{todayView.counts.waiting} item{todayView.counts.waiting === 1 ? '' : 's'} not ready to start</span></summary>
                  {todayView.waiting.length ? <div className="today-list">
                    {todayView.waiting.map((item) => <div className="today-item waiting-item" key={item.id}>
                      <span className="priority-badge priority-medium">Waiting</span>
                      <div className="today-item-body">
                        <div className="today-item-top"><b>{item.title}</b><span className="overdue-label">{item.statusLabel}</span></div>
                        <span className="today-context">{item.statusLabel}{item.release ? '  /  ' + item.release : item.project ? '  /  ' + item.project : ''}</span>
                        <div className="blocked-summary"><b>Why it is waiting</b><span>{item.waitingReasons.join(' ')}</span></div>
                      </div>
                    </div>)}
                  </div> : <div className="review-empty"><Check size={18}/> Nothing is waiting in the active roadmap.</div>}
                </details>
                <p className="today-kanban-note">Focus is intentionally limited. The full work inventory remains available in <button type="button" onClick={() => setView('projects')}>Projects / Kanban <ExternalLink size={12}/></button>.</p>
              </div>
            </section>)}
        {view === 'projects' && (roadmapStatus.state === 'loading'
          ? <section className="projects-workspace database-state"><div className="loading-spinner" aria-hidden="true"/><h2>Loading your local roadmapâ€¦</h2><p>Reading the canonical hierarchy from SQLite.</p></section>
          : roadmapStatus.state === 'error'
            ? <section className="projects-workspace database-state database-error" role="alert"><h2>Roadmap database unavailable</h2><p>{roadmapStatus.message}</p><button className="primary" onClick={() => refreshRoadmap().catch((cause) => setRoadmapStatus({ state: 'error', message: cause?.message || 'Could not load the local roadmap database.' }))}>Retry</button></section>
            : <DatabaseRoadmapWorkspace roadmap={roadmap} refreshRoadmap={refreshRoadmap} selectedProjectId={selectedProjectId} setSelectedProjectId={setSelectedProjectId} focusTaskId={focusTaskId} onFocusTaskHandled={() => setFocusTaskId(null)} />)}
        {view === 'follow-through' && (roadmapStatus.state === 'loading'
          ? <section className="database-state"><div className="loading-spinner" aria-hidden="true"/><h2>Loading your local roadmap…</h2><p>Reading the canonical hierarchy from SQLite.</p></section>
          : roadmapStatus.state === 'error'
            ? <section className="database-state database-error" role="alert"><h2>Roadmap database unavailable</h2><p>{roadmapStatus.message}</p><button className="primary" onClick={() => refreshRoadmap().catch((cause) => setRoadmapStatus({ state: 'error', message: cause?.message || 'Could not load the local roadmap database.' }))}>Retry</button></section>
            : <FollowThroughView queue={followThroughView} acknowledgedIds={acknowledgedFollowThrough} onAcknowledge={acknowledgeFollowThrough} onUpdate={updateFollowThrough} onDefer={deferFollowThrough} actionState={followThroughAction} notice={followThroughNotice} />)}
        {view === 'command-center' && <section className="command-center"><div className="command-intro"><div><span className="eyebrow">EXECUTIVE OPERATING PICTURE</span><h2>Know what matters next.</h2><p>This foundation brings existing learning and study state into a broader command-center shell without inventing projects, tasks, metrics, or coaching.</p></div><button className="primary" onClick={() => openReviewItem(commandCenter.nextActions[0]?.item || current)}><Play size={15}/> Continue learning</button></div><div className="command-grid"><button className="command-card" onClick={() => setView('curriculum')}><BookOpen size={20}/><label>LEARNING MODULE</label><b>{progress}%</b><small>{completed}/{officialLessons.length} items complete or skipped</small></button><button className="command-card" onClick={() => setView('overview')}><Target size={20}/><label>READINESS EVIDENCE</label><b>{readinessOverall === null ? 'Not assessed' : `${readinessOverall}%`}</b><small>App-derived estimate, not a passing prediction</small></button><button className="command-card" onClick={() => setView('practice')}><Brain size={20}/><label>PRACTICE BACKLOG</label><b>{commandCenter.counts.practice}</b><small>App-created drills remaining</small></button><button className="command-card" onClick={() => setNotesOpen(true)}><FileText size={20}/><label>PERSONAL NOTES</label><b>{notes.trim() ? 'Active' : 'Ready'}</b><small>{notes.trim() ? `${notes.trim().length} characters saved locally` : 'Capture your next insight'}</small></button></div><section className="command-panel"><div className="section-head compact"><div><h2>Next actions</h2><p>Prioritized from existing state; opening this list never changes progress.</p></div><span className="queue-count">{commandCenter.nextActions.length} shown</span></div>{commandCenter.nextActions.length ? <div className="command-actions">{commandCenter.nextActions.map((action) => <button className="command-action" key={action.id} onClick={() => action.kind === 'lesson' ? openReviewItem(action.item) : action.kind === 'practice' ? (setActiveDrillId(action.item.id), setView('practice')) : setNotesOpen(true)}><span className="review-icon">{action.kind === 'lesson' ? <BookOpen size={14}/> : action.kind === 'practice' ? <Brain size={14}/> : <FileText size={14}/>}</span><span><b>{action.label}</b><small>{action.detail}</small></span><ChevronRight size={15}/></button>)}</div> : <div className="review-empty"><Check size={18}/> No queued actions from the preserved learning state.</div>}<div className="command-foot"><span><b>{commandCenter.counts.captures}</b> Academy captures</span><span><b>{commandCenter.counts.materials}</b> generated materials</span><span><b>{commandCenter.counts.unreviewed}</b> unreviewed cards</span></div></section><section className="future-panel"><div><span className="eyebrow">NEXT SAFE CAPABILITY</span><h2>Projects, tasks, and Kanban</h2><p>Manage real local work without cloud sync, integrations, credentials, or AI coaching.</p></div><button className="link" onClick={() => setView('projects')}>Open Projects <ChevronRight size={15}/></button></section></section>}
        {view === 'overview' && <><section className="practice-card"><Target size={22}/><h2>CCAR-P exam overview</h2><p><b>Claude Certified Architect â€“ Professional</b>  /  Passing score 720 on a 100â€“1,000 scaled score  /  $175 USD  /  Online proctored or Pearson VUE test center  /  Credential valid for 12 months.</p><div className="exam-facts">{examFacts.map(([label, value]) => <div key={label}><label>{label}</label><b>{value}</b></div>)}</div><p><b>No mandatory prerequisites or required courses.</b> Recommended preparation helps build context; readiness is not represented by course completion alone.</p></section><section className="readiness-card"><div className="readiness-heading"><div><span className="eyebrow">ESTIMATED APP READINESS</span><h2>Exam-domain readiness</h2><p>Transparent evidence from official curriculum statuses. This is an estimate, not an official passing prediction.</p></div><div className="readiness-total">{readinessOverall === null ? 'Not assessed' : `${readinessOverall}%`}<small>weighted evidence</small></div></div><div className="readiness-list">{readiness.map((domain) => <div className="readiness-row" key={domain.id}><div className="readiness-label"><b>{domain.label}</b><span>{domain.weight}% exam weight  /  {domain.mapped.length} mapped official item{domain.mapped.length === 1 ? '' : 's'}</span></div><strong>{domain.evidence === null ? 'Not assessed' : `${domain.evidence}%`}</strong><div className="readiness-bar"><i style={{ width: `${domain.evidence || 0}%` }}/></div></div>)}</div><div className="readiness-method"><b>How the estimate is formed</b><span>Complete = 100% evidence  /  In progress = 50%  /  Not started = 0%  /  Skipped items are excluded. Course completion changes evidence only; it never marks a domain mastered.</span></div></section></>}
        {view !== 'command-center' && view !== 'projects' && view !== 'today' && view !== 'follow-through' && view !== 'jobs' && <>
          <div className="section-head"><div><h2>{view === 'curriculum' ? 'Official curriculum & practice' : 'Continue learning'}</h2><p>Use this focused workspace to move through the certification path, track progress, and study alongside Anthropic Academy.</p></div>{view !== 'curriculum' && <button className="link" onClick={() => setView('curriculum')}>View full curriculum <ChevronRight size={15}/></button>}</div>
          <section className="lesson-card"><div className="lesson-art"><BookOpen size={27}/><span>01</span></div><div className="lesson-copy"><label>{current.type === 'practice' ? 'APP-CREATED PRACTICE' : current.title.toUpperCase()}</label><h3>{current.title}</h3><p>{current.note || 'Official course or module metadata is shown without inventing lecture titles.'}</p><small><Play size={13}/> {current.duration} &nbsp;  /  &nbsp; {current.type === 'practice' ? 'App practice' : 'Anthropic preparation'}</small></div>{current.academyUrl ? <button className="academy-hint academy-launch" onClick={() => openAcademyCourse(current)} title={`Open ${current.title} in Anthropic Academy`}><Play size={15}/> Open in Academy</button> : <span className="academy-hint"><ExternalLink size={15}/> Academy is live on the right</span>}</section>
          {view !== 'curriculum' && <section className="review-next"><div className="section-head compact"><div><h2>Review next</h2><p>Official items needing attention, with in-progress work first. App-created practice is kept separate.</p></div><span className="queue-count">{reviewQueue.length} remaining</span></div>{reviewQueue.length ? <div className="review-list">{reviewQueue.slice(0, 8).map((lesson) => <button className="review-item" key={lesson.id} onClick={() => openReviewItem(lesson)}><span className="review-icon"><Play size={13}/></span><span><b>{lesson.title}</b><small>{getStatus(lesson)}  /  {lesson.type === 'practice' ? 'App-created practice' : lesson.duration}</small></span><span className="review-link">Review next</span><ChevronRight size={16}/></button>)}</div> : <div className="review-empty"><Check size={18}/> All official curriculum items are complete or skipped.</div>}</section>}
          <div className="section-head compact"><div><h2>Learning path</h2><p>Recommended order is logical guidance only; Anthropic does not require it.</p></div></div>
          <label className="curriculum-search"><Search size={16}/><input value={curriculumQuery} onChange={(e) => setCurriculumQuery(e.target.value)} placeholder="Search courses, modules, or practice..." aria-label="Search curriculum" />{curriculumQuery && <button type="button" onClick={() => setCurriculumQuery('')} aria-label="Clear curriculum search"><X size={15}/></button>}</label>
          <div className="modules">{visibleModules.length ? visibleModules.map((module) => <div className="module" key={module.id}><button className="module-header" onClick={() => setExpanded((x) => ({ ...x, [module.id]: !x[module.id] }))}><i style={{ background: module.accent }}/><div><b>{module.title}</b><small>{module.lessons.length} matching item{module.lessons.length === 1 ? '' : 's'}</small></div><span>{module.lessons.filter((l) => getStatus(l) === 'Complete' || getStatus(l) === 'Skipped / already experienced').length}/{module.lessons.length}</span>{expanded[module.id] ? <ChevronDown size={17}/> : <ChevronRight size={17}/>}</button>{expanded[module.id] && <><p className="module-note">{module.note}</p><div className="lesson-list">{module.lessons.map((lesson) => <div key={lesson.id}><button className={lesson.id === activeLesson ? 'lesson-row selected' : 'lesson-row'} onClick={() => setActiveLesson(lesson.id)}><b>{lesson.title}</b><small>{lesson.duration}  /  {getProgress(lesson)}%</small></button><div className="status-controls"><span>{lesson.children?.length ? `${lesson.children.length} sub-items` : lesson.type}</span><select value={lesson.status} onChange={(e) => updateStatus(lesson.id, e.target.value)} aria-label={`Status for ${lesson.title}`}>{STATUS_LABELS.map((status) => <option key={status}>{status}</option>)}</select></div>{lesson.children?.length && <div className="subitems">{lesson.children.map((child) => <div className="subitem" key={child.id}><span>{child.title}</span><select value={child.status} onChange={(e) => updateStatus(child.id, e.target.value)} aria-label={`Status for ${child.title}`}>{STATUS_LABELS.map((status) => <option key={status}>{status}</option>)}</select></div>)}</div>}</div>)}</div></>}</div>) : <div className="empty-search"><Search size={18}/><b>No curriculum items found</b><span>Try a different course, module, or practice term.</span></div>}</div>
        </>}
      </div>
    </main>
    {view === 'curriculum' && academyOpen && <div className={dragging ? 'academy-splitter dragging' : 'academy-splitter'} ref={splitterRef} role="separator" aria-label="Resize Academy panel" onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); setDragging(true); }}><span/></div>}
    {view === 'curriculum' && academyOpen && <div className="academy-slot" aria-label="Anthropic Academy native browser panel" />}

    {showNotes && <div className="modal" onClick={() => setNotesOpen(false)}><div className="notes" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setNotesOpen(false)}><X size={18}/></button><span className="eyebrow">PERSONAL NOTES</span><h2>{current.title}</h2><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Capture an insight, question, or example..."/><button className="primary" onClick={() => setNotesOpen(false)}>Save note <Check size={15}/></button></div></div>}
    {deferItem && <DeferModal item={deferItem} nextAction={deferNextAction} dueDate={deferDueDate} error={deferError} saving={deferSaving} onNextActionChange={setDeferNextAction} onDueDateChange={setDeferDueDate} onCancel={cancelDefer} onSubmit={submitDefer} />}
    {coachApproval && <CoachApprovalModal task={coachApproval.task} nextAction={coachApproval.nextAction} error={coachApproval.error} saving={coachApproval.saving} onCancel={() => { if (!coachApproval.saving) setCoachApproval(null); }} onApply={applyCoachApproval} />}
    {showThemeSettings && <ThemeModal theme={theme} onChange={setTheme} onClose={() => setShowThemeSettings(false)} />}
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);
