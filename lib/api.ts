import type { ConnectionConfig } from './types';
import { reasoningParameters } from './reasoning';

export function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('请输入完整的 Base URL，例如 https://api.example.com/v1');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Base URL 请使用 HTTP 或 HTTPS 地址。');
  }
  if (url.username || url.password || url.search || url.hash)
    throw new Error('Base URL 不能包含用户名、密码、查询参数或锚点。');
  url.pathname = url.pathname.replace(/\/(chat\/completions|models)\/?$/, '').replace(/\/+$/, '');
  if (!url.pathname || url.pathname === '/') url.pathname = '/v1';
  return url.href.replace(/\/$/, '');
}

export function safeError(error: unknown, key = ''): string {
  let message = error instanceof Error ? error.message : '发生了未知错误，请重试。';
  if (key) message = message.split(key).join('[已隐藏密钥]');
  if (/fetch|network|Load failed/i.test(message))
    message = '无法连接 AI 服务，请检查 Base URL、网络连接和服务是否已启动。';
  if (/timeout|timed out/i.test(message))
    message = '服务响应超时，请稍后重试，或换一个响应更快的模型。';
  return message.slice(0, 300);
}

async function request(
  config: ConnectionConfig,
  path: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const signal = AbortSignal.any([
    ...(init.signal ? [init.signal] : []),
    AbortSignal.timeout(timeoutMs),
  ]);
  const response = await fetch(`${baseUrl}/${path}`, {
    ...init,
    credentials: 'omit',
    redirect: 'error',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
  });
  if (!response.ok) {
    if (
      path === 'chat/completions' &&
      [400, 422].includes(response.status) &&
      config.reasoningEffort &&
      config.reasoningEffort !== 'default'
    ) {
      throw new Error(
        '服务拒绝了请求参数，请检查模型及思考强度。部分模型不支持关闭思考或所选档位，可改为“跟随模型默认”后重新测试。',
      );
    }
    const known: Record<number, string> = {
      401: 'API Key 无效或已过期，请检查后重试。',
      403: '没有访问权限，请确认密钥、模型权限或本地服务的跨域设置。',
      404: '接口或模型不存在，请检查 Base URL 和模型名称。',
      429: '请求过于频繁或账户余额不足，请稍后重试。',
    };
    throw new Error(known[response.status] ?? `AI 服务返回 HTTP ${response.status}，请稍后重试。`);
  }
  return response;
}

export async function discoverModels(
  config: ConnectionConfig,
  signal?: AbortSignal,
): Promise<string[]> {
  const response = await request(config, 'models', { method: 'GET', signal }, 20000);
  const payload = await response.json();
  if (!Array.isArray(payload.data))
    throw new Error('这个接口没有返回兼容的模型列表。可以手动填写模型 ID。');
  const models = [
    ...new Set<string>(
      payload.data
        .map((m: { id?: unknown }) => m?.id)
        .filter(
          (id: unknown): id is string =>
            typeof id === 'string' && id.length > 0 && id.length <= 200,
        ),
    ),
  ].sort();
  if (!models.length) throw new Error('服务没有返回可用模型。请检查权限，或手动填写模型 ID。');
  return models;
}

interface CompletionChunk {
  error?: { message?: string };
  choices?: {
    delta?: { content?: string; refusal?: string };
    message?: { content?: string };
    finish_reason?: string | null;
  }[];
}

/** SSE frames may split anywhere, including inside CRLF sequences and multibyte UTF-8 text. */
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n');
        if (data) yield data;
      }
      if (buffer.length > 1_000_000) throw new Error('服务返回的数据过大，请换一个模型重试。');
      if (done) break;
    }
    const tail = buffer
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (tail) yield tail;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function* streamCompletion(
  config: ConnectionConfig,
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  if (!config.model) throw new Error('请先在设置中选择一个模型。');
  const response = await request(
    config,
    'chat/completions',
    {
      method: 'POST',
      signal,
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        ...reasoningParameters(config),
      }),
    },
    120000,
  );
  if (response.headers.get('content-type')?.includes('application/json')) {
    const data: CompletionChunk = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('模型没有返回文字回答，请尝试其他聊天模型。');
    yield text;
    return;
  }
  if (!response.body) throw new Error('服务没有返回可读取的响应。');
  let hasText = false;
  let completed = false;
  for await (const frame of readSSE(response.body)) {
    if (frame.trim() === '[DONE]') {
      completed = true;
      break;
    }
    let chunk: CompletionChunk;
    try {
      chunk = JSON.parse(frame);
    } catch {
      throw new Error('流式响应格式无效，请确认接口兼容 OpenAI Chat Completions。');
    }
    if (chunk.error)
      throw new Error(
        safeError(new Error(chunk.error.message || 'AI 服务返回了错误。'), config.apiKey),
      );
    const choice = chunk.choices?.[0];
    const text = choice?.delta?.content ?? choice?.delta?.refusal;
    if (typeof text === 'string' && text) {
      hasText = true;
      yield text;
    }
    if (choice?.finish_reason) completed = true;
  }
  if (!hasText) throw new Error('模型没有返回文字回答，请尝试其他聊天模型。');
  if (!completed) throw new Error('连接提前中断，回答可能不完整。请点击重试。');
}

export async function testConnection(config: ConnectionConfig): Promise<number> {
  const start = Date.now();
  const controller = new AbortController();
  try {
    for await (const _text of streamCompletion(
      config,
      [{ role: 'user', content: 'Reply with only OK.' }],
      controller.signal,
    )) {
      return Date.now() - start;
    }
    throw new Error('模型没有返回有效响应。');
  } finally {
    controller.abort();
  }
}
