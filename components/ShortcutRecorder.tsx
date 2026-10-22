import { useRef, useState } from 'react';
import { Keyboard } from 'lucide-react';
import { DEFAULT_SETTINGS, shortcutLabel } from '../lib/settings';
import { shortcutFromEvent } from '../lib/shortcut';
import type { Shortcut } from '../lib/types';

export function ShortcutRecorder({
  value,
  onChange,
}: {
  value: Shortcut;
  onChange: (value: Shortcut) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [candidate, setCandidate] = useState<Shortcut | null>(null);
  const held = useRef(new Set<string>());
  const pending = useRef<Shortcut | null>(null);

  const finish = () => {
    held.current.clear();
    pending.current = null;
    setCandidate(null);
    setRecording(false);
  };

  return (
    <div className="shortcut-controls">
      <button
        type="button"
        className={`shortcut-button ${recording ? 'recording' : ''}`}
        aria-label="设置划词快捷键"
        aria-pressed={recording}
        onClick={() => {
          if (recording) return;
          held.current.clear();
          pending.current = null;
          setCandidate(null);
          setRecording(true);
        }}
        onBlur={finish}
        onKeyDown={(event) => {
          if (!recording) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === 'Escape') {
            finish();
            return;
          }
          if (event.repeat || event.nativeEvent.isComposing) return;
          held.current.add(event.code);
          const next = shortcutFromEvent(event.nativeEvent);
          if (next) {
            const code = next.code ?? pending.current?.code ?? null;
            pending.current = { ...next, code };
            setCandidate(pending.current);
          }
        }}
        onKeyUp={(event) => {
          if (!recording) return;
          // Suppress the button's native Space/Enter click so it cannot restart recording.
          event.preventDefault();
          event.stopPropagation();
          held.current.delete(event.code);
          if (!held.current.size && pending.current) {
            onChange(pending.current);
            finish();
          }
        }}
      >
        {recording
          ? candidate
            ? `${shortcutLabel(candidate)} · 松开确认`
            : '按下快捷键…'
          : shortcutLabel(value)}
        <Keyboard size={14} />
      </button>
      <button
        type="button"
        className="text-button"
        onClick={() => onChange(DEFAULT_SETTINGS.shortcut)}
      >
        恢复为空格
      </button>
    </div>
  );
}
