import RFB from '@novnc/novnc';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { apiUrl, connectRemoteMac, disconnectRemoteMac } from '../../api/client';
import type { RemoteMac, RemotePermit } from '../../api/client';
import { Button, IconButton } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { GamepadOverlay } from './GamepadOverlay';
import type { PadButton } from './GamepadOverlay';
import { TouchInput, ZOOM_MAX, fitScale, pointInDesktop, pointerPacket, textKeysyms, zoomAt } from './interaction';
import type { View } from './interaction';
import { KeyboardBar } from './KeyboardBar';
import type { KeyboardBarHandle } from './KeyboardBar';
import { NO_MODIFIERS, activeModifiers, cycleModifier, keySymForEvent, modifierSym, releaseOneShot } from './keys';
import type { KeyLike, Modifier, ModifierStates, Shortcut } from './keys';
import { SettingsSheet } from './SettingsSheet';
import './remote-session.css';
import { CURSOR_REM, loadSettings, saveSettings } from './settings';
import type { RemoteSettings } from './settings';

const EDGE = 48;
const PROBE_MS = 4000;
const HIDE_MS = 4000;
const HINT_KEY = 'ttakkari.remote-desktop.hint.v1';
// Capture keeps a stroke alive outside the surface. It throws for pointers the browser no longer tracks, which is not worth losing a tap over.
const capture = (el: Element, id: number) => { try { el.setPointerCapture(id); } catch { /* inactive pointer */ } };

