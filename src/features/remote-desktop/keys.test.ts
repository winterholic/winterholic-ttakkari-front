import { describe, expect, it } from 'vitest';
import { NO_MODIFIERS, SHORTCUTS, SYM, activeModifiers, cycleModifier, keySymForEvent, modifierSym, releaseOneShot } from './keys';

describe('modifier keysyms', () => {
  it('maps the four Mac modifiers to X11 keysyms', () => {
    expect([modifierSym('ctrl'), modifierSym('opt'), modifierSym('cmd'), modifierSym('shift')]).toEqual([0xffe3, 0xffe9, 0xffe7, 0xffe1]);
  });
  it('swaps Alt and Meta together when the server wants Command on Alt', () => {
    expect(modifierSym('cmd', 'alt')).toBe(SYM.Alt);
    expect(modifierSym('opt', 'alt')).toBe(SYM.Meta);
    expect(modifierSym('cmd', 'super')).toBe(SYM.Super);
    expect(modifierSym('opt', 'super')).toBe(SYM.Alt);
  });
});

describe('modifier chips', () => {
  it('cycle off, next key only, locked, off', () => {
    expect(cycleModifier('off')).toBe('once');
    expect(cycleModifier('once')).toBe('lock');
    expect(cycleModifier('lock')).toBe('off');
  });
  it('drop next-key-only chips after a key but keep locked ones', () => {
    const next = releaseOneShot({ ...NO_MODIFIERS, cmd: 'once', shift: 'lock', ctrl: 'once' });
    expect(next).toEqual({ ...NO_MODIFIERS, shift: 'lock' });
    expect(activeModifiers(next)).toEqual(['shift']);
  });
});

describe('shortcuts', () => {
  const find = (label: string) => SHORTCUTS.find(s => s.label === label)!;
  it('carry the right key and modifiers', () => {
    expect(find('⌘C')).toMatchObject({ sym: 0x63, mods: ['cmd'] });
    expect(find('⌘V')).toMatchObject({ sym: 0x76, mods: ['cmd'] });
    expect(find('⌘Tab')).toMatchObject({ sym: 0xff09, mods: ['cmd'] });
    expect(find('⌘Space')).toMatchObject({ sym: 0x20, mods: ['cmd'] });
    expect(find('⌘⇧Z')).toMatchObject({ sym: 0x7a, mods: ['cmd', 'shift'] });
  });
});

describe('hardware keys', () => {
  it('sends navigation keys as keys', () => {
    expect(keySymForEvent({ key: 'ArrowLeft' })).toBe(0xff51);
    expect(keySymForEvent({ key: 'Escape' })).toBe(0xff1b);
    expect(keySymForEvent({ key: 'Enter' })).toBe(0xff0d);
  });
  it('leaves plain printable keys to the text path so IME composition works', () => {
    expect(keySymForEvent({ key: 'a' })).toBe(0);
    expect(keySymForEvent({ key: '한' })).toBe(0);
    expect(keySymForEvent({ key: 'Shift' })).toBe(0);
  });
  it('sends modified keys by their base letter', () => {
    expect(keySymForEvent({ key: 'c', metaKey: true })).toBe(0x63);
    expect(keySymForEvent({ key: 'Z', metaKey: true, shiftKey: true })).toBe(0x7a);
    expect(keySymForEvent({ key: 'å', code: 'KeyA', altKey: true })).toBe(0x61);
    expect(keySymForEvent({ key: ' ', metaKey: true })).toBe(0x20);
  });
});
