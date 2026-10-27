import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamCompletion, testConnection } from '../lib/api';
import { createSettingsBackup, parseSettingsBackup } from '../lib/backup';
import { DEFAULT_SETTINGS, normalizeSettings } from '../lib/settings';
import type { ConnectionConfig } from '../lib/types';

afterEach(() => vi.unstubAllGlobals());

function mockCompletion(status = 200) {
  const fetch = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('reasoning request configuration', () => {
  const config = { baseUrl: 'https://gateway.example/v1', apiKey: 'test-key', model: 'test' };

  it.each([undefined, 'default'] as const)('omits reasoning fields for %s', async (effort) => {
    const fetch = mockCompletion();
    await testConnection({ ...config, reasoningEffort: effort });
    const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({
      model: 'test',
      messages: [{ role: 'user', content: 'Reply with only OK.' }],
      stream: true,
    });
  });

  it.each([
    [{ provider: 'openai', reasoningEffort: 'none' }, { reasoning_effort: 'none' }],
    [{ provider: 'custom', reasoningEffort: 'low' }, { reasoning_effort: 'low' }],
    [{ provider: 'ollama', reasoningEffort: 'medium' }, { reasoning_effort: 'medium' }],
    [{ provider: 'ollama', reasoningEffort: 'none' }, { reasoning_effort: 'none' }],
    [{ provider: 'openai', reasoningEffort: 'high' }, { reasoning_effort: 'high' }],
    [{ provider: 'deepseek', reasoningEffort: 'none' }, { thinking: { type: 'disabled' } }],
    [
      { provider: 'deepseek', reasoningEffort: 'low' },
      { thinking: { type: 'enabled' }, reasoning_effort: 'low' },
    ],
    [{ provider: 'openrouter', reasoningEffort: 'none' }, { reasoning: { effort: 'none' } }],
    [{ provider: 'openrouter', reasoningEffort: 'high' }, { reasoning: { effort: 'high' } }],
    [
      { provider: 'custom', baseUrl: 'https://api.deepseek.com/v1', reasoningEffort: 'none' },
      { thinking: { type: 'disabled' } },
    ],
    [
      { provider: 'openai', baseUrl: 'https://openrouter.ai/api/v1', reasoningEffort: 'low' },
      { reasoning: { effort: 'low' } },
    ],
  ] satisfies [Partial<ConnectionConfig>, Record<string, unknown>][])(
    'sends provider parameters for %j',
    async (patch, expected) => {
      const fetch = mockCompletion();
      const messages = [{ role: 'user', content: 'Explain this.' }];
      const output = [];
      for await (const text of streamCompletion({ ...config, ...patch }, messages))
        output.push(text);
      expect(output).toEqual(['OK']);
      const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
      expect(body).toEqual({ model: 'test', messages, stream: true, ...expected });
    },
  );

  it('reports rejected reasoning settings without retrying or silently enabling thinking', async () => {
    const fetch = mockCompletion(400);
    await expect(testConnection({ ...config, reasoningEffort: 'none' })).rejects.toThrow(
      '跟随模型默认',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('reasoning preference compatibility', () => {
  it('defaults missing and invalid stored values while preserving explicit off', () => {
    expect(normalizeSettings({}).reasoningEffort).toBe('default');
    expect(normalizeSettings({ reasoningEffort: 'none' }).reasoningEffort).toBe('none');
    expect(normalizeSettings({ reasoningEffort: 'invalid' as never }).reasoningEffort).toBe(
      'default',
    );
  });

  it('round-trips reasoning settings in backups and accepts legacy backups', () => {
    const backup = createSettingsBackup({ ...DEFAULT_SETTINGS, reasoningEffort: 'high' });
    expect(parseSettingsBackup(backup).reasoningEffort).toBe('high');
    const legacy = JSON.parse(backup);
    delete legacy.settings.reasoningEffort;
    expect(parseSettingsBackup(JSON.stringify(legacy)).reasoningEffort).toBe('default');
    legacy.settings.reasoningEffort = 'invalid';
    expect(() => parseSettingsBackup(JSON.stringify(legacy))).toThrow('配置值无效');
    legacy.settings.reasoningEffort = null;
    expect(() => parseSettingsBackup(JSON.stringify(legacy))).toThrow('格式不正确');
  });
});
