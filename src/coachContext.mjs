// Bounded, local-only context for future optional coaching.
//
// This module deliberately performs no provider calls and never stores or
// mutates roadmap state. It exposes only the derived work needed to explain one
// next step, keeping the eventual provider payload small and reviewable.
import { buildTodayFocus } from './todayFocus.mjs';
import { buildFollowThroughView } from './followThroughView.mjs';

export const COACH_CONTEXT_SCHEMA_VERSION = 1;
export const DEFAULT_CONTEXT_LIMITS = Object.freeze({
  focus: 3,
  waiting: 10,
  followThrough: 10,
  text: 240
});

function text(value, limit = DEFAULT_CONTEXT_LIMITS.text) {
  const normalized = String(value ?? '').trim();
  return normalized.length > limit ? `${normalized.slice(0, Math.max(0, limit - 1))}…` : normalized;
}

function optionalText(value, limit) {
  const normalized = text(value, limit);
  return normalized || null;
}

function contextFields(item, limits) {
  return {
    id: text(item?.id, 160),
    title: text(item?.title, limits.text),
    status: text(item?.status, 80),
    priority: text(item?.priority, 40),
    dueDate: optionalText(item?.dueDate, 32),
    nextAction: optionalText(item?.nextAction, limits.text),
    project: optionalText(item?.project, limits.text),
    release: optionalText(item?.release, limits.text),
    phase: optionalText(item?.phase, limits.text)
  };
}

function focusContext(item, limits) {
  return {
    ...contextFields(item, limits),
    focusRole: text(item?.focusRole, 40),
    selectionReason: optionalText(item?.selectionReason, limits.text),
    overdue: Boolean(item?.overdue)
  };
}

function waitingContext(item, limits) {
  return {
    ...contextFields(item, limits),
    blocked: Boolean(item?.blocked),
    waitingReasons: (Array.isArray(item?.waitingReasons) ? item.waitingReasons : [])
      .slice(0, 3)
      .map((reason) => text(reason, limits.text))
      .filter(Boolean)
  };
}

function followThroughContext(item, limits) {
  return {
    ...contextFields(item, limits),
    reasonKinds: (Array.isArray(item?.reasonKinds) ? item.reasonKinds : [])
      .slice(0, 4)
      .map((reason) => text(reason, 40))
      .filter(Boolean),
    reasons: (Array.isArray(item?.reasons) ? item.reasons : [])
      .slice(0, 3)
      .map((reason) => text(reason, limits.text))
      .filter(Boolean)
  };
}

function limitsFor(options) {
  const supplied = options?.limits || {};
  return {
    focus: Number.isInteger(supplied.focus) && supplied.focus >= 0 ? supplied.focus : DEFAULT_CONTEXT_LIMITS.focus,
    waiting: Number.isInteger(supplied.waiting) && supplied.waiting >= 0 ? supplied.waiting : DEFAULT_CONTEXT_LIMITS.waiting,
    followThrough: Number.isInteger(supplied.followThrough) && supplied.followThrough >= 0 ? supplied.followThrough : DEFAULT_CONTEXT_LIMITS.followThrough,
    text: Number.isInteger(supplied.text) && supplied.text >= 20 ? supplied.text : DEFAULT_CONTEXT_LIMITS.text
  };
}

export function buildCoachContext(roadmap, referenceDateString, options = {}) {
  const limits = limitsFor(options);
  const focusView = options.focusView || buildTodayFocus(roadmap, referenceDateString, { limit: limits.focus });
  const followThroughView = options.followThroughView || buildFollowThroughView(roadmap, referenceDateString, options);

  return {
    schemaVersion: COACH_CONTEXT_SCHEMA_VERSION,
    date: text(focusView.date || followThroughView.date, 32),
    source: 'local-roadmap-derived',
    focus: (focusView.focus || []).slice(0, limits.focus).map((item) => focusContext(item, limits)),
    waiting: (focusView.waiting || []).slice(0, limits.waiting).map((item) => waitingContext(item, limits)),
    followThrough: (followThroughView.items || []).slice(0, limits.followThrough).map((item) => followThroughContext(item, limits)),
    counts: {
      ready: Number(focusView.counts?.ready || 0),
      focus: Number(focusView.counts?.focus || 0),
      waiting: Number(focusView.counts?.waiting || 0),
      blocked: Number(focusView.counts?.blocked || 0),
      dependencyWaiting: Number(focusView.counts?.dependencyWaiting || 0),
      followThrough: Number(followThroughView.counts?.review || 0)
    }
  };
}

export function buildDeterministicCoachGuidance(context) {
  const focus = Array.isArray(context?.focus) ? context.focus : [];
  const waiting = Array.isArray(context?.waiting) ? context.waiting : [];

  if (focus.length) {
    const item = focus[0];
    if (item.nextAction) {
      return {
        type: 'existing-next-action',
        taskId: item.id,
        title: item.title,
        guidance: item.nextAction,
        reason: `Selected from the current Focus item “${item.title}”.`,
        uncertain: false
      };
    }
    return {
      type: 'request-next-action',
      taskId: item.id,
      title: item.title,
      guidance: `Define the next action for “${item.title}” before starting it.`,
      reason: 'The current Focus item has no stored next action.',
      uncertain: true
    };
  }

  if (waiting.length) {
    const item = waiting[0];
    return {
      type: 'waiting-explanation',
      taskId: item.id,
      title: item.title,
      guidance: item.waitingReasons?.[0] || `Review what is keeping “${item.title}” waiting.`,
      reason: 'No task is currently ready in Focus.',
      uncertain: false
    };
  }

  return {
    type: 'no-actionable-work',
    taskId: null,
    title: null,
    guidance: 'No actionable work is currently available in the local roadmap.',
    reason: 'Focus and Waiting are both empty.',
    uncertain: false
  };
}