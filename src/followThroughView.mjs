// Follow-through queue derivation (AICC-PHA-002 / AICC-TSK-005).
//
// This module is read-only and derives a focused queue from the persisted
// roadmap. It never creates tasks, stores duplicate task state, or mutates the
// input. Commitment signals and their rules live in commitmentLifecycle.mjs.
import { buildCommitmentLifecycle } from './commitmentLifecycle.mjs';

function labelFor(records, id) {
  if (!id) return null;
  const entry = records?.find((record) => record.id === id);
  return entry?.title || entry?.name || null;
}

function contextFor(record, roadmap) {
  return {
    project: labelFor(roadmap?.projects, record.projectId),
    release: labelFor(roadmap?.releases, record.releaseId),
    phase: labelFor(roadmap?.phases, record.phaseId)
  };
}

const REASON_WEIGHT = { blocked: 0, overdue: 1, stale: 2, neglected: 3 };

function reasonKinds(item) {
  return [
    item.blocked ? 'blocked' : null,
    item.overdue ? 'overdue' : null,
    item.stale ? 'stale' : null,
    item.neglected ? 'neglected' : null
  ].filter(Boolean);
}

function compareItems(a, b) {
  const aReason = Math.min(...a.reasonKinds.map((kind) => REASON_WEIGHT[kind]));
  const bReason = Math.min(...b.reasonKinds.map((kind) => REASON_WEIGHT[kind]));
  return aReason - bReason
    || a.priorityWeight - b.priorityWeight
    || (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99')
    || a.title.localeCompare(b.title)
    || a.id.localeCompare(b.id);
}

export function buildFollowThroughView(roadmap, referenceDateString, options = {}) {
  const lifecycle = buildCommitmentLifecycle(roadmap, referenceDateString, options);
  const activeRecords = [
    ...(Array.isArray(roadmap?.tasks) ? roadmap.tasks : []),
    ...(Array.isArray(roadmap?.subtasks) ? roadmap.subtasks : [])
  ];
  const byId = new Map(activeRecords.map((record) => [record.id, record]));
  const items = lifecycle.items
    .map((item) => {
      const record = byId.get(item.id) || {};
      const kinds = reasonKinds(item);
      return {
        ...item,
        reasonKinds: kinds,
        reasons: item.reasons,
        ...contextFor(record, roadmap)
      };
    })
    .filter((item) => item.reasonKinds.length > 0)
    .sort(compareItems);

  return {
    date: lifecycle.date,
    items,
    counts: {
      review: items.length,
      blocked: items.filter((item) => item.blocked).length,
      overdue: items.filter((item) => item.overdue).length,
      stale: items.filter((item) => item.stale).length,
      neglected: items.filter((item) => item.neglected).length
    }
  };
}