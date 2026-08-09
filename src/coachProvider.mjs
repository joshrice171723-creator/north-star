export const OPENROUTER_COACH_MODEL = 'openai/gpt-5.6-luna-pro';
export const COACH_RESPONSE_MAX_TOKENS = 700;

const SYSTEM_PROMPT = [
  'You are a concise execution coach.',
  'Use only the supplied local roadmap context.',
  'Recommend exactly one task from the supplied focus list and one practical next step.',
  'Do not invent tasks, deadlines, dependencies, or facts.',
  'Do not claim to have changed any task.',
  'Return JSON only with this exact shape: {"taskId":"...","nextStep":"...","explanation":"...","uncertainty":"none|low|medium|high"}.',
  'The taskId must be copied exactly from the focus list. If focus is empty, return {"taskId":null,"nextStep":"","explanation":"No ready work is available.","uncertainty":"none"}.',
  'Keep each text field under 500 characters.'
].join(' ');

export function buildCoachProviderMessages(context) {
  const boundedContext = JSON.stringify(context || {});
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Give one coaching recommendation from this bounded local context.\n\n${boundedContext}`
    }
  ];
}

function parseJsonContent(content) {
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export function validateCoachRecommendation(recommendation, context) {
  if (!recommendation || typeof recommendation !== 'object' || Array.isArray(recommendation)) return { ok: false, error: 'The provider returned invalid recommendation JSON.' };
  const focus = Array.isArray(context?.focus) ? context.focus : [];
  const taskId = recommendation.taskId === null ? null : recommendation.taskId;
  if (taskId !== null && (typeof taskId !== 'string' || taskId.length > 160)) return { ok: false, error: 'The provider returned an invalid task ID.' };
  if (!['none', 'low', 'medium', 'high'].includes(recommendation.uncertainty)) return { ok: false, error: 'The provider returned an invalid uncertainty level.' };
  if (typeof recommendation.nextStep !== 'string' || recommendation.nextStep.length > 500 || (taskId !== null && !recommendation.nextStep.trim())) return { ok: false, error: 'The provider returned an invalid nextStep.' };
  if (typeof recommendation.explanation !== 'string' || !recommendation.explanation.trim() || recommendation.explanation.length > 500) return { ok: false, error: 'The provider returned an invalid explanation.' };
  if (taskId === null) {
    if (focus.length) return { ok: false, error: 'The provider reported no ready work despite an available Focus item.' };
    return { ok: true, recommendation: { taskId: null, nextStep: recommendation.nextStep.trim(), explanation: recommendation.explanation.trim(), uncertainty: recommendation.uncertainty } };
  }
  const item = focus.find((candidate) => candidate.id === taskId);
  if (!item) return { ok: false, error: 'The provider recommended work outside the current Focus list.' };
  if (item.blocked || item.status === 'done' || item.dependencyChain?.length) return { ok: false, error: 'The provider recommended work that is not currently ready.' };
  return { ok: true, recommendation: { taskId, nextStep: recommendation.nextStep.trim(), explanation: recommendation.explanation.trim(), uncertainty: recommendation.uncertainty, title: item.title } };
}

export function normalizeCoachProviderResponse(result, context) {
  const content = result?.message?.content;
  const parsed = parseJsonContent(content);
  const validation = validateCoachRecommendation(parsed, context);
  return {
    ok: Boolean(result?.ok && validation.ok),
    model: result?.model || OPENROUTER_COACH_MODEL,
    recommendation: validation.ok ? validation.recommendation : null,
    text: validation.ok ? JSON.stringify(validation.recommendation) : '',
    usage: result?.usage || null,
    error: result?.ok && validation.ok ? null : (result?.error || validation.error || 'The provider returned no valid coaching recommendation.')
  };
}