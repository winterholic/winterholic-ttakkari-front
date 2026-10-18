import RFB from '@novnc/novnc';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { apiUrl, connectRemoteMac, disconnectRemoteMac } from '../../api/client';
import type { RemoteMac, RemotePermit } from '../../api/client';
import { Button, IconButton } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { TouchInput, pointInDesktop, pointerPacket, textKeysyms, zoomAt } from './interaction';
import type { InputMode, View } from './interaction';

const MODIFIERS = [['⌘ Cmd', 0xffe7], ['⌥ Option', 0xffe9], ['⌃ Control', 0xffe3], ['⇧ Shift', 0xffe1]] as const;
const KEYS = [['Esc', 0xff1b], ['Tab', 0xff09], ['⌫', 0xff08], ['↵', 0xff0d], ['←', 0xff51], ['↑', 0xff52], ['↓', 0xff54], ['→', 0xff53]] as const;

interface Props { device: RemoteMac; initialPermit: RemotePermit; credentials: { username: string; password: string }; onExit: () => void }
export function RemoteSession({ device, initialPermit, credentials, onExit }: Props) {
  const root = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null), target = useRef<HTMLDivElement>(null);
  const socket = useRef<WebSocket | null>(null), rfb = useRef<RFB | null>(null), grant = useRef(initialPermit.grant);
  const connected = useRef(false), retries = useRef(0), permitUsed = useRef(false);
  const view = useRef<View>({ x: 0, y: 0, scale: 1 });
  const dimensions = useRef({ width: 1920, height: 1080 });
  const [status, setStatus] = useState('Mac에 연결 중…');
  const [live, setLive] = useState(false), [attempt, setAttempt] = useState(0), [failed, setFailed] = useState(false);
  const [tools, setTools] = useState(true), [keyboard, setKeyboard] = useState(false), [help, setHelp] = useState(false);
  const [mode, setMode] = useState<InputMode>('trackpad'), [text, setText] = useState(''), [mods, setMods] = useState<number[]>([]);
  const [clipboard, setClipboard] = useState(''), [notice, setNotice] = useState('');
  const [scaleLabel, setScaleLabel] = useState('100%');
  const input = useRef<TouchInput | null>(null);
  const cursor = useRef<HTMLDivElement>(null), textarea = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false), sizeInitialized = useRef(false);
  const mouseHeld = useRef(false);
  const revokeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function paintCursor() {
    if (cursor.current && input.current) {
      cursor.current.style.transform = `translate(${view.current.x + input.current.cursor.x * view.current.scale}px, ${view.current.y + input.current.cursor.y * view.current.scale}px)`;
    }
  }
  function applyView(next: View) {
    const box = viewport.current;
    if (!box || !target.current) return;
    const w = dimensions.current.width * next.scale, h = dimensions.current.height * next.scale;
    next.x = w < box.clientWidth ? (box.clientWidth - w) / 2 : Math.min(0, Math.max(box.clientWidth - w, next.x));
    next.y = h < box.clientHeight ? (box.clientHeight - h) / 2 : Math.min(0, Math.max(box.clientHeight - h, next.y));
    view.current = next;
    if (input.current) input.current.view = next;
    target.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    setScaleLabel(`${Math.round(next.scale * 100)}%`);
    paintCursor();
  }
  function zoom(factor: number, x?: number, y?: number) {
    const box = viewport.current;
    if (box) applyView(zoomAt(view.current, view.current.scale * factor, x ?? box.clientWidth / 2, y ?? box.clientHeight / 2));
  }
  function fit() {
    const box = viewport.current;
    if (box) applyView({ x: 0, y: 0, scale: Math.min(box.clientWidth / dimensions.current.width, box.clientHeight / dimensions.current.height, 1) });
  }

  useEffect(() => {
    let disposed = false, lost = false, retryTimer: ReturnType<typeof setTimeout> | undefined;
    let client: RFB | null = null, ws: WebSocket | null = null;
    let observer: MutationObserver | null = null;
    const box = viewport.current!, node = target.current!;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const touch = new TouchInput({
      pointer(x, y, mask) {
        if (connected.current && socket.current?.readyState === WebSocket.OPEN) {
          socket.current.send(pointerPacket(x, y, mask)); paintCursor();
          // Follow the cursor while zoomed; the user need not switch modes to reach an edge.
          if (touch.mode === 'trackpad') {
            const px = view.current.x + x * view.current.scale, py = view.current.y + y * view.current.scale;
            const dx = px < 40 ? 40 - px : px > box.clientWidth - 40 ? box.clientWidth - 40 - px : 0;
            const dy = py < 40 ? 40 - py : py > box.clientHeight - 40 ? box.clientHeight - 40 - py : 0;
            if (dx || dy) applyView({ ...view.current, x: view.current.x + dx, y: view.current.y + dy });
          }
        }
      },
      pan(dx, dy) { applyView({ ...view.current, x: view.current.x + dx, y: view.current.y + dy }); },
      zoom,
    });
    touch.mode = mode; touch.view = view.current;
    touch.width = dimensions.current.width; touch.height = dimensions.current.height;
    touch.cursor = input.current?.cursor ?? { x: Math.min(touch.width / 2, box.clientWidth / 2), y: Math.min(touch.height / 2, box.clientHeight / 2) };
    input.current = touch;
    function lose(message: string, retry = true) {
      if (disposed || lost) return;
      lost = true;
      clearTimeout(deadline);
      connected.current = false; touch.cancel(); setLive(false); setTools(true); setStatus(message);
      if (retry && retries.current < 3 && navigator.onLine) {
        const delay = 1000 * 2 ** retries.current++;
        setStatus(`${message} ${delay / 1000}초 후 다시 연결합니다.`);
        retryTimer = setTimeout(() => { if (!disposed) setAttempt(a => a + 1); }, delay);
      } else setFailed(true);
    }
    async function open() {
      setFailed(false); setStatus('Mac에 연결 중…');
      let sawReady = false, linked = false;
      try {
        const permit = permitUsed.current ? await connectRemoteMac(device.id, { grant: grant.current }) : initialPermit;
        if (disposed) return;
        permitUsed.current = true; grant.current = permit.grant;
        const url = new URL(apiUrl(permit.path)); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(url); ws.binaryType = 'arraybuffer'; socket.current = ws;
        deadline = setTimeout(() => { ws?.close(); lose('Mac 응답 시간이 초과됐습니다.'); }, 30000);
        ws.onopen = () => ws?.send(JSON.stringify({ ticket: permit.ticket, grant: permit.grant }));
        ws.onclose = e => lose(e.reason || (sawReady ? '화면 연결이 끊겼습니다.' : '서버와의 연결이 끊겼습니다. 네트워크를 확인해 주세요.'), e.code !== 1008 && e.code !== 1013);
        ws.onerror = () => { setStatus('네트워크 연결을 확인하고 있습니다.'); };
        ws.onmessage = event => {
          if (disposed || event.data !== 'ready') return;
          sawReady = true; setStatus('Mac 화면을 여는 중…');
          client = new RFB(node, ws!, { credentials, shared: true }); rfb.current = client;
          client.scaleViewport = false; client.clipViewport = false; client.resizeSession = false; client.focusOnClick = false;
          client.qualityLevel = 6; client.compressionLevel = 2;
          client.addEventListener('connect', () => {
            if (disposed) return;
            clearTimeout(deadline); connected.current = true; linked = true; retries.current = 0; setLive(true); setStatus('연결됨'); client?.blur();
          });
          client.addEventListener('disconnect', () => lose(linked ? '화면 연결이 끊겼습니다.' : 'Mac 화면 열기에 실패했습니다. Mac 계정 이름·비밀번호와 화면 공유 설정을 확인해 주세요.'));
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
            sizeInitialized.current = true; touch.cursor = { x: Math.min(canvas.width / 2, box.clientWidth / 2), y: Math.min(canvas.height / 2, box.clientHeight / 2) };
            // Readable crop by default. Fit is an explicit user action.
            applyView({ scale: 1, x: 0, y: 0 });
          } else applyView({ ...view.current });
        });
        observer.observe(node, { subtree: true, childList: true, attributes: true, attributeFilter: ['width', 'height'] });
      } catch (e) { lose(e instanceof Error ? e.message : '접속 허가를 다시 확인해 주세요.', false); }
    }
    void open();
    const resize = () => {
      if (root.current) {
        root.current.style.height = `${window.visualViewport?.height ?? window.innerHeight}px`;
        root.current.style.top = `${window.visualViewport?.offsetTop ?? 0}px`;
      }
      applyView({ ...view.current });
    };
    resize();
    window.visualViewport?.addEventListener('resize', resize); window.visualViewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    const suspend = () => {
      touch.cancel(); setMods([]);
      if (mouseHeld.current && connected.current && socket.current?.readyState === WebSocket.OPEN) socket.current.send(pointerPacket(touch.cursor.x, touch.cursor.y, 0));
      mouseHeld.current = false;
    };
    const resume = () => { if (!disposed && !connected.current) { retries.current = 0; setAttempt(a => a + 1); } };
    window.addEventListener('blur', suspend); document.addEventListener('visibilitychange', suspend);
    window.addEventListener('online', resume);
    return () => {
      touch.cancel(); disposed = true; connected.current = false; clearTimeout(deadline); clearTimeout(retryTimer); observer?.disconnect();
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

  useEffect(() => { if (input.current) { input.current.cancel(); input.current.mode = mode; } }, [mode]);
  useEffect(() => { if (live) paintCursor(); }, [live]);
  useEffect(() => {
    if (!live || keyboard || help || !tools) return;
    const timer = setTimeout(() => setTools(false), 5000);
    return () => clearTimeout(timer);
  }, [live, keyboard, help, tools]);
  useEffect(() => {
    clearTimeout(revokeTimer.current);
    return () => { const currentGrant = grant.current; revokeTimer.current = setTimeout(() => { void disconnectRemoteMac(currentGrant).catch(() => {}); }, 0); };
  }, []);

  function pointer(e: ReactPointerEvent, kind: 'down' | 'move' | 'up' | 'cancel') {
    if (!live) return;
    const rect = viewport.current!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (e.pointerType === 'mouse' && input.current) {
      e.preventDefault();
      if (kind === 'down') { (e.currentTarget as HTMLElement).focus({ preventScroll: true }); e.currentTarget.setPointerCapture(e.pointerId); }
      input.current.cursor = pointInDesktop(x, y, view.current, dimensions.current.width, dimensions.current.height);
      const mask = kind === 'cancel' ? 0 : (e.buttons & 1) | ((e.buttons & 2) << 1) | ((e.buttons & 4) >> 1);
      mouseHeld.current = mask !== 0;
      if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(pointerPacket(input.current.cursor.x, input.current.cursor.y, mask));
      paintCursor(); return;
    }
    if (kind === 'down') {
      e.preventDefault(); (e.currentTarget as HTMLElement).focus({ preventScroll: true }); e.currentTarget.setPointerCapture(e.pointerId);
      input.current?.down(e.pointerId, x, y);
    } else if (kind === 'move') input.current?.move(e.pointerId, x, y);
    else if (kind === 'up') input.current?.up(e.pointerId);
    else input.current?.cancel();
    paintCursor();
  }
  function sendKey(sym: number, modifiers = mods) {
    if (!live) return;
    for (const mod of modifiers) rfb.current?.sendKey(mod, undefined, true);
    rfb.current?.sendKey(sym);
    for (const mod of [...modifiers].reverse()) rfb.current?.sendKey(mod, undefined, false);
    setMods([]);
  }
  function sendText() {
    if (composing.current || !live) return;
    if (text.length > 2000) { setNotice('한 번에 2,000자까지 보낼 수 있습니다.'); return; }
    textKeysyms(text).forEach((sym, i) => sendKey(sym, i === 0 ? mods : []));
    setText(''); textarea.current?.focus();
  }
  function leave() { input.current?.cancel(); connected.current = false; socket.current?.close(); onExit(); }
  return <div ref={root} className={`remote-session${keyboard ? ' remote-session--keyboard' : ''}`} role="region" aria-label={`${device.name} 원격 화면`}>
    <div ref={viewport} className="remote-viewport">
      <div ref={target} className="remote-canvas" aria-hidden="true" />
      <div className="remote-input" tabIndex={0} role="application" aria-label="Mac 조작 영역. 한 손가락 이동, 탭 클릭, 길게 눌러 드래그, 두 손가락 스크롤과 핀치 확대"
        onPointerDown={e => pointer(e, 'down')} onPointerMove={e => pointer(e, 'move')} onPointerUp={e => pointer(e, 'up')} onPointerCancel={e => pointer(e, 'cancel')} onLostPointerCapture={() => { input.current?.cancel(); if (mouseHeld.current && socket.current?.readyState === WebSocket.OPEN && input.current) socket.current.send(pointerPacket(input.current.cursor.x, input.current.cursor.y, 0)); mouseHeld.current = false; }}
        onContextMenu={e => e.preventDefault()}
        onWheel={e => { if (!live) return; if (e.ctrlKey) zoom(e.deltaY < 0 ? 1.1 : .9); else input.current?.click(e.deltaY > 0 ? 16 : 8); }}
        onKeyDown={e => { if (!live || e.nativeEvent.isComposing) return; const sym = ({ Enter: 0xff0d, Backspace: 0xff08, Tab: 0xff09, Escape: 0xff1b, ArrowLeft: 0xff51, ArrowUp: 0xff52, ArrowRight: 0xff53, ArrowDown: 0xff54 } as Record<string, number>)[e.key] ?? (Array.from(e.key).length === 1 ? textKeysyms(e.key)[0] : 0); if (sym) { e.preventDefault(); const held = [e.metaKey && 0xffe7, e.altKey && 0xffe9, e.ctrlKey && 0xffe3, e.shiftKey && 0xffe1].filter(Boolean) as number[]; held.forEach(k => rfb.current?.sendKey(k, undefined, true)); rfb.current?.sendKey(sym); held.reverse().forEach(k => rfb.current?.sendKey(k, undefined, false)); } }} />
      {live && <div ref={cursor} className="remote-cursor" aria-hidden="true" />}
      {!live && <div className="remote-status"><Icon name="server" /><p role="status">{status}</p>{failed && <div className="remote-actions"><Button onClick={() => { retries.current = 0; setAttempt(a => a + 1); }}>다시 연결</Button><Button onClick={leave}>계정 다시 확인</Button></div>}</div>}
    </div>
    {tools && <div className="remote-chrome">
      <div className="remote-topbar"><strong>{device.name}</strong><span role="status">{live ? '연결됨' : '연결 확인 중'}</span>{keyboard && <Button onClick={() => setKeyboard(false)}>키보드 닫기</Button>}<IconButton aria-label="연결 해제" onClick={leave}><Icon name="x" /></IconButton></div>
      <div className="remote-toolbar" aria-label="원격 조작 도구">
        <Button aria-pressed={mode === 'trackpad'} onClick={() => setMode('trackpad')}>트랙패드</Button>
        <Button aria-pressed={mode === 'touch'} onClick={() => setMode('touch')}>직접 터치</Button>
        <IconButton aria-label="화면 이동 모드" aria-pressed={mode === 'move'} onClick={() => setMode(mode === 'move' ? 'trackpad' : 'move')}><Icon name="hand" /></IconButton>
        <Button aria-expanded={keyboard} onClick={() => { setKeyboard(!keyboard); if (!keyboard) setTimeout(() => textarea.current?.focus(), 0); }}>키보드</Button>
        <Button onClick={() => input.current?.click(4)} disabled={!live}>우클릭</Button>
        <IconButton aria-label="축소" onClick={() => zoom(.8)}><Icon name="zoom-out" /></IconButton>
        <Button aria-label="화면 전체 보기" onClick={fit}>{scaleLabel}</Button>
        <IconButton aria-label="확대" onClick={() => zoom(1.25)}><Icon name="zoom-in" /></IconButton>
        <IconButton aria-label="전체 화면" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else if (root.current?.requestFullscreen) void root.current.requestFullscreen().catch(() => setNotice('이 브라우저에서는 전체 화면을 지원하지 않습니다. 홈 화면에 추가하면 더 넓게 볼 수 있습니다.')); else setNotice('홈 화면에 추가하거나 가로로 돌리면 더 넓게 볼 수 있습니다.'); }}><Icon name="expand" /></IconButton>
        <IconButton aria-label="조작 안내" aria-expanded={help} onClick={() => setHelp(!help)}><Icon name="info" /></IconButton>
      </div>
      {keyboard && <div className="remote-keyboard">
        <details><summary>특수 키{mods.length > 0 ? ` · ${mods.length}개 선택` : ''}</summary><div className="remote-keys">{MODIFIERS.map(([label, key]) => <Button key={key} aria-pressed={mods.includes(key)} onClick={() => setMods(v => v.includes(key) ? v.filter(k => k !== key) : [...v, key])}>{label}</Button>)}{KEYS.map(([label, key]) => <Button key={key} onClick={() => sendKey(key)} disabled={!live}>{label}</Button>)}</div></details>
        <label className="remote-text-label">Mac에 입력할 글<textarea ref={textarea} value={text} rows={2} autoCapitalize="none" autoCorrect="off" spellCheck={false} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onChange={e => setText(e.target.value)} /></label>
        <div className="remote-actions"><Button variant="primary" onClick={sendText} disabled={!live || !text}>글 보내기</Button><Button onClick={() => sendKey(0xff0d)} disabled={!live}>Enter</Button><Button onClick={() => { if (Array.from(text).some(c => c.codePointAt(0)! > 255)) { setNotice('한글은 글 보내기를 사용해 주세요. 기본 VNC 클립보드는 한글을 보존하지 못할 수 있습니다.'); return; } rfb.current?.clipboardPasteFrom(text); setNotice('Mac 클립보드에 보냈습니다. ⌘ V로 붙여넣으세요.'); }} disabled={!live || !text}>클립보드로 보내기</Button></div>
        {clipboard && <details><summary>Mac에서 복사한 글</summary><textarea readOnly value={clipboard} aria-label="Mac에서 복사한 글" /><Button onClick={() => void navigator.clipboard.writeText(clipboard).then(() => setNotice('아이폰 클립보드에 복사했습니다.'), () => setNotice('위 글을 길게 눌러 복사해 주세요.'))}>이 기기에 복사</Button></details>}
      </div>}
      {help && <p className="remote-guidance">한 손가락으로 커서를 움직이고 탭하면 클릭합니다. 길게 누른 채 움직이면 드래그, 두 손가락은 스크롤·핀치 확대입니다. 직접 터치에서는 탭한 위치를 클릭하고 밀어서 화면을 옮깁니다. 특수 키는 다음 키에만 적용됩니다. 한글은 조합을 마친 뒤 글 보내기를 누르세요.</p>}
      {notice && <p className="remote-guidance" role="status">{notice}<Button onClick={() => setNotice('')}>닫기</Button></p>}
    </div>}
    <IconButton className="remote-tools-toggle" aria-label={tools ? '도구 숨기기' : '도구 열기'} aria-expanded={tools} onClick={() => setTools(!tools)}><Icon name={tools ? 'chevron-down' : 'settings'} /></IconButton>
  </div>;
}
