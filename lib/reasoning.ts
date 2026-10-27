import type { ConnectionConfig } from './types';

export function reasoningParameters(config: ConnectionConfig): Record<string, unknown> {
  const effort = config.reasoningEffort;
  // Omitting the parameter preserves behavior for existing settings and ordinary chat models.
  if (!effort || effort === 'default') return {};

  const hostname = new URL(config.baseUrl).hostname;
  // Recognize official endpoints even when entered under the custom provider option.
  const provider =
    hostname === 'openrouter.ai'
      ? 'openrouter'
      : hostname === 'api.deepseek.com'
        ? 'deepseek'
        : hostname === 'api.openai.com'
          ? 'openai'
          : config.provider;

  if (provider === 'openrouter') return { reasoning: { effort } };
  if (provider === 'deepseek') {
    return effort === 'none'
      ? { thinking: { type: 'disabled' } }
      : { thinking: { type: 'enabled' }, reasoning_effort: effort };
  }
  // OpenAI, Ollama's OpenAI-compatible endpoint, and custom compatible gateways.
  return { reasoning_effort: effort };
}