interface Props { device: RemoteMac; initialPermit: RemotePermit; credentials: { username: string; password: string }; onExit: () => void }
export function RemoteSession({ device, initialPermit, credentials, onExit }: Props) {
  const root = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null), target = useRef<HTMLDivElement>(null);
  const socket = useRef<WebSocket | null>(null), rfb = useRef<RFB | null>(null), grant = useRef(initialPermit.grant);
  const connected = useRef(false), retries = useRef(0), permitUsed = useRef(false);
  const view = useRef<View>({ x: 0, y: 0, scale: 1 });
  const dimensions = useRef({ width: 1920, height: 1080 });
  const fitted = useRef(true), sizeInitialized = useRef(false);
  const insets = useRef({ top: 0, bottom: 0 });
  const [settings, setSettings] = useState<RemoteSettings>(loadSettings);
  const settingsRef = useRef(settings);
  const [status, setStatus] = useState('Mac에 연결 중…');
  const [live, setLive] = useState(false), [attempt, setAttempt] = useState(0), [failed, setFailed] = useState(false);
  const [tools, setTools] = useState(true), [activity, setActivity] = useState(0), [sheet, setSheet] = useState(false);
  const [keyboard, setKeyboard] = useState(false), [movePan, setMovePan] = useState(false);
  const [mods, setMods] = useState<ModifierStates>(NO_MODIFIERS);
  const modsRef = useRef(mods);
  const [clipboard, setClipboard] = useState(''), [notice, setNotice] = useState('');
  const [scaleLabel, setScaleLabel] = useState('100%');
  const [latency, setLatency] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const pad = useRef({ left: false, right: false, lock: false });
  const cursor = useRef<HTMLDivElement>(null), keybar = useRef<KeyboardBarHandle>(null);
  const keybarBox = useRef<HTMLDivElement>(null);
  const mouseHeld = useRef(false), lastMask = useRef(0);
  const pointerMods = useRef<Modifier[]>([]);
  const revokeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fullscreenSupported = typeof document !== 'undefined' && !!document.fullscreenEnabled;

  const [touch] = useState(() => new TouchInput({
    pointer(x, y, mask) {
      if (!connected.current || socket.current?.readyState !== WebSocket.OPEN) return;
      // Modifier chips also apply to clicks, so Cmd-click and Shift-click work.
      const down = (mask & 7) !== 0, wasDown = (lastMask.current & 7) !== 0;
      if (down && !wasDown) {
        pointerMods.current = activeModifiers(modsRef.current);
        const cmd = settingsRef.current.cmdKey;
        for (const m of pointerMods.current) rfb.current?.sendKey(modifierSym(m, cmd), undefined, true);
      }
      socket.current.send(pointerPacket(x, y, mask));
      if (!down && wasDown && pointerMods.current.length) {
        const cmd = settingsRef.current.cmdKey;
        for (const m of [...pointerMods.current].reverse()) rfb.current?.sendKey(modifierSym(m, cmd), undefined, false);
        pointerMods.current = []; setModsBoth(releaseOneShot(modsRef.current));
      }
      lastMask.current = mask; mouseHeld.current = mask !== 0;
      paintCursor(); pulseCursor(mask, wasDown);
      followCursor();
    },
    pan(dx, dy) { fitted.current = false; applyView({ ...view.current, x: view.current.x + dx, y: view.current.y + dy }); },
    zoom,
  }));

  const setModsBoth = useCallback((next: ModifierStates) => { modsRef.current = next; setMods(next); }, []);
  const toast = useCallback((message: string) => setNotice(message), []);

  function paintCursor() {
    const el = cursor.current;
    if (!el || !touch) return;
    el.style.transform = `translate(${view.current.x + touch.cursor.x * view.current.scale}px, ${view.current.y + touch.cursor.y * view.current.scale}px)`;
  }
  function limits() {
    const box = viewport.current;
    const min = box ? fitScale(box.clientWidth, box.clientHeight, dimensions.current.width, dimensions.current.height) : .15;
    return { min, max: Math.max(ZOOM_MAX, min) };
  }
  function applyView(next: View) {
    const box = viewport.current;
    if (!box || !target.current) return;
    const { min, max } = limits();
    next = { ...next, scale: Math.min(max, Math.max(min, next.scale)) };
    const w = dimensions.current.width * next.scale, h = dimensions.current.height * next.scale;
    next.x = w < box.clientWidth ? (box.clientWidth - w) / 2 : Math.min(0, Math.max(box.clientWidth - w, next.x));
    next.y = h < box.clientHeight ? (box.clientHeight - h) / 2 : Math.min(0, Math.max(box.clientHeight - h, next.y));
    view.current = next; touch.view = next;
    target.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    setScaleLabel(`${Math.round(next.scale * 100)}%`);
    paintCursor();
  }
  function zoom(factor: number, x?: number, y?: number) {
    const box = viewport.current;
    if (!box) return;
    const { min, max } = limits();
    const next = zoomAt(view.current, view.current.scale * factor, x ?? box.clientWidth / 2, y ?? box.clientHeight / 2, min, max);
    fitted.current = next.scale <= min * 1.001;
    applyView(next);
  }
  function fit() {
    const box = viewport.current;
    if (!box) return;
    fitted.current = true;
    applyView({ x: 0, y: 0, scale: fitScale(box.clientWidth, box.clientHeight, dimensions.current.width, dimensions.current.height) });
  }
  /** Keep the cursor inside the visible desktop, away from the edges and from the keyboard bar, by moving the view. */
  function followCursor() {
    const box = viewport.current;
    if (!box) return;
    const v = view.current, bottom = box.clientHeight - insets.current.bottom;
    const px = v.x + touch.cursor.x * v.scale, py = v.y + touch.cursor.y * v.scale;
    const dx = px < EDGE ? EDGE - px : px > box.clientWidth - EDGE ? box.clientWidth - EDGE - px : 0;
    const dy = py < EDGE ? EDGE - py : py > bottom - EDGE ? bottom - EDGE - py : 0;
    if (dx || dy) applyView({ ...v, x: v.x + dx, y: v.y + dy });
  }

  /** Shown once per device, the first time a session connects. */
  function firstRunHint() {
    try {
      if (localStorage.getItem(HINT_KEY)) return;
      localStorage.setItem(HINT_KEY, '1');
      toast('한 손가락 끌기=커서 이동, 탭=클릭, 두 손가락 탭=우클릭, 두 손가락 끌기=스크롤. 게임패드·키보드는 위 도구 줄에서 켭니다.');
    } catch { /* storage unavailable: skip the first-run hint */ }
  }
  function sendKeys(sym: number, held: Modifier[]) {
    const client = rfb.current;
    if (!client) return;
    const cmd = settingsRef.current.cmdKey;
    for (const m of held) client.sendKey(modifierSym(m, cmd), undefined, true);
    client.sendKey(sym);
    for (const m of [...held].reverse()) client.sendKey(modifierSym(m, cmd), undefined, false);
  }
  /** Press `extra` plus the armed modifier chips around one key, then drop the next-key-only chips. */
  function sendCombo(sym: number, extra: Modifier[] = []) {
    if (!connected.current) return;
    sendKeys(sym, [...new Set([...activeModifiers(modsRef.current), ...extra])]);
    setModsBoth(releaseOneShot(modsRef.current));
  }
  function sendText(text: string) {
    if (!connected.current || !text) return;
    if (text.length > 2000) { toast('한 번에 2,000자까지 보낼 수 있습니다.'); return; }
    textKeysyms(text).forEach((sym, i) => { if (i === 0) sendCombo(sym); else sendKeys(sym, []); });
  }
  function heldFromEvent(e: KeyLike): Modifier[] {
    return ([e.metaKey && 'cmd', e.altKey && 'opt', e.ctrlKey && 'ctrl', e.shiftKey && 'shift'] as (Modifier | false | undefined)[]).filter(Boolean) as Modifier[];
  }
  /** Hardware keyboard: combos and navigation keys go as keys. Returns true when handled. */
  function hardwareKey(e: KeyLike): boolean {
    if (!connected.current) return false;
    const sym = keySymForEvent(e);
    if (sym) { sendCombo(sym, heldFromEvent(e)); return true; }
    return false;
  }
  function openKeyboard() {
    if (keyboard) { setKeyboard(false); return; }
    // The field must take focus inside this tap, or iOS Safari refuses to raise the soft keyboard.
    flushSync(() => setKeyboard(true));
    keybar.current?.focus();
    setSheet(false);
  }
  async function pasteFromPhone() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { toast('아이폰 클립보드가 비어 있습니다.'); return; }
      sendText(text); toast('아이폰 클립보드의 글을 Mac에 입력했습니다.');
    } catch { toast('붙여넣기 권한이 필요합니다. 키보드 입력칸을 길게 눌러 붙여넣어 주세요.'); }
  }


  function pulseCursor(mask: number, wasDown: boolean) {
    const el = cursor.current;
    if (!el) return;
    el.dataset.down = (mask & 1) ? '1' : '';
    if ((mask & 7) && !wasDown) el.querySelector('.remote-cursor__pulse')?.animate?.([{ transform: 'scale(.4)', opacity: .9 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 320, easing: 'ease-out' });
  }
  function releasePointer() {
    pad.current = { left: false, right: false, lock: false }; setLocked(false);
    touch.external = 0; touch.cancel();
    if (mouseHeld.current && connected.current && socket.current?.readyState === WebSocket.OPEN) socket.current.send(pointerPacket(touch.cursor.x, touch.cursor.y, 0));
    mouseHeld.current = false; lastMask.current = 0;
    if (pointerMods.current.length) { for (const m of pointerMods.current) rfb.current?.sendKey(modifierSym(m, settingsRef.current.cmdKey), undefined, false); pointerMods.current = []; }
  }
  function releaseMouse() {
    if (mouseHeld.current && connected.current && socket.current?.readyState === WebSocket.OPEN) socket.current.send(pointerPacket(touch.cursor.x, touch.cursor.y, 0));
    mouseHeld.current = false; lastMask.current = 0;
  }
  function setPadButton(button: PadButton, on: boolean) {
    pad.current[button] = on;
    touch.external = (pad.current.left || pad.current.lock ? 1 : 0) | (pad.current.right ? 4 : 0);
    if (button === 'lock') setLocked(on);
    touch.sync();
  }

  useEffect(() => { settingsRef.current = settings; touch.config = { sensitivity: settings.sensitivity, scrollSpeed: settings.scrollSpeed, scrollReverse: settings.scrollReverse }; saveSettings(settings); }, [settings, touch]);
  useEffect(() => { touch.cancel(); touch.mode = movePan ? 'move' : settings.mode; }, [settings.mode, movePan, touch]);
  useEffect(() => { if (!settings.pad && pad.current.lock) setPadButton('lock', false); }, [settings.pad]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let disposed = false, lost = false, retryTimer: ReturnType<typeof setTimeout> | undefined;
    let client: RFB | null = null, ws: WebSocket | null = null;
    let observer: MutationObserver | null = null, probe: ReturnType<typeof setInterval> | undefined;
    let probing = false, smoothed = 0;
    const box = viewport.current!, node = target.current!;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    touch.width = dimensions.current.width; touch.height = dimensions.current.height;
    if (!sizeInitialized.current) touch.cursor = { x: Math.min(touch.width / 2, box.clientWidth / 2), y: Math.min(touch.height / 2, box.clientHeight / 2) };
    function lose(message: string, retry = true) {
      if (disposed || lost) return;
      lost = true;
      clearTimeout(deadline); clearInterval(probe);
      connected.current = false; touch.cancel(); setLive(false); setLatency(null); setTools(true); setStatus(message);
      if (retry && retries.current < 3 && navigator.onLine) {
        const delay = 1000 * 2 ** retries.current++;
        setStatus(`${message} ${delay / 1000}초 후 다시 연결합니다.`);
        retryTimer = setTimeout(() => { if (!disposed) setAttempt(a => a + 1); }, delay);
      } else setFailed(true);
    }
    async function open() {
      setFailed(false); setStatus('Mac에 연결 중…');
      try {
        const permit = permitUsed.current ? await connectRemoteMac(device.id, { grant: grant.current }) : initialPermit;
        if (disposed) return;
        permitUsed.current = true; grant.current = permit.grant;
        const url = new URL(apiUrl(permit.path)); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(url); ws.binaryType = 'arraybuffer'; socket.current = ws;
        deadline = setTimeout(() => { ws?.close(); lose('Mac 응답 시간이 초과됐습니다.'); }, 15000);
        ws.onopen = () => ws?.send(JSON.stringify({ ticket: permit.ticket, grant: permit.grant }));
        ws.onclose = e => lose(e.reason || '화면 연결이 끊겼습니다.', e.code !== 1008 && e.code !== 1013);
        ws.onerror = () => { setStatus('네트워크 연결을 확인하고 있습니다.'); };
        ws.onmessage = event => {
          if (disposed || event.data !== 'ready') return;
          const before = new Set(Array.from(document.body.children));
          client = new RFB(node, ws!, { credentials, shared: true }); rfb.current = client;
          // On touch devices noVNC adds its own cursor image to the page. The session draws one pointer, so hide that copy.
          for (const el of Array.from(document.body.children)) if (!before.has(el) && el instanceof HTMLCanvasElement) el.style.display = 'none';
          client.scaleViewport = false; client.clipViewport = false; client.resizeSession = false; client.focusOnClick = false;
          client.showDotCursor = false;
          client.qualityLevel = 6; client.compressionLevel = 2;
          client.addEventListener('connect', () => {
            if (disposed) return;
            clearTimeout(deadline); connected.current = true; retries.current = 0; setLive(true); setStatus('연결됨'); client?.blur(); firstRunHint();
            clearInterval(probe);
            // Round trip to the Mac Studio's API over the same path the screen uses. A protocol-level probe would make noVNC add one more
            // update request chain per reply, so this stays outside the RFB stream.
            const measure = () => {
              if (probing || disposed) return;
              probing = true; const started = performance.now();
              fetch(apiUrl('/api/version'), { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(PROBE_MS) }).then(() => {
                const sample = performance.now() - started;
                smoothed = smoothed ? smoothed * .5 + sample * .5 : sample;
                if (!disposed) setLatency(Math.round(smoothed));
              }, () => { if (!disposed) setLatency(null); }).finally(() => { probing = false; });
            };
            measure(); probe = setInterval(measure, PROBE_MS);
          });
          client.addEventListener('disconnect', () => lose('화면 연결이 끊겼습니다.'));
          client.addEventListener('securityfailure', () => { retries.current = 3; lose('Mac 인증에 실패했습니다. 계정과 화면 공유 권한을 확인해 주세요.', false); });
          client.addEventListener('credentialsrequired', () => { retries.current = 3; lose('Mac 계정 이름과 로그인 비밀번호를 다시 입력해 주세요.', false); client?.disconnect(); });
          client.addEventListener('clipboard', e => { if (!disposed) setClipboard((e as CustomEvent<{ text: string }>).detail.text); });
        };
        observer = new MutationObserver(() => {
          if (!connected.current) return;
          const canvas = node.querySelector('canvas');
          if (!canvas || !canvas.width || !canvas.height) return;
          if (canvas.width === dimensions.current.width && canvas.height === dimensions.current.height && sizeInitialized.current) return;
          dimensions.current = { width: canvas.width, height: canvas.height };
          touch.width = canvas.width; touch.height = canvas.height;
          node.style.width = `${canvas.width}px`; node.style.height = `${canvas.height}px`;
          if (!sizeInitialized.current) {
            sizeInitialized.current = true; touch.cursor = { x: canvas.width / 2, y: canvas.height / 2 };
            // The whole desktop first, so nothing is hidden off screen. Pinch to read details.
            fit();
          } else if (fitted.current) fit(); else applyView({ ...view.current });
        });
        observer.observe(node, { subtree: true, childList: true, attributes: true, attributeFilter: ['width', 'height'] });
      } catch (e) { lose(e instanceof Error ? e.message : '접속 허가를 다시 확인해 주세요.', false); }
    }
    void open();
    const resize = () => {
      if (root.current) {
        root.current.style.height = `${window.visualViewport?.height ?? window.innerHeight}px`;
        root.current.style.top = `${window.visualViewport?.offsetTop ?? 0}px`;
        // The viewport shrinks by the keyboard's height. env(safe-area-inset-bottom) stays set then, which would leave a gap above the keyboard.
        const covered = window.visualViewport ? window.innerHeight - window.visualViewport.height : 0;
        if (covered > 120) root.current.setAttribute('data-soft-keyboard', ''); else root.current.removeAttribute('data-soft-keyboard');
      }
      if (fitted.current) fit(); else applyView({ ...view.current });
      followCursor();
    };
    resize();
    window.visualViewport?.addEventListener('resize', resize); window.visualViewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    const suspend = () => { setModsBoth(NO_MODIFIERS); releasePointer(); };
    const resume = () => { if (!disposed && !connected.current) { retries.current = 0; setAttempt(a => a + 1); } };
    window.addEventListener('blur', suspend); document.addEventListener('visibilitychange', suspend);
    window.addEventListener('online', resume);
    return () => {
      touch.cancel(); disposed = true; connected.current = false; clearTimeout(deadline); clearTimeout(retryTimer); clearInterval(probe); observer?.disconnect();
      if (ws) ws.onclose = ws.onerror = ws.onmessage = null;
      if (!lost) client?.disconnect();
      ws?.close(); node.replaceChildren();
      window.visualViewport?.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize); window.removeEventListener('blur', suspend); document.removeEventListener('visibilitychange', suspend);
      window.removeEventListener('online', resume);
    };
    // Connection lifetime is explicit. View/mode changes do not redial the Mac.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, device.id]);

  useEffect(() => { if (live) paintCursor(); }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tools fade away while the Mac is in use. Touching them, the keyboard or the settings sheet keeps them up.
  useEffect(() => {
    if (!live || keyboard || sheet || !tools || !settings.autoHide) return;
    const timer = setTimeout(() => setTools(false), HIDE_MS);
    return () => clearTimeout(timer);
  }, [live, keyboard, sheet, tools, activity, settings.autoHide]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    clearTimeout(revokeTimer.current);
    return () => { const currentGrant = grant.current; revokeTimer.current = setTimeout(() => { void disconnectRemoteMac(currentGrant).catch(() => {}); }, 0); };
  }, []);

  // Keep the cursor clear of the keyboard bar, and keep the iPhone from bouncing, zooming or navigating away by accident.
  useEffect(() => {
    const bar = keybarBox.current, inset = insets.current;
    inset.bottom = bar ? bar.offsetHeight : 0;
    if (!keyboard || !bar || typeof ResizeObserver === 'undefined') { followCursor(); return; }
    const watch = new ResizeObserver(() => { inset.bottom = bar.offsetHeight; followCursor(); });
    watch.observe(bar);
    return () => { watch.disconnect(); inset.bottom = 0; };
  }, [keyboard]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('remote-session-open');
    const stop = (e: Event) => e.preventDefault();
    const node = root.current;
    node?.addEventListener('gesturestart', stop); node?.addEventListener('gesturechange', stop);
    // The system back swipe would end the session. Absorb it once and say how to leave.
    const state = { ...(history.state ?? {}), remoteGuard: true };
    history.pushState(state, '');
    const onPop = () => { history.pushState(state, ''); toast('뒤로 가기로는 연결이 끊기지 않습니다. 왼쪽 위 ✕로 나가세요.'); };
    window.addEventListener('popstate', onPop);
    let lock: WakeLockSentinel | null = null, gone = false;
    const hold = () => { if (!gone && document.visibilityState === 'visible') void navigator.wakeLock?.request('screen').then(s => { if (gone) void s.release(); else lock = s; }, () => {}); };
    hold(); document.addEventListener('visibilitychange', hold);
    return () => {
      gone = true; html.classList.remove('remote-session-open');
      node?.removeEventListener('gesturestart', stop); node?.removeEventListener('gesturechange', stop);
      window.removeEventListener('popstate', onPop); document.removeEventListener('visibilitychange', hold);
      void lock?.release().catch(() => {});
    };
  }, [toast]);

  function pointer(e: ReactPointerEvent, kind: 'down' | 'move' | 'up' | 'cancel') {
    if (!live) return;
    const rect = viewport.current!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (e.pointerType === 'mouse') {
      e.preventDefault();
      if (kind === 'down') { (e.currentTarget as HTMLElement).focus({ preventScroll: true }); capture(e.currentTarget, e.pointerId); }
      touch.cursor = pointInDesktop(x, y, view.current, dimensions.current.width, dimensions.current.height);
      const mask = kind === 'cancel' ? 0 : (e.buttons & 1) | ((e.buttons & 2) << 1) | ((e.buttons & 4) >> 1);
      if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(pointerPacket(touch.cursor.x, touch.cursor.y, mask));
      mouseHeld.current = mask !== 0; lastMask.current = mask;
      paintCursor(); return;
    }
    if (kind === 'down') {
      e.preventDefault();
      // With the keyboard bar open, taking focus here would drop the soft keyboard on every tap.
      if (!keyboard) (e.currentTarget as HTMLElement).focus({ preventScroll: true });
      capture(e.currentTarget, e.pointerId);
      touch.down(e.pointerId, x, y, e.timeStamp);
    } else if (kind === 'move') touch.move(e.pointerId, x, y, e.timeStamp);
    else if (kind === 'up') touch.up(e.pointerId, e.timeStamp);
    else touch.cancel();
    paintCursor();
  }
  function leave() { touch.cancel(); releasePointer(); connected.current = false; socket.current?.close(); onExit(); }
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen?.().catch(() => toast('이 브라우저에서는 전체 화면을 지원하지 않습니다.'));
  }
  function patch(change: Partial<RemoteSettings>) { setSettings(s => ({ ...s, ...change })); }
  const bump = () => setActivity(a => a + 1);
  const cursorStyle = { '--rd-cursor-size': `${CURSOR_REM[settings.cursorSize]}rem` } as CSSProperties;
  const statusText = live ? (latency === null ? '연결됨' : `${latency}ms`) : '연결 중';
  const quality = !live ? 'off' : latency === null ? 'ok' : latency < 120 ? 'good' : latency < 300 ? 'ok' : 'slow';

  return <div ref={root} className={`remote-session${keyboard ? ' remote-session--keyboard' : ''}`} style={cursorStyle} role="region" aria-label={`${device.name} 원격 화면`}>
    <div ref={viewport} className="remote-viewport">
      <div ref={target} className="remote-canvas" aria-hidden="true" />
      <div className="remote-input" tabIndex={0} role="application" aria-label="Mac 조작 영역. 한 손가락 끌기로 커서 이동, 탭 클릭, 두 손가락 탭 우클릭, 두 손가락 끌기 스크롤, 핀치 확대"
        onPointerDown={e => pointer(e, 'down')} onPointerMove={e => pointer(e, 'move')} onPointerUp={e => pointer(e, 'up')} onPointerCancel={e => pointer(e, 'cancel')} onLostPointerCapture={e => { if (e.pointerType === 'mouse') releaseMouse(); }}
        onContextMenu={e => e.preventDefault()}
        onWheel={e => { if (!live) return; if (e.ctrlKey) zoom(e.deltaY < 0 ? 1.1 : .9); else touch.wheel(e.deltaY > 0 ? 'down' : 'up'); }}
        onKeyDown={e => {
          if (!live || e.nativeEvent.isComposing) return;
          if (hardwareKey(e)) { e.preventDefault(); return; }
          if (Array.from(e.key).length === 1) { e.preventDefault(); sendText(e.key); }
        }} />
      {live && <div ref={cursor} className="remote-cursor" aria-hidden="true">
        <span className="remote-cursor__pulse" />
        <svg viewBox="0 0 16 24" className="remote-cursor__arrow"><path d="M1.2 1.2 V18.2 L5.4 14.4 L8.4 21.4 L11.2 20.2 L8.2 13.4 L14 13.2 Z" /></svg>
      </div>}
      {!live && <div className="remote-status"><Icon name="server" /><p role="status">{status}</p>{failed && <div className="remote-actions"><Button onClick={() => { retries.current = 0; setAttempt(a => a + 1); }}>다시 연결</Button><Button onClick={leave}>계정 다시 확인</Button></div>}</div>}
    </div>
    {live && settings.pad && !keyboard && <GamepadOverlay leftHanded={settings.padLeftHanded} opacity={settings.padOpacity} scale={settings.padScale} sensitivity={settings.sensitivity} locked={locked}
      onNudge={(dx, dy) => touch.nudge(dx, dy)} onButton={setPadButton} onWheel={d => touch.wheel(d)} />}
    {tools && <div className="remote-chrome" onPointerDownCapture={bump}>
      <div className="remote-topbar">
        <IconButton aria-label="연결 해제" onClick={leave}><Icon name="x" /></IconButton>
        <span className="remote-status-pill" role="status" data-quality={quality} aria-label={`${device.name} ${live ? '연결됨' : '연결 확인 중'}${latency === null ? '' : `, 응답 ${latency}밀리초`}`} title={device.name}>{statusText}</span>
        <IconButton aria-label={`손가락 조작 방식 바꾸기. 지금은 ${settings.mode === 'trackpad' ? '트랙패드' : '직접 터치'}`} aria-pressed={settings.mode === 'touch'} onClick={() => patch({ mode: settings.mode === 'trackpad' ? 'touch' : 'trackpad' })}><Icon name={settings.mode === 'trackpad' ? 'mouse-pointer' : 'pointer'} /></IconButton>
        <IconButton aria-label="화면 이동 모드" aria-pressed={movePan} onClick={() => setMovePan(v => !v)}><Icon name="hand" /></IconButton>
        <IconButton aria-label="게임패드" aria-pressed={settings.pad} onClick={() => patch({ pad: !settings.pad })}><Icon name="gamepad" /></IconButton>
        <IconButton aria-label="키보드" aria-pressed={keyboard} aria-expanded={keyboard} onClick={openKeyboard}><Icon name="keyboard" /></IconButton>
        <Button aria-label="화면 전체 보기" onClick={fit}>{scaleLabel}</Button>
        <IconButton aria-label="설정" aria-expanded={sheet} onClick={() => setSheet(v => !v)}><Icon name="settings" /></IconButton>
      </div>
      {notice && <p className="remote-guidance" role="status">{notice}<Button onClick={() => setNotice('')}>닫기</Button></p>}
    </div>}
    {!tools && notice && <p className="remote-guidance remote-guidance--floating" role="status">{notice}<Button onClick={() => setNotice('')}>닫기</Button></p>}
    {sheet && <SettingsSheet settings={settings} onChange={patch} onClose={() => setSheet(false)} canFullscreen={fullscreenSupported} onFullscreen={toggleFullscreen}
      macClipboard={clipboard} onCopyMacClipboard={() => void navigator.clipboard.writeText(clipboard).then(() => toast('아이폰 클립보드에 복사했습니다.'), () => toast('위 글을 길게 눌러 복사해 주세요.'))} />}
    {keyboard && <div ref={keybarBox} className="remote-keybar-wrap">
      <KeyboardBar handleRef={keybar} disabled={!live} mods={mods}
        onToggleMod={m => setModsBoth({ ...modsRef.current, [m]: cycleModifier(modsRef.current[m]) })}
        onText={sendText} onKey={sym => sendCombo(sym)} onShortcut={(s: Shortcut) => sendCombo(s.sym, s.mods)} onHardwareKey={hardwareKey}
        onPasteFromPhone={() => void pasteFromPhone()} onClose={() => setKeyboard(false)} />
    </div>}
    {!tools && !keyboard && <IconButton className="remote-tools-toggle" aria-label="도구 열기" aria-expanded={false} onClick={() => { setTools(true); bump(); }}><Icon name="settings" /></IconButton>}
  </div>;
}

