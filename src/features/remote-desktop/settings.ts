// Remote desktop preferences live only on this device. Nothing here is a credential.
export type PointerMode = 'trackpad' | 'touch';
export type CursorSize = 's' | 'm' | 'l';
export type CmdKey = 'meta' | 'super' | 'alt';
export interface RemoteSettings {
  mode: PointerMode;
  sensitivity: number;
  scrollSpeed: number;
  scrollReverse: boolean;
  cursorSize: CursorSize;
  pad: boolean;
  padLeftHanded: boolean;
  padOpacity: number;
  padScale: number;
  autoHide: boolean;
  /** Which X11 keysym stands for ⌘. Servers disagree, so it can be switched without a new build. */
  cmdKey: CmdKey;
}
export const DEFAULT_SETTINGS: RemoteSettings = {
  mode: 'trackpad', sensitivity: 1.3, scrollSpeed: 1, scrollReverse: false, cursorSize: 'm',
  pad: false, padLeftHanded: false, padOpacity: .6, padScale: 1, autoHide: true, cmdKey: 'meta',
};
export const STORAGE_KEY = 'ttakkari.remote-desktop.settings.v1';
/** Cursor height in rem for each size. The pointer keeps this size on screen however far the desktop is zoomed. */
export const CURSOR_REM: Record<CursorSize, number> = { s: .9, m: 1.25, l: 1.75 };

const num = (v: unknown, lo: number, hi: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const bool = (v: unknown, fallback: boolean) => typeof v === 'boolean' ? v : fallback;
const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => options.includes(v as T) ? v as T : fallback;

export function sanitizeSettings(raw: unknown): RemoteSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    mode: pick(o.mode, ['trackpad', 'touch'], d.mode),
    sensitivity: num(o.sensitivity, .5, 3, d.sensitivity),
    scrollSpeed: num(o.scrollSpeed, .5, 2.5, d.scrollSpeed),
    scrollReverse: bool(o.scrollReverse, d.scrollReverse),
    cursorSize: pick(o.cursorSize, ['s', 'm', 'l'], d.cursorSize),
    pad: bool(o.pad, d.pad),
    padLeftHanded: bool(o.padLeftHanded, d.padLeftHanded),
    padOpacity: num(o.padOpacity, .25, 1, d.padOpacity),
    padScale: num(o.padScale, .8, 1.3, d.padScale),
    autoHide: bool(o.autoHide, d.autoHide),
    cmdKey: pick(o.cmdKey, ['meta', 'super', 'alt'], d.cmdKey),
  };
}
export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): RemoteSettings {
  try { return sanitizeSettings(JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null')); } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(settings: RemoteSettings, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* private mode or full storage: settings just last for this session */ }
}
function safeStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}
