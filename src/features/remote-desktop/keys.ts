// X11 keysyms the RFB protocol carries. ⌘ and ⌥ follow what Apple's screen sharing server expects from VNC clients.
export const SYM = {
  Enter: 0xff0d, Backspace: 0xff08, Tab: 0xff09, Escape: 0xff1b, Delete: 0xffff,
  Left: 0xff51, Up: 0xff52, Right: 0xff53, Down: 0xff54, Home: 0xff50, End: 0xff57, PageUp: 0xff55, PageDown: 0xff56,
  Shift: 0xffe1, Control: 0xffe3, Meta: 0xffe7, Alt: 0xffe9, Super: 0xffeb, Space: 0x20,
} as const;
export type Modifier = 'cmd' | 'opt' | 'ctrl' | 'shift';
export const MODIFIERS: readonly Modifier[] = ['ctrl', 'opt', 'cmd', 'shift'];
export type ModifierState = 'off' | 'once' | 'lock';
export type ModifierStates = Record<Modifier, ModifierState>;
export const NO_MODIFIERS: ModifierStates = { cmd: 'off', opt: 'off', ctrl: 'off', shift: 'off' };

export function modifierSym(mod: Modifier, cmdKey: 'meta' | 'super' | 'alt' = 'meta'): number {
  if (mod === 'ctrl') return SYM.Control;
  if (mod === 'shift') return SYM.Shift;
  const cmd = cmdKey === 'meta' ? SYM.Meta : cmdKey === 'super' ? SYM.Super : SYM.Alt;
  // When ⌘ takes the Alt keysym, ⌥ must take the one it displaced.
  return mod === 'cmd' ? cmd : cmdKey === 'alt' ? SYM.Meta : SYM.Alt;
}
export function activeModifiers(states: ModifierStates): Modifier[] {
  return MODIFIERS.filter(m => states[m] !== 'off');
}
/** Tap cycles off, next key only, locked, off. */
export function cycleModifier(state: ModifierState): ModifierState {
  return state === 'off' ? 'once' : state === 'once' ? 'lock' : 'off';
}
/** After a key or click: next-key-only modifiers drop, locked ones stay. */
export function releaseOneShot(states: ModifierStates): ModifierStates {
  const next = { ...states };
  for (const m of MODIFIERS) if (next[m] === 'once') next[m] = 'off';
  return next;
}

export interface Shortcut { label: string; sym: number; mods: Modifier[]; hint: string }
export const SHORTCUTS: readonly Shortcut[] = [
  { label: '⌘C', sym: 0x63, mods: ['cmd'], hint: '복사' },
  { label: '⌘V', sym: 0x76, mods: ['cmd'], hint: '붙여넣기' },
  { label: '⌘X', sym: 0x78, mods: ['cmd'], hint: '잘라내기' },
  { label: '⌘A', sym: 0x61, mods: ['cmd'], hint: '전체 선택' },
  { label: '⌘Z', sym: 0x7a, mods: ['cmd'], hint: '실행 취소' },
  { label: '⌘⇧Z', sym: 0x7a, mods: ['cmd', 'shift'], hint: '다시 실행' },
  { label: '⌘Tab', sym: SYM.Tab, mods: ['cmd'], hint: '앱 전환' },
  { label: '⌘Space', sym: SYM.Space, mods: ['cmd'], hint: 'Spotlight' },
  { label: '⌘W', sym: 0x77, mods: ['cmd'], hint: '창 닫기' },
  { label: '⌘T', sym: 0x74, mods: ['cmd'], hint: '새 탭' },
  { label: '⌘R', sym: 0x72, mods: ['cmd'], hint: '새로고침' },
  { label: '⌘L', sym: 0x6c, mods: ['cmd'], hint: '주소창' },
  { label: '⌘F', sym: 0x66, mods: ['cmd'], hint: '찾기' },
  { label: '⌘S', sym: 0x73, mods: ['cmd'], hint: '저장' },
  { label: '⌘Q', sym: 0x71, mods: ['cmd'], hint: '앱 종료' },
];
export const NAV_KEYS: readonly { label: string; aria: string; sym: number }[] = [
  { label: 'Esc', aria: 'Esc', sym: SYM.Escape },
  { label: 'Tab', aria: 'Tab', sym: SYM.Tab },
  { label: '←', aria: '왼쪽 방향키', sym: SYM.Left },
  { label: '↑', aria: '위쪽 방향키', sym: SYM.Up },
  { label: '↓', aria: '아래쪽 방향키', sym: SYM.Down },
  { label: '→', aria: '오른쪽 방향키', sym: SYM.Right },
  { label: '⌫', aria: '지우기', sym: SYM.Backspace },
  { label: '⌦', aria: '앞으로 지우기', sym: SYM.Delete },
  { label: '↵', aria: 'Enter', sym: SYM.Enter },
];

const NAMED: Record<string, number> = {
  Enter: SYM.Enter, Backspace: SYM.Backspace, Tab: SYM.Tab, Escape: SYM.Escape, Delete: SYM.Delete,
  ArrowLeft: SYM.Left, ArrowUp: SYM.Up, ArrowRight: SYM.Right, ArrowDown: SYM.Down,
  Home: SYM.Home, End: SYM.End, PageUp: SYM.PageUp, PageDown: SYM.PageDown,
};
export interface KeyLike { key: string; code?: string; altKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }
/**
 * Keysym for a hardware key press, or 0 when the browser should handle it as text.
 * Plain printable keys return 0 so the input element's own text path (and IME) sees them; combos are sent as keys.
 */
export function keySymForEvent(e: KeyLike): number {
  const named = NAMED[e.key];
  if (named) return named;
  if (Array.from(e.key).length !== 1) return 0;
  if (!(e.metaKey || e.ctrlKey || e.altKey)) return 0;
  // ⌥ turns letters into symbols like å, so identify the physical key instead.
  const letter = e.code?.match(/^Key([A-Z])$/)?.[1];
  const digit = e.code?.match(/^Digit([0-9])$/)?.[1];
  if (e.altKey && (letter || digit)) return (letter ? letter.toLowerCase() : digit!).codePointAt(0)!;
  const cp = e.key.codePointAt(0)!;
  return cp <= 255 ? e.key.toLowerCase().codePointAt(0)! : 0x1000000 | cp;
}
