import { useEffect, useRef } from 'react';
import { useComposerRuntime, useThreadRuntime } from '@assistant-ui/react';

/** Keep the browser in charge of IME text; assistant-ui still owns sending and history. */
export function ReaderInput() {
  const composer = useComposerRuntime();
  const thread = useThreadRuntime();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const syncText = () => {
      const { text } = composer.getState();
      // Never replace a live IME composition or move the caret on ordinary keystrokes.
      if (!composing.current && input.value !== text) input.value = text;
    };
    syncText();
    input.focus({ preventScroll: true });
    return composer.subscribe(syncText);
  }, [composer]);

  return (
    <textarea
      ref={inputRef}
      name="input"
      className="margin-input"
      defaultValue={composer.getState().text}
      placeholder="问问这句话，或继续追问…"
      aria-label="向 Margin 提问"
      rows={2}
      onInput={(event) => composer.setText(event.currentTarget.value)}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        composer.setText(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (
          composing.current ||
          event.nativeEvent.isComposing ||
          event.nativeEvent.keyCode === 229
        ) {
          // Enter/Escape belong to the IME while the user is choosing characters.
          event.stopPropagation();
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey && !thread.getState().isRunning) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }}
    />
  );
}
