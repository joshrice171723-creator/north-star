// Presentation boundary for the local coach card.
// Keeps renderer text and action labels deterministic and provider-free.

export function buildCoachCardModel(guidance) {
  const source = guidance || {};
  const models = {
    'existing-next-action': {
      eyebrow: 'LOCAL GUIDANCE · NEXT ACTION', heading: 'Start with the stored next action', actionLabel: 'Review task', tone: 'ready'
    },
    'request-next-action': {
      eyebrow: 'LOCAL GUIDANCE · NEEDS CLARITY', heading: 'Choose a concrete next action', actionLabel: 'Review task', tone: 'clarity'
    },
    'waiting-explanation': {
      eyebrow: 'LOCAL GUIDANCE · WAITING', heading: 'Review what is holding work back', actionLabel: 'Review task', tone: 'waiting'
    },
    'no-actionable-work': {
      eyebrow: 'LOCAL GUIDANCE · ROADMAP STATUS', heading: 'There is nothing actionable right now', actionLabel: null, tone: 'empty'
    }
  };
  const model = models[source.type] || models['no-actionable-work'];
  return {
    ...model,
    type: source.type || 'no-actionable-work',
    taskId: source.taskId || null,
    title: source.title || null,
    guidance: source.guidance || 'No actionable work is currently available in the local roadmap.',
    reason: source.reason || 'Focus and Waiting are both empty.',
    uncertain: Boolean(source.uncertain)
  };
}