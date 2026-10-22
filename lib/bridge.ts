import type { ChatRequest, PublicSettings, Result, StreamEvent } from './types';

export async function getPublicSettings(): Promise<PublicSettings> {
  const response: Result<PublicSettings> = await chrome.runtime.sendMessage({
    type: 'settings:get',
  });
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

export async function* streamFromBackground(
  request: ChatRequest,
  signal: AbortSignal,
): AsyncGenerator<string> {
  if (signal.aborted) return;
  const port = chrome.runtime.connect({ name: 'margin:chat' });
  const queue: StreamEvent[] = [];
  let wake: (() => void) | undefined;
  let finished = false;
  const notify = (event: StreamEvent) => {
    queue.push(event);
    wake?.();
  };
  port.onMessage.addListener((event: StreamEvent) => {
    if (event.type !== 'ping') notify(event);
  });
  port.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError;
    if (!finished)
      notify({
        type: 'error',
        message: error ? '扩展连接已断开，请刷新网页后重试。' : '连接已中断，请重试。',
      });
  });
  const cancel = () => {
    finished = true;
    port.disconnect();
    wake?.();
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    port.postMessage({ type: 'start', request });
    while (!signal.aborted) {
      if (!queue.length)
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      wake = undefined;
      while (queue.length) {
        const event = queue.shift()!;
        if (event.type === 'delta') yield event.text;
        if (event.type === 'error') throw new Error(event.message);
        if (event.type === 'done') return;
      }
    }
  } finally {
    finished = true;
    signal.removeEventListener('abort', cancel);
    port.disconnect();
  }
}
