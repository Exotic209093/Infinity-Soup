import type { AiClient } from './personalize.js';

/**
 * Returns an Anthropic-backed AiClient if ANTHROPIC_API_KEY is set, else null (→ template fallback).
 * The SDK is imported lazily so the brain never hard-requires it and tests never load it.
 */
export function createAiClient(env: NodeJS.ProcessEnv = process.env): AiClient | null {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return {
    async complete(prompt: string): Promise<string> {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: key });
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      });
      const block = msg.content.find((b) => b.type === 'text');
      return block && 'text' in block ? block.text : '';
    },
  };
}
