import { defineBackground } from 'wxt/utils/define-background';
import { discoverModels, safeError, streamCompletion, testConnection } from '../lib/api';
import { buildMessages } from '../lib/prompt';
import { loadSettings, protectStorage, watchSettings } from '../lib/storage';
import { isConfigured, publicSettings } from '../lib/settings';
import type { ChatRequest, ConnectionConfig, StreamEvent } from '../lib/types';

export default defineBackground(() => {
  const storageReady = protectStorage();
  const trusted = (sender: chrome.runtime.MessageSender) =>
    [chrome.runtime.getURL('options.html'), chrome.runtime.getURL('popup.html')].includes(
      sender.url ?? '',
    );
  let broadcastTimer: ReturnType<typeof setTimeout>;
  watchSettings(() => {
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(() => {
      void (async () => {
        const settings = publicSettings(await loadSettings());
        const tabs = await chrome.tabs.query({});
        await Promise.allSettled(
          tabs
            .filter((tab) => tab.id)
            .map((tab) => chrome.tabs.sendMessage(tab.id!, { type: 'settings:changed', settings })),
        );
      })().catch(() => {});
    }, 150);
  });

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return false;
    const handle = async () => {
      await storageReady;
      if (message?.type === 'settings:get') return publicSettings(await loadSettings());
      if (message?.type === 'options:open') {
        await chrome.runtime.openOptionsPage();
        return null;
      }
      // A content script can never choose a URL, send a key, or ask the background to probe endpoints.
      if (!trusted(sender)) throw new Error('此操作只能从 Margin 设置页面发起。');
      const config = message.config as ConnectionConfig;
      if (message.type === 'models:discover') return discoverModels(config);
      if (message.type === 'connection:test') return testConnection(config);
      throw new Error('未知请求。');
    };
    void handle().then(
      (data) => respond({ ok: true, data }),
      (error) => respond({ ok: false, error: safeError(error) }),
    );
    return true;
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'margin:chat' || port.sender?.id !== chrome.runtime.id) return;
    const controller = new AbortController();
    let started = false;
    let closed = false;
    const send = (event: StreamEvent) => {
      if (!closed) {
        try {
          port.postMessage(event);
        } catch {
          controller.abort();
        }
      }
    };
    const heartbeat = setInterval(() => send({ type: 'ping' }), 15000);
    const cleanup = () => {
      closed = true;
      clearInterval(heartbeat);
      controller.abort();
    };
    port.onDisconnect.addListener(cleanup);
    port.onMessage.addListener((message: { type: string; request?: ChatRequest }) => {
      if (message.type === 'cancel') {
        cleanup();
        return;
      }
      if (started || message.type !== 'start') return;
      started = true;
      void (async () => {
        let key = '';
        try {
          await storageReady;
          const settings = await loadSettings();
          key = settings.apiKey;
          if (!settings.enabled) throw new Error('Margin 已暂停，请在插件中重新开启。');
          if (!isConfigured(settings)) throw new Error('请先在插件设置中填写 API Key 并选择模型。');
          const request = message.request;
          if (
            !request?.context?.selection ||
            !Array.isArray(request.messages) ||
            !request.messages.length ||
            request.messages.length > 100
          )
            throw new Error('选中文字或问题无效，请重新划词。');
          const messages = buildMessages(settings, request.context, request.messages);
          for await (const text of streamCompletion(settings, messages, controller.signal))
            send({ type: 'delta', text });
          send({ type: 'done' });
        } catch (error) {
          if (!controller.signal.aborted) send({ type: 'error', message: safeError(error, key) });
        } finally {
          clearInterval(heartbeat);
        }
      })();
    });
  });
});
