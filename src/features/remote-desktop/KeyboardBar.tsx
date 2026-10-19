import { useEffect, useImperativeHandle, useRef } from 'react';
import type { Ref } from 'react';
import { Icon } from '../../ui/Icon';
import { MODIFIERS, NAV_KEYS, SHORTCUTS, SYM } from './keys';
import type { KeyLike, Modifier, ModifierStates, Shortcut } from './keys';

const MOD_LABEL: Record<Modifier, string> = { ctrl: '⌃ Ctrl', opt: '⌥ Option', cmd: '⌘ Cmd', shift: '⇧ Shift' };
const MOD_NAME: Record<Modifier, string> = { ctrl: 'Control', opt: 'Option', cmd: 'Command', shift: 'Shift' };
const STATE_LABEL = { off: '꺼짐', once: '다음 키에만 적용', lock: '고정' } as const;

export interface KeyboardBarHandle { focus: () => void; blur: () => void; isFocused: () => boolean }
interface Props {
  handleRef: Ref<KeyboardBarHandle>;
  disabled: boolean;
  mods: ModifierStates;
  onToggleMod: (mod: Modifier) => void;
  onText: (text: string) => void;
  onKey: (sym: number) => void;
  onShortcut: (shortcut: Shortcut) => void;
  /** Physical keyboard combos typed into the field. Returns true when the key was sent. */
  onHardwareKey: (e: KeyLike) => boolean;
  onPasteFromPhone: () => void;
  onClose: () => void;
}

/**
 * Typing goes straight to the Mac: committed characters are sent as soon as the input element has them.
 * While an IME is composing (Korean), the half-built syllable stays visible in the field and is sent when the IME commits it.
 */
export function KeyboardBar({ handleRef, disabled, mods, onToggleMod, onText, onKey, onShortcut, onHardwareKey, onPasteFromPhone, onClose }: Props) {
  const field = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false), pendingEnter = useRef(false);
  const live = useRef({ onText, onKey, disabled });
  useEffect(() => { live.current = { onText, onKey, disabled }; });
  useImperativeHandle(handleRef, () => ({
    focus: () => field.current?.focus({ preventScroll: true }),
    blur: () => field.current?.blur(),
    isFocused: () => document.activeElement === field.current,
  }), []);

  /** Send whatever the field holds. Idempotent, because the field is emptied each time. */
  function flush() {
    const el = field.current;
    if (!el || !el.value) return;
    const text = el.value; el.value = '';
    if (!live.current.disabled) live.current.onText(text);
  }
  function enter() { flush(); pendingEnter.current = false; if (!live.current.disabled) live.current.onKey(SYM.Enter); }
  function press(action: () => void) { flush(); composing.current = false; action(); }

  // Pressing a helper key must not pull focus out of the field, or the soft keyboard drops and the next typed key goes nowhere.
  return <div className="remote-keybar" role="group" aria-label="키보드 입력과 보조 키" onMouseDown={e => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }}>
    <div className="remote-keybar__input">
      <button type="button" className="remote-key remote-key--icon" aria-label="키보드 올리기·내리기" onClick={() => { if (document.activeElement === field.current) field.current?.blur(); else field.current?.focus({ preventScroll: true }); }}><Icon name="keyboard" /></button>
      <textarea ref={field} rows={1} aria-label="Mac에 입력할 글" placeholder="여기에 입력"
        autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="enter"
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; setTimeout(() => { flush(); if (pendingEnter.current) enter(); }, 0); }}
        onBeforeInput={e => {
          const type = (e.nativeEvent as InputEvent).inputType;
          // Predictive-text replacements would re-insert a word we already sent.
          if (type === 'insertReplacementText') { e.preventDefault(); return; }
          if (composing.current || (e.nativeEvent as InputEvent).isComposing) return;
          if (type === 'deleteContentBackward') { e.preventDefault(); flush(); onKey(SYM.Backspace); }
          else if (type === 'deleteContentForward') { e.preventDefault(); flush(); onKey(SYM.Delete); }
          else if (type === 'insertLineBreak' || type === 'insertParagraph') { e.preventDefault(); enter(); }
        }}
        onInput={e => { if (!composing.current && !(e.nativeEvent as InputEvent).isComposing) flush(); }}
        onKeyDown={e => {
          const key = e.key;
          if (e.nativeEvent.isComposing || key === 'Process') {
            if (key === 'Enter') { pendingEnter.current = true; setTimeout(() => { if (pendingEnter.current && !composing.current) enter(); }, 300); }
            return;
          }
          const plain = !(e.metaKey || e.ctrlKey || e.altKey);
          if (key === 'Enter' && plain) { e.preventDefault(); enter(); return; }
          if (key === 'Backspace' && plain) { e.preventDefault(); flush(); onKey(SYM.Backspace); return; }
          flush();
          if (onHardwareKey(e)) e.preventDefault();
        }}
        onBlur={() => { if (!composing.current) flush(); }} />
      <button type="button" className="remote-key remote-key--icon" aria-label="아이폰 클립보드의 글 붙여넣기" onClick={() => press(onPasteFromPhone)}><Icon name="copy" /></button>
      <button type="button" className="remote-key remote-key--icon" aria-label="키보드 줄 닫기" onClick={onClose}><Icon name="x" /></button>
    </div>
    <div className="remote-keys" role="toolbar" aria-label="보조 키">
      {MODIFIERS.map(m => <button key={m} type="button" className="remote-key remote-key--mod" aria-pressed={mods[m] !== 'off'} data-lock={mods[m] === 'lock' || undefined}
        aria-label={`${MOD_NAME[m]} 키, ${STATE_LABEL[mods[m]]}`} onClick={() => press(() => onToggleMod(m))}>{MOD_LABEL[m]}{mods[m] === 'lock' ? ' 🔒' : ''}</button>)}
      <span className="remote-keys__divider" aria-hidden="true" />
      {NAV_KEYS.map(k => <button key={k.aria} type="button" className="remote-key" aria-label={k.aria} disabled={disabled} onClick={() => press(() => onKey(k.sym))}>{k.label}</button>)}
      <span className="remote-keys__divider" aria-hidden="true" />
      {SHORTCUTS.map(s => <button key={s.label} type="button" className="remote-key" aria-label={`${s.label} ${s.hint}`} disabled={disabled} onClick={() => press(() => onShortcut(s))}>{s.label}</button>)}
    </div>
  </div>;
}
