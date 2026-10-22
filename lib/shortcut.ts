import type { Modifier, Shortcut } from './types';

const modifierCode = /^(Alt|Control|Shift|Meta)(Left|Right)$/;

export function isValidShortcut(value: unknown): value is Shortcut {
  if (!value || typeof value !== 'object') return false;
  const shortcut = value as Shortcut;
  return (
    Array.isArray(shortcut.modifiers) &&
    shortcut.modifiers.every((key) => ['Alt', 'Control', 'Meta', 'Shift'].includes(key)) &&
    new Set(shortcut.modifiers).size === shortcut.modifiers.length &&
    (shortcut.code === null
      ? shortcut.modifiers.length > 0
      : typeof shortcut.code === 'string' &&
        /^[A-Za-z][A-Za-z0-9]{0,29}$/.test(shortcut.code) &&
        !['Escape', 'Unidentified', 'Process'].includes(shortcut.code) &&
        !modifierCode.test(shortcut.code))
  );
}

export function matchesShortcut(
  event: Pick<MouseEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'> & { code?: string },
  shortcut: Shortcut,
  pressed: Set<string>,
) {
  const state: Record<Modifier, boolean> = {
    Alt: event.altKey,
    Control: event.ctrlKey,
    Meta: event.metaKey,
    Shift: event.shiftKey,
  };
  return (
    isValidShortcut(shortcut) &&
    (Object.keys(state) as Modifier[]).every(
      (key) => state[key] === shortcut.modifiers.includes(key),
    ) &&
    (!shortcut.code || pressed.has(shortcut.code)) &&
    (!event.code || (shortcut.code ? event.code === shortcut.code : modifierCode.test(event.code)))
  );
}

export function shortcutFromEvent(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'code'>,
): Shortcut | null {
  const modifiers: Modifier[] = [];
  if (event.ctrlKey) modifiers.push('Control');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (event.metaKey) modifiers.push('Meta');
  const code = modifierCode.test(event.code) ? null : event.code;
  const shortcut = { modifiers, code };
  return isValidShortcut(shortcut) ? shortcut : null;
}
