import { normalizeBaseUrl } from './api';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';
import type { Settings } from './types';

export type BackupSettings = Omit<Settings, 'syncEnabled' | 'syncApiKey'>;
export const MAX_BACKUP_BYTES = 64 * 1024;
const backupKeys = (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).filter(
  (key): key is keyof BackupSettings => key !== 'syncEnabled' && key !== 'syncApiKey',
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateSettings(value: unknown): BackupSettings {
  if (!isRecord(value)) throw new Error('备份中缺少配置信息。');
  for (const key of backupKeys) {
    const item = value[key];
    const expected = DEFAULT_SETTINGS[key];
    if (
      !Object.hasOwn(value, key) ||
      typeof item !== typeof expected ||
      (typeof item === 'string' && item.length > 2048)
    ) {
      throw new Error('备份中的配置不完整或格式不正确。');
    }
  }
  // Only accept known fields; an imported file cannot opt this device into syncing secrets.
  const picked = Object.fromEntries(backupKeys.map((key) => [key, value[key]]));
  const normalized = normalizeSettings(picked);
  for (const key of backupKeys) {
    if (typeof DEFAULT_SETTINGS[key] === 'string' && typeof value[key] === 'string') {
      if (value[key].trim() === normalized[key]) continue;
    } else if (JSON.stringify(value[key]) === JSON.stringify(normalized[key])) {
      continue;
    }
    throw new Error('备份中的配置值无效，请选择 Margin 导出的备份文件。');
  }
  normalized.baseUrl = normalizeBaseUrl(normalized.baseUrl);
  return Object.fromEntries(backupKeys.map((key) => [key, normalized[key]])) as BackupSettings;
}

export function createSettingsBackup(settings: Settings): string {
  return JSON.stringify(
    {
      format: 'margin-settings',
      version: 1,
      createdAt: new Date().toISOString(),
      settings: validateSettings(settings),
    },
    null,
    2,
  );
}

export function parseSettingsBackup(text: string): BackupSettings {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('备份文件过大，请选择 Margin 导出的配置文件。');
  }
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('无法读取备份，请选择有效的 JSON 配置文件。');
  }
  if (!isRecord(value) || value.format !== 'margin-settings') {
    throw new Error('这不是 Margin 配置备份文件。');
  }
  if (value.version !== 1) throw new Error('暂不支持此备份版本，请更新插件后再恢复。');
  return validateSettings(value.settings);
}

export function downloadSettingsBackup(settings: Settings) {
  const text = createSettingsBackup(settings);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `margin-settings-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Keep the blob alive long enough for the browser to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
