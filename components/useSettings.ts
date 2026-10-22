import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { loadSettings, loadSettingsDraft, saveSettings, saveSettingsDraft } from '../lib/storage';
import { normalizeBaseUrl } from '../lib/api';
import type { Settings } from '../lib/types';
import type { BackupSettings } from '../lib/backup';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [draftStatus, setDraftStatus] = useState<'saving' | 'saved' | 'error'>('saved');
  const currentRef = useRef(DEFAULT_SETTINGS);
  const savedRef = useRef(DEFAULT_SETTINGS);
  const editRevision = useRef(0);
  const draftRevision = useRef(0);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const applied = await loadSettings();
      const draft = await loadSettingsDraft(applied);
      if (!active) return;
      currentRef.current = draft;
      savedRef.current = applied;
      setSettings(draft);
      setSaved(applied);
      setReady(true);
    })().catch(() => {
      if (active) setNotice({ text: '设置读取失败，请重新打开插件。', error: true });
    });
    return () => {
      active = false;
    };
  }, []);

  const persistDraft = useCallback(async (current: Settings, applied: Settings) => {
    const revision = ++draftRevision.current;
    setDraftStatus('saving');
    try {
      await saveSettingsDraft(current, applied);
      if (revision === draftRevision.current) setDraftStatus('saved');
      return true;
    } catch {
      if (revision === draftRevision.current) {
        setDraftStatus('error');
        setNotice({ text: '草稿暂存失败，请先保存设置再关闭弹窗。', error: true });
      }
      return false;
    }
  }, []);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...currentRef.current, ...patch };
      currentRef.current = next;
      editRevision.current++;
      setSettings(next);
      setNotice(null);
      void persistDraft(next, savedRef.current);
    },
    [persistDraft],
  );

  const applySettings = async (snapshot: Settings, successText: string) => {
    if (!ready || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    const revision = editRevision.current;
    try {
      const result = await saveSettings({
        ...snapshot,
        baseUrl: normalizeBaseUrl(snapshot.baseUrl),
      });
      savedRef.current = result;
      setSaved(result);
      // A pending save must never overwrite text entered while the storage write was in flight.
      if (revision === editRevision.current) {
        currentRef.current = result;
        setSettings(result);
      }
      const retained = await persistDraft(currentRef.current, result);
      if (retained && revision === editRevision.current) {
        setNotice({ text: successText });
      }
      return retained;
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : '保存失败，请重试。',
        error: true,
      });
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const save = () => applySettings(currentRef.current, '设置已保存，开始阅读吧。');
  const restore = (backup: BackupSettings) =>
    applySettings(
      {
        ...currentRef.current,
        ...backup,
        syncEnabled: currentRef.current.syncEnabled,
        syncApiKey: currentRef.current.syncApiKey,
      },
      '备份已恢复并保存，可以继续阅读。',
    );
  return {
    settings,
    saved,
    ready,
    saving,
    notice,
    update,
    save,
    restore,
    dirty: JSON.stringify(settings) !== JSON.stringify(saved),
    draftMessage:
      draftStatus === 'saving'
        ? '正在保留输入…'
        : draftStatus === 'error'
          ? '草稿暂存失败，请先保存设置。'
          : '输入已自动保留，保存后生效。',
  };
}
