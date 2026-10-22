import type { ContextMode, PageContext } from './types';

const EXCLUDED =
  'script,style,noscript,template,nav,header,footer,aside,form,input,textarea,select,button,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"],[data-margin-root],margin-reader';
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

function isReadable(element: Element, view: Window) {
  if (element.closest(EXCLUDED)) return false;
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = view.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
      return false;
  }
  return true;
}

function paragraphText(root: Element | undefined | null, doc: Document): string {
  if (!root) return '';
  const parts: string[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const view = doc.defaultView ?? window;
  let node: Node | null;
  let length = 0;
  let visited = 0;
  while ((node = walker.nextNode()) && length < 40000 && visited++ < 4000) {
    if (!node.parentElement || !isReadable(node.parentElement, view)) continue;
    const text = node.textContent ?? '';
    parts.push(text);
    length += text.length;
  }
  return clean(parts.join(' '));
}

export function safePageUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '';
  }
}

export function extractContext(
  range: Range,
  mode: ContextMode,
  doc: Document = document,
): PageContext {
  const selection = clean(range.toString()).slice(0, 6000);
  const parent =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement;
  const paragraphNode = parent?.closest('p,li,blockquote,pre,td,section,article') ?? parent;
  const rawParagraph = paragraphText(paragraphNode, doc) || selection;
  const index = rawParagraph.indexOf(selection);
  const start = Math.max(0, index - 1500);
  const paragraph = mode === 'selection' ? '' : rawParagraph.slice(start, start + 6000);
  const visible: string[] = [];
  if (mode === 'visible') {
    const root = doc.querySelector('main,article,[role="main"]') ?? doc.body;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const element = node.parentElement;
        if (!element || element.closest(EXCLUDED) || !node.textContent?.trim())
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const view = doc.defaultView ?? window;
    let node: Node | null;
    let length = 0;
    let visited = 0;
    while ((node = walker.nextNode()) && length < 12000 && visited++ < 12000) {
      const element = node.parentElement!;
      if (!isReadable(element, view)) continue;
      const textRange = doc.createRange();
      textRange.selectNodeContents(node);
      const inView = Array.from(textRange.getClientRects()).some(
        (rect) =>
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < view.innerHeight &&
          rect.right > 0 &&
          rect.left < view.innerWidth,
      );
      if (!inView) continue;
      const text = clean(node.textContent ?? '').slice(0, 12000 - length);
      visible.push(text);
      length += text.length + 1;
    }
  }
  return {
    title: doc.title.slice(0, 500),
    url: safePageUrl(doc.location.href),
    selection,
    paragraph,
    visibleText: visible.join('\n').slice(0, 12000),
  };
}

export function clampPanel(
  rect: Pick<DOMRect, 'left' | 'bottom' | 'top'>,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const gap = 12;
  const left = Math.max(gap, Math.min(rect.left, viewportWidth - width - gap));
  const below = rect.bottom + gap;
  const above = rect.top - height - gap;
  const top =
    below + height <= viewportHeight - gap
      ? below
      : above >= gap
        ? above
        : viewportHeight - height - gap;
  return { left, top: Math.max(gap, top) };
}
