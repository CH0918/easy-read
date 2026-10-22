export type Modifier = 'Alt' | 'Control' | 'Meta' | 'Shift';
export type Shortcut = { modifiers: Modifier[]; code: string | null };
export type ContextMode = 'visible' | 'paragraph' | 'selection';
export interface Settings {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  shortcut: Shortcut;
  language: 'zh-CN' | 'zh-TW' | 'en';
  contextMode: ContextMode;
  answerStyle: 'concise' | 'detailed';
  autoExplain: boolean;
  syncEnabled: boolean;
  syncApiKey: boolean;
}
export type PublicSettings = Omit<Settings, 'apiKey' | 'baseUrl' | 'syncApiKey' | 'syncEnabled'> & {
  configured: boolean;
};
export interface PageContext {
  title: string;
  url: string;
  selection: string;
  paragraph: string;
  visibleText: string;
}
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface ChatRequest {
  context: PageContext;
  messages: ChatMessage[];
}
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
  | { type: 'ping' };
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type ConnectionConfig = Pick<Settings, 'baseUrl' | 'apiKey' | 'model'>;
