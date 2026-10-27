import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
  Zap,
} from 'lucide-react';
import { PROVIDERS, REASONING_EFFORT_OPTIONS, isLocalUrl } from '../lib/settings';
import { normalizeBaseUrl } from '../lib/api';
import { inExtension } from '../lib/storage';
import type { Result, Settings } from '../lib/types';
import { Button } from './ui';

const connectionFingerprint = (settings: Settings) =>
  JSON.stringify([
    settings.baseUrl,
    settings.apiKey,
    settings.model,
    settings.provider,
    settings.reasoningEffort,
  ]);

export function ConnectionForm({
  settings,
  update,
  compact = false,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  compact?: boolean;
}) {
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [modelError, setModelError] = useState('');
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ text: string; ok: boolean } | null>(null);
  const requestId = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const provider = PROVIDERS.find((p) => p.id === settings.provider);

  const discover = useCallback(async () => {
    const id = ++requestId.current;
    setModelError('');
    setDiscovering(true);
    const config = settingsRef.current;
    try {
      normalizeBaseUrl(config.baseUrl);
      if (!inExtension()) throw new Error('这是界面预览。请加载 Chrome 扩展后检测模型。');
      const response: Result<string[]> = await chrome.runtime.sendMessage({
        type: 'models:discover',
        config: { baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model },
      });
      if (id !== requestId.current) return;
      if (!response.ok) throw new Error(response.error);
      setModels(response.data);
      if (!settingsRef.current.model) {
        const preferred =
          response.data.find((m) => /^(deepseek-chat|gpt-.*mini|llama)/i.test(m)) ??
          response.data[0];
        if (preferred) update({ model: preferred });
      }
    } catch (error) {
      if (id === requestId.current)
        setModelError(error instanceof Error ? error.message : '模型检测失败，可手动填写模型 ID。');
    } finally {
      if (id === requestId.current) setDiscovering(false);
    }
  }, [update]);

  useEffect(() => {
    ++requestId.current;
    setModels([]);
    setModelError('');
    setTestResult(null);
    setDiscovering(false);
    if (!settings.apiKey && !isLocalUrl(settings.baseUrl)) return;
    const timer = setTimeout(() => void discover(), 1000);
    return () => {
      clearTimeout(timer);
      ++requestId.current;
    };
  }, [settings.apiKey, settings.baseUrl, discover]);

  useEffect(() => {
    setTestResult(null);
  }, [settings.model, settings.provider, settings.reasoningEffort]);

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    const fingerprint = connectionFingerprint(settings);
    try {
      if (!inExtension()) throw new Error('请在已加载的 Chrome 扩展中测试连接。');
      const response: Result<number> = await chrome.runtime.sendMessage({
        type: 'connection:test',
        config: {
          baseUrl: settings.baseUrl,
          apiKey: settings.apiKey,
          model: settings.model,
          provider: settings.provider,
          reasoningEffort: settings.reasoningEffort,
        },
      });
      const current = settingsRef.current;
      if (fingerprint !== connectionFingerprint(current)) return;
      if (!response.ok) throw new Error(response.error);
      setTestResult({ text: `连接成功 · ${(response.data / 1000).toFixed(1)} 秒`, ok: true });
    } catch (error) {
      if (fingerprint !== connectionFingerprint(settingsRef.current)) return;
      setTestResult({ text: error instanceof Error ? error.message : '连接失败', ok: false });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={`connection-form ${compact ? 'compact' : ''}`}>
      <div className="field">
        <label htmlFor="provider">AI 服务商</label>
        <div className="select-wrap">
          <span className="provider-mark">{provider?.mark ?? '⌘'}</span>
          <select
            id="provider"
            value={settings.provider}
            onChange={(event) => {
              const next = PROVIDERS.find((p) => p.id === event.target.value)!;
              update({
                provider: next.id,
                baseUrl: settings.baseUrl || next.baseUrl,
              });
            }}
          >
            {PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {!compact ? ` · ${item.description}` : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={16} />
        </div>
      </div>
      <div className="field">
        <div className="label-row">
          <label htmlFor="base-url">Base URL</label>
          {provider?.baseUrl && settings.baseUrl !== provider.baseUrl ? (
            <button
              type="button"
              className="text-button"
              onClick={() => update({ baseUrl: provider.baseUrl })}
            >
              使用默认地址
            </button>
          ) : (
            <span>兼容 OpenAI API</span>
          )}
        </div>
        <input
          id="base-url"
          type="url"
          spellCheck={false}
          value={settings.baseUrl}
          placeholder="https://api.example.com/v1"
          onChange={(event) => update({ baseUrl: event.target.value })}
        />
        {!compact && (
          <p className="field-hint">
            支持官方接口或自己的代理服务。切换选项会保留已填写的地址和密钥。
          </p>
        )}
      </div>
      <div className="field">
        <div className="label-row">
          <label htmlFor="api-key">
            API Key {isLocalUrl(settings.baseUrl) && <span className="muted">（可选）</span>}
          </label>
          <span className="key-location">
            <ShieldCheck size={12} />
            {settings.syncEnabled && settings.syncApiKey ? '随 Chrome 同步' : '仅保存在本机'}
          </span>
        </div>
        <div className="input-with-icon">
          <KeyRound size={16} />
          <input
            id="api-key"
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            placeholder="输入你的 API Key"
            value={settings.apiKey}
            onChange={(event) => update({ apiKey: event.target.value })}
          />
          <button
            className="icon-button"
            type="button"
            onClick={() => setShowKey((value) => !value)}
            aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
          >
            {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        {!compact && (
          <p className="field-hint">密钥只用于连接你选择的 AI 服务，Margin 不设中转服务器。</p>
        )}
      </div>
      <div className="field model-field">
        <div className="label-row">
          <label htmlFor="model">阅读模型</label>
          <button
            type="button"
            className="text-button"
            disabled={discovering || (!settings.apiKey && !isLocalUrl(settings.baseUrl))}
            onClick={() => void discover()}
          >
            <RefreshCw size={12} className={discovering ? 'spin' : ''} />
            {discovering ? '正在检测' : '重新检测'}
          </button>
        </div>
        <div className="model-input">
          <input
            id="model"
            value={settings.model}
            placeholder={discovering ? '正在获取可用模型…' : '自动检测，或手动输入模型 ID'}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => update({ model: event.target.value })}
          />
          <button
            type="button"
            className="icon-button"
            aria-label="选择模型"
            aria-expanded={pickerOpen}
            disabled={!models.length}
            onClick={() => setPickerOpen((value) => !value)}
          >
            <ChevronDown size={16} />
          </button>
        </div>
        {pickerOpen && models.length > 0 && (
          <div className="model-picker">
            <div className="model-search">
              <Search size={15} />
              <input
                aria-label="搜索模型"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索可用模型…"
                autoFocus
              />
            </div>
            <div className="model-list">
              {models
                .filter((m) => m.toLowerCase().includes(search.toLowerCase()))
                .map((model) => (
                  <button
                    type="button"
                    key={model}
                    className={settings.model === model ? 'selected' : ''}
                    onClick={() => {
                      update({ model });
                      setPickerOpen(false);
                      setSearch('');
                    }}
                  >
                    <span>{model}</span>
                    {settings.model === model && <Check size={14} />}
                  </button>
                ))}
              {!models.some((m) => m.toLowerCase().includes(search.toLowerCase())) && (
                <p className="field-hint">没有匹配的模型，可在上方手动填写。</p>
              )}
            </div>
          </div>
        )}
        {modelError ? (
          <p className="field-error" role="status">
            {modelError}
          </p>
        ) : (
          <p className="field-hint">
            {models.length
              ? `已发现 ${models.length} 个模型。列表由服务商提供，可用性以连接测试为准。`
              : '填写地址和密钥后，将自动获取所有可用模型。'}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="reasoning-effort">思考强度</label>
        <select
          id="reasoning-effort"
          aria-describedby="reasoning-effort-hint"
          value={settings.reasoningEffort}
          onChange={(event) =>
            update({ reasoningEffort: event.target.value as Settings['reasoningEffort'] })
          }
        >
          {REASONING_EFFORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="field-hint" id="reasoning-effort-hint">
          强度越高通常耗时越长。部分模型不支持关闭或所有档位；不确定时选默认，可用“测试连接”检查。
        </p>
      </div>
      <div className="connection-footer">
        <Button
          variant="secondary"
          loading={testing}
          onClick={() => void test()}
          disabled={!settings.model || (!settings.apiKey && !isLocalUrl(settings.baseUrl))}
        >
          <Zap size={15} />
          测试连接
        </Button>
        <span className={`connection-status ${testResult?.ok ? 'success' : ''}`} role="status">
          {testing ? (
            <>
              <LoaderCircle size={13} className="spin" />
              正在向模型发送测试请求
            </>
          ) : testResult ? (
            <>
              {testResult.ok ? <Check size={14} /> : <Unplug size={14} />}
              {testResult.text}
            </>
          ) : (
            <>
              <span className="status-dot" />
              尚未测试连接
            </>
          )}
        </span>
      </div>
    </div>
  );
}
