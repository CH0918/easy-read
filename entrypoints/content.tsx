import { createRoot, type Root } from 'react-dom/client';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { Reader } from '../components/Reader';
import { clampPanel, extractContext } from '../lib/context';
import { getPublicSettings } from '../lib/bridge';
import { matchesShortcut } from '../lib/shortcut';
import type { PublicSettings } from '../lib/types';
import '../styles/chat.css';

export default defineContentScript({
  matches: ['https://*/*', 'http://*/*'],
  cssInjectionMode: 'ui',
  runAt: 'document_idle',
  async main(ctx) {
    let settings: PublicSettings;
    try {
      settings = await getPublicSettings();
    } catch {
      return;
    }
    let root: Root | undefined;
    let positioner: HTMLDivElement | undefined;
    let activeRange: Range | undefined;
    let previousFocus: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | undefined;
    let armed = false;
    let sessionId = 0;
    const pressed = new Set<string>();
    const ui = await createShadowRootUi(ctx, {
      name: 'margin-reader',
      position: 'overlay',
      anchor: 'body',
      append: 'last',
      isolateEvents: [
        'keydown',
        'keyup',
        'keypress',
        'pointerdown',
        'pointerup',
        'mousedown',
        'mouseup',
      ],
      onMount(container) {
        positioner = document.createElement('div');
        positioner.dataset.marginRoot = '';
        Object.assign(positioner.style, { position: 'fixed', zIndex: '2147483647' });
        container.append(positioner);
        root = createRoot(positioner);
        resizeObserver = new ResizeObserver(reposition);
        resizeObserver.observe(positioner);
      },
      onRemove() {
        resizeObserver?.disconnect();
        root?.unmount();
        root = undefined;
        positioner = undefined;
      },
    });
    ui.shadowHost.style.setProperty('z-index', '2147483647', 'important');
    ui.shadowHost.style.setProperty('position', 'fixed', 'important');
    const inside = (event: Event) => event.composedPath().includes(ui.shadowHost);
    const editable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || !!target.closest('input,textarea,select,[role="textbox"]'));
    const editing = (event: Event) =>
      document.designMode === 'on' || event.composedPath().some(editable);

    function close() {
      activeRange = undefined;
      ui.remove();
      previousFocus?.focus({ preventScroll: true });
      previousFocus = null;
    }
    function reposition() {
      if (!positioner || !activeRange) return;
      if (!activeRange.startContainer.isConnected) {
        close();
        return;
      }
      const rect = activeRange.getBoundingClientRect();
      const { width, height } = positioner.getBoundingClientRect();
      const position = clampPanel(
        rect,
        width || 390,
        height || 340,
        window.innerWidth,
        window.innerHeight,
      );
      positioner.style.left = `${position.left}px`;
      positioner.style.top = `${position.top}px`;
    }
    function openSelection(trigger: 'keyboard' | 'pointer') {
      if (!settings.enabled) return false;
      const selection = window.getSelection();
      if (
        !selection ||
        selection.isCollapsed ||
        !selection.rangeCount ||
        !selection.toString().trim()
      )
        return false;
      const range = selection.getRangeAt(0).cloneRange();
      const parent = (node: Node) => (node instanceof Element ? node : node.parentElement);
      if (
        ui.shadow.contains(range.commonAncestorContainer) ||
        [range.startContainer, range.endContainer, range.commonAncestorContainer].some((node) =>
          parent(node)?.closest(
            'margin-reader,input,textarea,select,[contenteditable]:not([contenteditable="false"])',
          ),
        )
      )
        return false;
      const context = extractContext(range, settings.contextMode);
      if (!context.selection) return false;
      if (
        activeRange?.toString() === range.toString() &&
        activeRange.startContainer === range.startContainer &&
        activeRange.startOffset === range.startOffset
      )
        return true;
      activeRange = range;
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!root) ui.mount();
      root?.render(
        <Reader
          key={++sessionId}
          context={context}
          settings={settings}
          autoExplain={trigger === 'keyboard' || settings.autoExplain}
          onClose={close}
        />,
      );
      requestAnimationFrame(reposition);
      return true;
    }
    ctx.addEventListener(
      document,
      'pointerdown',
      (event: PointerEvent) => {
        if (!event.isTrusted) return;
        if (inside(event)) return;
        armed =
          settings.shortcut.modifiers.length > 0 &&
          !editing(event) &&
          matchesShortcut(event, settings.shortcut, pressed);
        if (!armed && activeRange) close();
      },
      { capture: true },
    );
    ctx.addEventListener(
      document,
      'pointerup',
      (event: PointerEvent) => {
        if (!event.isTrusted) return;
        if (inside(event) || editing(event)) return;
        const shouldOpen =
          armed ||
          (settings.shortcut.modifiers.length > 0 &&
            matchesShortcut(event, settings.shortcut, pressed));
        armed = false;
        if (shouldOpen) requestAnimationFrame(() => openSelection('pointer'));
      },
      { capture: true },
    );
    ctx.addEventListener(
      document,
      'keydown',
      (event: KeyboardEvent) => {
        if (!event.isTrusted) return;
        pressed.add(event.code);
        if (inside(event) || editing(event) || event.isComposing || event.keyCode === 229) return;
        if (
          event
            .composedPath()
            .some(
              (target) =>
                target instanceof Element && !!target.closest('button,a[href],[role="button"]'),
            )
        )
          return;
        if (event.key === 'Escape') {
          close();
          return;
        }
        if (
          !armed &&
          !event.repeat &&
          matchesShortcut(event, settings.shortcut, pressed) &&
          openSelection('keyboard')
        ) {
          // Claim Space before its default scroll, only when a readable selection opened the card.
          event.preventDefault();
          event.stopPropagation();
        }
      },
      { capture: true },
    );
    ctx.addEventListener(
      document,
      'keyup',
      (event: KeyboardEvent) => {
        pressed.delete(event.code);
      },
      { capture: true },
    );
    ctx.addEventListener(window, 'blur', () => {
      pressed.clear();
      armed = false;
    });
    ctx.addEventListener(window, 'resize', reposition);
    ctx.addEventListener(
      window,
      'scroll',
      (event) => {
        if (!inside(event)) reposition();
      },
      { capture: true },
    );
    const updateSettings = (message: { type?: string; settings?: PublicSettings }) => {
      if (message.type === 'settings:changed' && message.settings) {
        settings = message.settings;
        if (!settings.enabled) close();
      }
    };
    chrome.runtime.onMessage.addListener(updateSettings);
    ctx.onInvalidated(() => {
      close();
      chrome.runtime.onMessage.removeListener(updateSettings);
    });
  },
});
