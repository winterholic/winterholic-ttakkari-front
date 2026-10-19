import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, STORAGE_KEY, loadSettings, sanitizeSettings, saveSettings } from './settings';

describe('remote desktop settings', () => {
  it('falls back to defaults for missing, corrupt or hostile stored values', () => {
    expect(loadSettings({ getItem: () => null })).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({ getItem: () => '{not json' })).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ mode: 'rm -rf', sensitivity: 'fast', cursorSize: 9, pad: 'yes', cmdKey: 'x' })).toEqual(DEFAULT_SETTINGS);
  });
  it('clamps numeric values into their usable range', () => {
    const s = sanitizeSettings({ sensitivity: 99, scrollSpeed: -4, padOpacity: 0, padScale: 50 });
    expect(s.sensitivity).toBe(3);
    expect(s.scrollSpeed).toBe(.5);
    expect(s.padOpacity).toBe(.25);
    expect(s.padScale).toBe(1.3);
  });
  it('round-trips what the user chose', () => {
    const store = new Map<string, string>();
    const chosen = { ...DEFAULT_SETTINGS, mode: 'touch' as const, pad: true, padLeftHanded: true, cursorSize: 'l' as const, sensitivity: 2.1 };
    saveSettings(chosen, { setItem: (k, v) => void store.set(k, v) });
    expect(loadSettings({ getItem: k => store.get(k) ?? null })).toEqual(chosen);
    expect(store.has(STORAGE_KEY)).toBe(true);
  });
  it('does not throw when storage refuses writes', () => {
    expect(() => saveSettings(DEFAULT_SETTINGS, { setItem: () => { throw new Error('quota'); } })).not.toThrow();
  });
});
