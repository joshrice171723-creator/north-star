export const OPENROUTER_COACH_MODEL = 'openai/gpt-5.6-luna-pro';
export const COACH_RESPONSE_MAX_TOKENS = 700;

const SYSTEM_PROMPT = [
  'You are a concise execution coach.',
  'Use only the supplied local roadmap context.',
  'Recommend one practical next step and explain the constraint or evidence behind it.',
  'Do not invent tasks, deadlines, dependencies, or facts.',
  'Do not claim to have changed any task.',
  'Keep the response under 180 words and use plain text.'
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

export function normalizeCoachProviderResponse(result) {
  const content = result?.message?.content;
  return {
    ok: Boolean(result?.ok && typeof content === 'string' && content.trim()),
    model: result?.model || OPENROUTER_COACH_MODEL,
    text: typeof content === 'string' ? content.trim() : '',
    usage: result?.usage || null,
    error: result?.ok && content?.trim() ? null : (result?.error || 'The provider returned no coaching text.')
  };
}