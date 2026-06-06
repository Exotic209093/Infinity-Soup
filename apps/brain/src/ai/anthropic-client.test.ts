import { describe, it, expect } from 'vitest';
import { createAiClient } from './anthropic-client.js';

describe('createAiClient', () => {
  it('returns null when ANTHROPIC_API_KEY is absent', () => {
    expect(createAiClient({})).toBeNull();
  });

  it('returns null when ANTHROPIC_API_KEY is undefined', () => {
    // process.env entries for missing keys are undefined
    expect(createAiClient({ OTHER_KEY: 'value' })).toBeNull();
  });

  it('returns a non-null object with a complete function when key is present', () => {
    const client = createAiClient({ ANTHROPIC_API_KEY: 'sk-test-key' });
    expect(client).not.toBeNull();
    expect(typeof client?.complete).toBe('function');
  });

  // We do NOT call complete() — that would require the SDK and hit the network.
});
