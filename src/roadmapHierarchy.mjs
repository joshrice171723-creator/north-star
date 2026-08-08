const PROJECT_CHILD_KINDS = new Set(['project', 'release', 'phase']);

export function buildRoadmapHierarchy(roadmap) {
  const fallbackWorkspace = roadmap?.workspace ? [roadmap.workspace] : [];
  const workspaces = (Array.isArray(roadmap?.workspaces) && roadmap.workspaces.length ? roadmap.workspaces : fallbackWorkspace)
    .filter((entry) => entry?.kind === 'workspace' || entry?.type === 'workspace')
    .map((entry) => ({ ...entry, kind: 'workspace', type: 'workspace' }));
  const collections = [
    ...(roadmap?.projects || []),
    ...(roadmap?.releases || []),
    ...(roadmap?.phases || []),
    ...(roadmap?.tasks || []),
    ...(roadmap?.subtasks || [])
  ];
  const childrenById = new Map();
  const addChild = (parentId, entry) => {
    if (!parentId || entry.kind === 'workspace' || entry.type === 'workspace') return;
    const children = childrenById.get(parentId) || [];
    children.push(entry);
    childrenById.set(parentId, children);
  };
  for (const entry of collections) {
    const parentId = entry.parentId || entry.parentTaskId || entry.phaseId || entry.releaseId || entry.projectId || null;
    if (entry.kind === 'project' || entry.type === 'project') addChild(parentId, entry);
    else if (entry.kind === 'release' || entry.type === 'release') addChild(parentId, entry);
    else if (entry.kind === 'phase' || entry.type === 'phase') addChild(parentId, entry);
    else if (entry.kind === 'task' || entry.type === 'task') addChild(parentId, entry);
    else if (entry.kind === 'subtask' || entry.type === 'subtask') addChild(parentId, entry);
  }
  return { workspaces, childrenById };
}

export function workspaceProjects(roadmap, workspaceId) {
  return (roadmap?.projects || []).filter((entry) => entry.parentId === workspaceId && entry.kind === 'project');
}

// Resolves the top-level (card) task that owns a given task/subtask id, so a
// Kanban scope clicked on a nested subtask shows its parent board card.
export function topLevelTaskIdForSubtask(roadmap, id) {
  const all = [...(roadmap?.tasks || []), ...(roadmap?.subtasks || [])];
  const byId = new Map(all.map((entry) => [entry.id, entry]));
  let current = byId.get(id);
  let guard = 0;
  while (current && current.parentTaskId && byId.has(current.parentTaskId) && guard < 100) {
    current = byId.get(current.parentTaskId);
    guard += 1;
  }
  return current?.id || null;
}

// Returns the top-level tasks that belong to a clicked roadmap node's scope.
// workspace -> tasks in that workspace's projects; project -> task.projectId;
// release -> task.releaseId; phase -> task.phaseId; task -> that task itself;
// subtask -> its owning top-level task so the card is shown on the board.
export function kanbanTasksForScope(roadmap, scope, tasks) {
  if (!scope) return tasks;
  const topLevel = Array.isArray(tasks) ? tasks : [];
  switch (scope.kind) {
    case 'workspace': {
      const projectIds = new Set((roadmap?.projects || []).filter((p) => p.parentId === scope.id).map((p) => p.id));
      return topLevel.filter((t) => projectIds.has(t.projectId));
    }
    case 'project':
      return topLevel.filter((t) => t.projectId === scope.id);
    case 'release':
      return topLevel.filter((t) => t.releaseId === scope.id);
    case 'phase':
      return topLevel.filter((t) => t.phaseId === scope.id);
    case 'subtask': {
      const parentId = topLevelTaskIdForSubtask(roadmap, scope.id);
      return topLevel.filter((t) => t.id === parentId);
    }
    default:
      // 'task' (and any other kind): the clicked top-level task itself.
      return topLevel.filter((t) => t.id === scope.id);
  }
}

export { PROJECT_CHILD_KINDS };
