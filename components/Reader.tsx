import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { ArrowDown, ArrowUp, Copy, ExternalLink, RotateCcw, Sparkles, Square } from 'lucide-react';
import { streamFromBackground } from '../lib/bridge';
import { QUICK_EXPLAIN_PROMPT } from '../lib/prompt';
import type { PageContext, PublicSettings } from '../lib/types';
import { ReaderInput } from './ReaderInput';

function ReaderViewport({ children }: { children: ReactNode }) {
  const userMessageCount = useAuiState(
    (state) => state.thread.messages.filter((message) => message.role === 'user').length,
  );
  const viewport = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // Wait for the new message to mount; runStart can fire before React sees the new count.
    if (userMessageCount > 1) {
      viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: 'instant' });
    }
  }, [userMessageCount]);

  return (
    <ThreadPrimitive.Viewport
      ref={viewport}
      className="margin-viewport"
      autoScroll={userMessageCount > 1}
      scrollToBottomOnRunStart={false}
      scrollToBottomOnInitialize={false}
      scrollToBottomOnThreadSwitch={false}
    >
      {children}
    </ThreadPrimitive.Viewport>
  );
}

function Markdown() {
  return (
    <MarkdownTextPrimitive
      className="margin-markdown"
      components={{
        // Never request images embedded in an AI response (tracking URLs can contain page content).
        img: () => null,
        a: ({ href, children }) =>
          href && /^https?:\/\//i.test(href) ? (
            <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
              {children}
            </a>
          ) : (
            <span>{children}</span>
          ),
      }}
    />
  );
}

function UserMessage() {
  return (
    <AuiIf condition={(state) => !state.message.metadata.custom?.marginAutoExplain}>
      <MessagePrimitive.Root className="margin-user-message">
        <MessagePrimitive.Parts />
      </MessagePrimitive.Root>
    </AuiIf>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="margin-assistant-message">
      <div className="margin-message-content">
        <MessagePrimitive.Parts components={{ Text: Markdown }} />
        <AuiIf
          condition={(state) =>
            state.message.status?.type === 'running' && state.message.content.length === 0
          }
        >
          <div className="margin-thinking">
            正在结合上下文理解<span>…</span>
          </div>
        </AuiIf>
      </div>
      <MessagePrimitive.Error>
        <ErrorPrimitive.Root className="margin-error">
          <ErrorPrimitive.Message />
        </ErrorPrimitive.Root>
      </MessagePrimitive.Error>
      <ActionBarPrimitive.Root className="margin-actions">
        <ActionBarPrimitive.Copy
          className="margin-icon-button"
          title="复制回答"
          aria-label="复制回答"
        >
          <Copy size={13} />
        </ActionBarPrimitive.Copy>
        <ActionBarPrimitive.Reload
          className="margin-icon-button"
          title="重新生成"
          aria-label="重新生成"
        >
          <RotateCcw size={13} />
        </ActionBarPrimitive.Reload>
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

export function Reader({
  context,
  settings,
  autoExplain = settings.autoExplain,
  onClose,
}: {
  context: PageContext;
  settings: PublicSettings;
  autoExplain?: boolean;
  onClose: () => void;
}) {
  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      async *run({ messages, abortSignal }) {
        let text = '';
        const history = messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
              .filter((part) => part.type === 'text')
              .map((part) => part.text)
              .join('\n'),
          }));
        for await (const delta of streamFromBackground(
          { context, messages: history },
          abortSignal,
        )) {
          text += delta;
          yield { content: [{ type: 'text' as const, text }] };
        }
      },
    }),
    [context],
  );
  const runtime = useLocalRuntime(adapter);
  const initialized = useRef(false);
  useEffect(() => {
    if (autoExplain && settings.configured && !initialized.current) {
      initialized.current = true;
      runtime.thread.append({
        role: 'user',
        content: [{ type: 'text', text: QUICK_EXPLAIN_PROMPT }],
        metadata: { custom: { marginAutoExplain: true } },
      });
    }
    return () => runtime.thread.cancelRun();
  }, [runtime, autoExplain, settings.configured]);
  const openSettings = () => void chrome.runtime.sendMessage({ type: 'options:open' });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div
        className="margin-reader"
        role="dialog"
        aria-label="Margin 页边阅读助手"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="margin-selection">
          <blockquote aria-label="选中原文">{context.selection}</blockquote>
        </div>
        <ThreadPrimitive.Root className="margin-thread">
          <ReaderViewport>
            <AuiIf condition={(state) => state.thread.isEmpty}>
              {!settings.configured && (
                <div className="margin-setup">
                  <button className="margin-setup-button" type="button" onClick={openSettings}>
                    配置 AI 后开始提问
                    <ExternalLink size={13} />
                  </button>
                </div>
              )}
            </AuiIf>
            <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
            <ThreadPrimitive.ScrollToBottom
              className="margin-scroll-bottom"
              aria-label="滚动到最新回答"
            >
              <ArrowDown size={14} />
            </ThreadPrimitive.ScrollToBottom>
          </ReaderViewport>
          {settings.configured && (
            <div className="margin-composer-wrap">
              <div className="margin-suggestions" role="group" aria-label="快捷提问">
                <ThreadPrimitive.Suggestion prompt="请结合上下文，解释选中文字的含义。" send>
                  <Sparkles size={12} />
                  解释含义
                </ThreadPrimitive.Suggestion>
                <ThreadPrimitive.Suggestion
                  prompt="请拆解选中文字的语法和句子结构，帮助我理解。"
                  send
                >
                  拆解句子
                </ThreadPrimitive.Suggestion>
                <ThreadPrimitive.Suggestion
                  prompt="请自然地翻译选中文字，注意它在当前文章中的含义。"
                  send
                >
                  自然翻译
                </ThreadPrimitive.Suggestion>
              </div>
              <ComposerPrimitive.Root className="margin-composer">
                <ReaderInput />
                <div className="margin-composer-bottom">
                  <span>
                    <Sparkles size={11} />
                    {settings.model}
                  </span>
                  <AuiIf condition={(state) => !state.thread.isRunning}>
                    <ComposerPrimitive.Send className="margin-send" aria-label="发送问题">
                      <ArrowUp size={16} />
                    </ComposerPrimitive.Send>
                  </AuiIf>
                  <AuiIf condition={(state) => state.thread.isRunning}>
                    <ComposerPrimitive.Cancel className="margin-send" aria-label="停止生成">
                      <Square size={12} fill="currentColor" />
                    </ComposerPrimitive.Cancel>
                  </AuiIf>
                </div>
              </ComposerPrimitive.Root>
            </div>
          )}
        </ThreadPrimitive.Root>
      </div>
    </AssistantRuntimeProvider>
  );
}
