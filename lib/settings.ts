import type { PublicSettings, Settings, Shortcut } from './types';
import { isValidShortcut } from './shortcut';

export const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    mark: '◉',
    baseUrl: 'https://api.openai.com/v1',
    description: 'GPT 系列模型',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    mark: '≈',
    baseUrl: 'https://api.deepseek.com/v1',
    description: 'DeepSeek 系列模型',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    mark: '↗',
    baseUrl: 'https://openrouter.ai/api/v1',
    description: '一个接口，多种模型',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    mark: '◎',
    baseUrl: 'http://localhost:11434/v1',
    description: '在自己的设备上运行',
  },
  { id: 'custom', name: '自定义', mark: '⌘', baseUrl: '', description: '兼容 OpenAI 的接口' },
] as const;

export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
  enabled: true,
  shortcut: { modifiers: [], code: 'Space' },
  language: 'zh-CN',
  contextMode: 'visible',
  answerStyle: 'concise',
  autoExplain: false,
  syncEnabled: true,
  syncApiKey: false,
};

export function normalizeSettings(value: Partial<Settings>): Settings {
  const result = { ...DEFAULT_SETTINGS, ...value };
  for (const key of ['apiKey', 'model', 'baseUrl', 'provider'] as const) {
    result[key] =
      typeof result[key] === 'string' ? result[key].trim().slice(0, 2048) : DEFAULT_SETTINGS[key];
  }
  for (const key of ['enabled', 'autoExplain', 'syncEnabled', 'syncApiKey'] as const) {
    if (typeof result[key] !== 'boolean') result[key] = DEFAULT_SETTINGS[key];
  }
  if (!['zh-CN', 'zh-TW', 'en'].includes(result.language)) result.language = 'zh-CN';
  if (!['visible', 'paragraph', 'selection'].includes(result.contextMode))
    result.contextMode = 'visible';
  if (!['concise', 'detailed'].includes(result.answerStyle)) result.answerStyle = 'concise';
  if (!isValidShortcut(result.shortcut)) {
    result.shortcut = DEFAULT_SETTINGS.shortcut;
  }
  return result;
}

export function normalizeStoredSettings(
  value: Partial<Settings> & { shortcutVersion?: number },
): Settings {
  const { shortcutVersion, ...settings } = value;
  // Upgrade the old default once; explicitly saved shortcuts (including Alt) stay unchanged.
  if (
    shortcutVersion !== 2 &&
    settings.shortcut?.code === null &&
    settings.shortcut.modifiers?.length === 1 &&
    settings.shortcut.modifiers[0] === 'Alt'
  ) {
    settings.shortcut = DEFAULT_SETTINGS.shortcut;
  }
  return normalizeSettings(settings);
}

export function isLocalUrl(baseUrl: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

export function isConfigured(settings: Pick<Settings, 'baseUrl' | 'apiKey' | 'model'>): boolean {
  return !!settings.model && (!!settings.apiKey || isLocalUrl(settings.baseUrl));
}

export function publicSettings(settings: Settings): PublicSettings {
  const {
    apiKey: _key,
    baseUrl: _url,
    syncEnabled: _sync,
    syncApiKey: _syncKey,
    ...safe
  } = settings;
  return { ...safe, configured: isConfigured(settings) };
}

export function shortcutLabel(shortcut: Shortcut): string {
  return [
    ...shortcut.modifiers.map(
      (m) => ({ Alt: '⌥ Option / Alt', Control: 'Ctrl', Meta: '⌘ Command', Shift: '⇧ Shift' })[m],
    ),
    ...(shortcut.code
      ? [shortcut.code === 'Space' ? '空格' : shortcut.code.replace(/^(Key|Digit)/, '')]
      : []),
  ].join(' + ');
}
