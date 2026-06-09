import { describe, it, expect } from 'vitest';
import { createAiClient, resolveAiConfig, describeAi } from './llm-client.js';

// Pure selection logic — no SDK is imported and no network is touched (complete() is never called).
describe('resolveAiConfig', () => {
  it('returns null when no provider key is present', () => {
    expect(resolveAiConfig({})).toBeNull();
    expect(resolveAiConfig({ OTHER_KEY: 'x' })).toBeNull();
  });

  it('infers anthropic from ANTHROPIC_API_KEY with the default model', () => {
    expect(resolveAiConfig({ ANTHROPIC_API_KEY: 'k' })).toEqual({
      provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'k',
    });
  });

  it('infers openai and gemini from their keys (GOOGLE_API_KEY aliases gemini)', () => {
    expect(resolveAiConfig({ OPENAI_API_KEY: 'k' })?.provider).toBe('openai');
    expect(resolveAiConfig({ GEMINI_API_KEY: 'k' })?.provider).toBe('gemini');
    expect(resolveAiConfig({ GOOGLE_API_KEY: 'k' })?.provider).toBe('gemini');
  });

  it('prefers anthropic when several keys are present (provider order)', () => {
    expect(resolveAiConfig({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', GEMINI_API_KEY: 'g' })?.provider)
      .toBe('anthropic');
  });

  it('AI_PROVIDER forces a provider and needs that provider key', () => {
    expect(resolveAiConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k', ANTHROPIC_API_KEY: 'a' })?.provider)
      .toBe('openai');
    expect(resolveAiConfig({ AI_PROVIDER: 'gemini', OPENAI_API_KEY: 'k' })).toBeNull();
  });

  it('AI_MODEL overrides the per-provider default', () => {
    expect(resolveAiConfig({ OPENAI_API_KEY: 'k', AI_MODEL: 'gpt-5.5' })?.model).toBe('gpt-5.5');
  });
});

describe('createAiClient', () => {
  it('returns null without a key and a {complete} client with one', () => {
    expect(createAiClient({})).toBeNull();
    expect(typeof createAiClient({ ANTHROPIC_API_KEY: 'k' })?.complete).toBe('function');
  });
});

describe('describeAi', () => {
  it('labels the active provider+model, or template when no key', () => {
    expect(describeAi({})).toBe('template (no API key)');
    expect(describeAi({ OPENAI_API_KEY: 'k' })).toBe('openai (gpt-5.4-mini)');
    expect(describeAi({ GEMINI_API_KEY: 'k', AI_MODEL: 'gemini-3.5-flash' })).toBe('gemini (gemini-3.5-flash)');
  });
});
