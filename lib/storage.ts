import { DEFAULT_SETTINGS, normalizeSettings, normalizeStoredSettings } from './settings';
import type { Settings } from './types';

export const inExtension = () => typeof chrome !== 'undefined' && !!chrome.runtime?.id;
const CONFIG = 'margin.config.v1';
const SECRET = 'margin.secret.v1';
const DEVICE = 'margin.device.v1';
const DRAFT = 'margin.draft.v1';
type Config = Omit<Settings, 'apiKey' | 'syncEnabled'> & { shortcutVersion?: number };
interface Secret {
  baseUrl: string;
  apiKey: string;
}

export async function loadSettings(): Promise<Settings> {
  if (!inExtension()) {
    const saved = localStorage.getItem(CONFIG);
    return normalizeStoredSettings(saved ? JSON.parse(saved) : DEFAULT_SETTINGS);
  }
  const [local, remote] = await Promise.all([
    chrome.storage.local.get([CONFIG, SECRET, DEVICE]),
    chrome.storage.sync.get([CONFIG, SECRET]),
  ]);
  const syncEnabled =
    (local[DEVICE] as { syncEnabled?: boolean } | undefined)?.syncEnabled !== false;
  const config = (syncEnabled ? (remote[CONFIG] ?? local[CONFIG]) : local[CONFIG]) as
    | Config
    | undefined;
  const baseUrl = config?.baseUrl ?? DEFAULT_SETTINGS.baseUrl;
  // A key is bound to its endpoint. A synced endpoint change must never reuse a local provider's key.
  const secret = (syncEnabled && config?.syncApiKey ? remote[SECRET] : local[SECRET]) as
    | Secret
    | undefined;
  const apiKey = secret?.baseUrl === baseUrl ? secret.apiKey : '';
  return normalizeStoredSettings({ ...config, apiKey, syncEnabled });
}

export async function saveSettings(input: Settings): Promise<Settings> {
  const settings = normalizeSettings(input);
  if (!inExtension()) {
    // The website preview intentionally never persists API credentials.
    localStorage.setItem(CONFIG, JSON.stringify({ ...settings, apiKey: '', shortcutVersion: 2 }));
    return settings;
  }
  const { apiKey, syncEnabled, ...values } = settings;
  const config: Config = { ...values, shortcutVersion: 2 };
  const secret: Secret = { apiKey, baseUrl: settings.baseUrl };
  // Write remotely first: a failed/quota-limited write must not look like a successful save.
  if (syncEnabled) {
    if (settings.syncApiKey) await chrome.storage.sync.set({ [CONFIG]: config, [SECRET]: secret });
    else {
      await chrome.storage.sync.remove(SECRET);
      await chrome.storage.sync.set({ [CONFIG]: config });
    }
  } else {
    // Never leave a previously opted-in secret in sync after key syncing is switched off.
    await chrome.storage.sync.remove(SECRET);
  }
  await chrome.storage.local.set({ [CONFIG]: config, [SECRET]: secret, [DEVICE]: { syncEnabled } });
  return settings;
}

/** Drafts stay on this device and never change the configuration used by the background. */
export async function loadSettingsDraft(saved: Settings): Promise<Settings> {
  let draft: Partial<Settings> | undefined;
  if (inExtension()) {
    draft = (await chrome.storage.local.get(DRAFT))[DRAFT] as Partial<Settings> | undefined;
  } else {
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT) ?? 'null');
    } catch {
      return saved;
    }
  }
  if (!draft || typeof draft !== 'object') return saved;
  const result = normalizeSettings({ ...saved, ...draft });
  // An unfinished URL (and intentional empty fields) must survive closing the popup unchanged.
  for (const key of ['baseUrl', 'apiKey', 'model', 'provider'] as const) {
    if (typeof draft[key] === 'string') result[key] = draft[key].slice(0, 2048);
  }
  return result;
}

export async function saveSettingsDraft(current: Settings, saved: Settings): Promise<void> {
  const changes: Partial<Settings> = Object.fromEntries(
    (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[])
      .filter((key) => JSON.stringify(current[key]) !== JSON.stringify(saved[key]))
      .map((key) => [key, current[key]]),
  );
  // Restore a draft endpoint and its key together, even if synced settings change in the meantime.
  if ('baseUrl' in changes || 'apiKey' in changes) {
    changes.baseUrl = current.baseUrl;
    changes.apiKey = current.apiKey;
  }
  if (!inExtension()) {
    delete changes.apiKey;
    if (Object.keys(changes).length) localStorage.setItem(DRAFT, JSON.stringify(changes));
    else localStorage.removeItem(DRAFT);
    return;
  }
  // Start the browser-managed write directly from the input event; no debounce or unload handler.
  if (Object.keys(changes).length) await chrome.storage.local.set({ [DRAFT]: changes });
  else await chrome.storage.local.remove(DRAFT);
}

export async function protectStorage() {
  await Promise.all([
    chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    chrome.storage.sync.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]);
}

export function watchSettings(callback: () => void) {
  if (!inExtension()) return () => {};
  const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
    if ([CONFIG, SECRET, DEVICE].some((key) => key in changes)) callback();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function openOptions() {
  if (inExtension()) void chrome.runtime.openOptionsPage();
  else window.open('/options.html', '_blank', 'noopener');
}

export function openBackupOptions() {
  if (inExtension()) void chrome.tabs.create({ url: chrome.runtime.getURL('options.html#backup') });
  else window.open('/options.html#backup', '_blank', 'noopener');
}
