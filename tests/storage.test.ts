import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, loadSettingsDraft, saveSettings, saveSettingsDraft } from '../lib/storage';
import { DEFAULT_SETTINGS } from '../lib/settings';

const local: Record<string, unknown> = {};
const sync: Record<string, unknown> = {};
function area(data: Record<string, unknown>) {
  return {
    get: vi.fn(async () => ({ ...data })),
    set: vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(data, values);
    }),
    remove: vi.fn(async (key: string) => {
      delete data[key];
    }),
  };
}
beforeEach(() => {
  for (const object of [local, sync]) for (const key of Object.keys(object)) delete object[key];
  vi.stubGlobal('chrome', {
    runtime: { id: 'test-extension' },
    storage: { local: area(local), sync: area(sync) },
  });
});

describe('Chrome settings storage', () => {
  it('persists reasoning drafts locally and syncs the applied setting', async () => {
    const draft = { ...DEFAULT_SETTINGS, reasoningEffort: 'none' as const };
    await saveSettingsDraft(draft, DEFAULT_SETTINGS);
    expect((await loadSettingsDraft(DEFAULT_SETTINGS)).reasoningEffort).toBe('none');
    expect((await loadSettings()).reasoningEffort).toBe('default');
    await saveSettings(draft);
    expect(sync['margin.config.v1']).toMatchObject({ reasoningEffort: 'none' });
    expect((await loadSettings()).reasoningEffort).toBe('none');
  });
  it('retains incomplete input locally without applying or syncing the draft', async () => {
    const draft = { ...DEFAULT_SETTINGS, baseUrl: 'http://', apiKey: 'draft-key', enabled: false };
    await saveSettingsDraft(draft, DEFAULT_SETTINGS);
    expect(await loadSettingsDraft(await loadSettings())).toEqual(draft);
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(sync).toEqual({});
  });
  it('restores draft credentials together while allowing untouched preferences to sync', async () => {
    const applied = await saveSettings({ ...DEFAULT_SETTINGS, apiKey: 'old-key' });
    await saveSettingsDraft({ ...applied, apiKey: 'draft-key' }, applied);
    const remote = sync['margin.config.v1'] as { baseUrl: string; language: string };
    remote.baseUrl = 'https://another-provider.example/v1';
    remote.language = 'en';
    const restored = await loadSettingsDraft(await loadSettings());
    expect(restored.baseUrl).toBe(applied.baseUrl);
    expect(restored.apiKey).toBe('draft-key');
    expect(restored.language).toBe('en');
    expect(JSON.stringify(sync)).not.toContain('draft-key');
  });
  it('clears a draft after applying it so future synced values are not overwritten', async () => {
    const draft = { ...DEFAULT_SETTINGS, baseUrl: 'http://example.com/v1', apiKey: 'new-key' };
    await saveSettingsDraft(draft, DEFAULT_SETTINGS);
    const applied = await saveSettings(draft);
    await saveSettingsDraft(applied, applied);
    expect(local).not.toHaveProperty('margin.draft.v1');
    expect(await loadSettingsDraft(await loadSettings())).toEqual(applied);
  });
  it('reports local draft write failures', async () => {
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(
      saveSettingsDraft({ ...DEFAULT_SETTINGS, apiKey: 'draft-key' }, DEFAULT_SETTINGS),
    ).rejects.toThrow('storage unavailable');
  });
  it('syncs preferences but stores secrets locally by default', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, apiKey: 'private-key', model: 'test-model' });
    expect(JSON.stringify(sync)).not.toContain('private-key');
    expect((await loadSettings()).apiKey).toBe('private-key');
    expect((await loadSettings()).model).toBe('test-model');
  });
  it('requires opt-in for secret syncing and removes synced keys when it is turned off', async () => {
    const settings = { ...DEFAULT_SETTINGS, apiKey: 'private-key', syncApiKey: true };
    await saveSettings(settings);
    expect(JSON.stringify(sync)).toContain('private-key');
    delete local['margin.secret.v1'];
    expect((await loadSettings()).apiKey).toBe('private-key');
    await saveSettings({ ...settings, syncApiKey: false });
    expect(sync).not.toHaveProperty('margin.secret.v1');
    expect((await loadSettings()).apiKey).toBe('private-key');
  });
  it('never sends a local key to an endpoint changed by another device', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, apiKey: 'private-key' });
    (sync['margin.config.v1'] as { baseUrl: string }).baseUrl =
      'https://different-provider.example/v1';
    expect((await loadSettings()).apiKey).toBe('');
  });
  it('uses local preferences when sync is disabled and removes old remote secrets', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, apiKey: 'private-key', syncApiKey: true });
    await saveSettings({
      ...DEFAULT_SETTINGS,
      apiKey: 'private-key',
      syncEnabled: false,
      syncApiKey: false,
      language: 'en',
    });
    expect(sync).not.toHaveProperty('margin.secret.v1');
    expect((await loadSettings()).language).toBe('en');
  });
  it('surfaces sync failures instead of reporting a successful save', async () => {
    vi.mocked(chrome.storage.sync.set).mockRejectedValueOnce(new Error('QUOTA_BYTES_PER_ITEM'));
    await expect(saveSettings({ ...DEFAULT_SETTINGS, model: 'test' })).rejects.toThrow('QUOTA');
    expect(local).not.toHaveProperty('margin.config.v1');
  });
});
