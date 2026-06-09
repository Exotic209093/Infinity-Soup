import type { AiClient } from './personalize.js';

/**
 * Provider-agnostic LLM client for outreach personalization — Anthropic (Claude), OpenAI
 * (ChatGPT), and Google Gemini. The chosen SDK is imported LAZILY so the brain never hard-loads a
 * provider you aren't using, and tests never touch the network.
 *
 * Selection (env):
 *   AI_PROVIDER = anthropic | openai | gemini  (optional; else inferred from whichever key is set)
 *   AI_MODEL    = <model id>                    (optional; overrides the per-provider default)
 *   keys: ANTHROPIC_API_KEY | OPENAI_API_KEY | GEMINI_API_KEY (or GOOGLE_API_KEY)
 */

export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export interface AiConfig { provider: AiProvider; model: string; apiKey: string; }

const PROVIDER_ORDER: AiProvider[] = ['anthropic', 'openai', 'gemini'];

/** Workhorse (cheap, fast) model per provider — well suited to short outreach messages. */
const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-5.4-mini',
  gemini: 'gemini-2.5-flash',
};

/** Env var(s) holding each provider's API key (first non-empty wins). */
const KEY_ENV: Record<AiProvider, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
};

const MAX_TOKENS = 300;

/**
 * Resolve provider/model/key from env. If AI_PROVIDER is set we honour it (and need that
 * provider's key); otherwise we pick the first provider with a key in PROVIDER_ORDER. Returns null
 * when no usable key is present — the caller then falls back to the plain template.
 */
export function resolveAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig | null {
  const explicit = (env.AI_PROVIDER ?? '').trim().toLowerCase();
  const candidates: AiProvider[] = PROVIDER_ORDER.includes(explicit as AiProvider)
    ? [explicit as AiProvider]
    : PROVIDER_ORDER;
  for (const provider of candidates) {
    const apiKey = KEY_ENV[provider].map((k) => env[k]).find((v): v is string => Boolean(v));
    if (apiKey) {
      const model = (env.AI_MODEL ?? '').trim() || DEFAULT_MODEL[provider];
      return { provider, model, apiKey };
    }
  }
  return null;
}

/** Returns a provider-backed AiClient, or null if no key is configured (→ template fallback). */
export function createAiClient(env: NodeJS.ProcessEnv = process.env): AiClient | null {
  const cfg = resolveAiConfig(env);
  if (!cfg) return null;
  return { complete: (prompt: string) => complete(cfg, prompt) };
}

/** Human-readable label for logs/CLI, e.g. "openai (gpt-5.4-mini)" or "template (no API key)". */
export function describeAi(env: NodeJS.ProcessEnv = process.env): string {
  const cfg = resolveAiConfig(env);
  return cfg ? `${cfg.provider} (${cfg.model})` : 'template (no API key)';
}

async function complete(cfg: AiConfig, prompt: string): Promise<string> {
  switch (cfg.provider) {
    case 'anthropic': {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: cfg.apiKey });
      const msg = await client.messages.create({
        model: cfg.model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      });
      const block = msg.content.find((b) => b.type === 'text');
      return block && 'text' in block ? block.text : '';
    }
    case 'openai': {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: cfg.apiKey });
      const res = await client.chat.completions.create({
        model: cfg.model,
        max_completion_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      });
      return res.choices[0]?.message?.content ?? '';
    }
    case 'gemini': {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: cfg.apiKey });
      const res = await ai.models.generateContent({ model: cfg.model, contents: prompt });
      return res.text ?? '';
    }
  }
  return '';
}
