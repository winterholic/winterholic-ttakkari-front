import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RemoteSession } from './RemoteSession';
import { STORAGE_KEY } from './settings';

const calls = vi.hoisted(() => ({ key: vi.fn(), disconnect: vi.fn(), sent: [] as Uint8Array[] }));
const permit = { ticket: 'test-ticket', grant: 'test-grant', path: '/socket', expires_in: 30 };
vi.mock('../../api/client', () => ({
  apiUrl: (p: string) => `http://localhost${p}`,
  connectRemoteMac: vi.fn(async () => ({ ticket: 'next-ticket', grant: 'test-grant', path: '/socket', expires_in: 30 })),
  disconnectRemoteMac: vi.fn(async () => {}),
}));
vi.mock('@novnc/novnc', () => ({ default: class extends EventTarget {
  constructor(node: HTMLElement) {
    super();
    const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080; node.append(canvas);
    queueMicrotask(() => this.dispatchEvent(new Event('connect')));
  }
  blur() {}
  disconnect = calls.disconnect;
  sendKey = calls.key;
  showDotCursor = false;
} }));
class Socket {
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor() { queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
  addEventListener() {}
  send(value: unknown) {
    if (typeof value === 'string') queueMicrotask(() => this.onmessage?.({ data: 'ready' }));
    else calls.sent.push(value as Uint8Array);
  }
  close() { this.readyState = 3; }
}
beforeEach(() => {
  vi.clearAllMocks(); calls.sent.length = 0; localStorage.clear();
  vi.stubGlobal('WebSocket', Socket);
  HTMLElement.prototype.setPointerCapture = () => {};
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function setup() {
  render(<StrictMode><RemoteSession device={{ id: 'mac', name: 'Mac', host: '127.0.0.1', port: 5900 }} initialPermit={permit} credentials={{ username: 'fixture', password: 'fixture' }} onExit={() => {}} /></StrictMode>);
  await screen.findByText('연결됨');
}
async function openKeyboard() {
  await setup();
  fireEvent.click(screen.getByRole('button', { name: '키보드' }));
  return screen.getByRole('textbox', { name: 'Mac에 입력할 글' }) as HTMLTextAreaElement;
}
function type(field: HTMLTextAreaElement, value: string) { field.value = value; fireEvent.input(field); }
const pointerPackets = () => calls.sent.filter(p => p[0] === 5).map(p => ({ mask: p[1], x: (p[2] << 8) | p[3], y: (p[4] << 8) | p[5] }));

it('does not send an unfinished Korean syllable and sends each completed one once', async () => {
  const field = await openKeyboard();
  fireEvent.compositionStart(field);
  type(field, '한');
  expect(calls.key).not.toHaveBeenCalled();
  fireEvent.compositionEnd(field);
  await waitFor(() => expect(calls.key.mock.calls).toEqual([[0x100d55c]]));
  expect(field.value).toBe('');
  fireEvent.compositionStart(field);
  type(field, '글');
  fireEvent.compositionEnd(field);
  await waitFor(() => expect(calls.key.mock.calls).toEqual([[0x100d55c], [0x100ae00]]));
});

it('sends plain typing straight away and Enter and Backspace as keys', async () => {
  const field = await openKeyboard();
  type(field, 'a');
  expect(calls.key.mock.calls).toEqual([[97]]);
  fireEvent.keyDown(field, { key: 'Enter' });
  fireEvent.keyDown(field, { key: 'Backspace' });
  expect(calls.key.mock.calls.slice(1)).toEqual([[0xff0d], [0xff08]]);
});

it('applies a tapped modifier chip to the next key only', async () => {
  const field = await openKeyboard();
  fireEvent.click(screen.getByRole('button', { name: /^Command 키/ }));
  type(field, 'c');
  expect(calls.key.mock.calls).toEqual([[0xffe7, undefined, true], [99], [0xffe7, undefined, false]]);
  calls.key.mockClear();
  type(field, 'd');
  expect(calls.key.mock.calls).toEqual([[100]]);
});

it('keeps a modifier held after a second tap until it is tapped off', async () => {
  const field = await openKeyboard();
  const chip = () => screen.getByRole('button', { name: /^Shift 키/ });
  fireEvent.click(chip()); fireEvent.click(chip());
  expect(chip().getAttribute('aria-label')).toContain('고정');
  type(field, 'a'); type(field, 'b');
  expect(calls.key.mock.calls.filter(c => c[0] === 0xffe1 && c[2] === true)).toHaveLength(2);
  fireEvent.click(chip());
  expect(chip().getAttribute('aria-label')).toContain('꺼짐');
});

it('sends shortcut buttons with their modifiers around the key', async () => {
  await openKeyboard();
  fireEvent.click(screen.getByRole('button', { name: '⌘V 붙여넣기' }));
  expect(calls.key.mock.calls).toEqual([[0xffe7, undefined, true], [0x76], [0xffe7, undefined, false]]);
  calls.key.mockClear();
  fireEvent.click(screen.getByRole('button', { name: '⌘Tab 앱 전환' }));
  expect(calls.key.mock.calls).toEqual([[0xffe7, undefined, true], [0xff09], [0xffe7, undefined, false]]);
  calls.key.mockClear();
  fireEvent.click(screen.getByRole('button', { name: '왼쪽 방향키' }));
  expect(calls.key.mock.calls).toEqual([[0xff51]]);
});

it('gamepad: holding L sends a pressed left button and releasing sends none; drag lock keeps it down', async () => {
  await setup();
  fireEvent.click(screen.getByRole('button', { name: '게임패드' }));
  const left = screen.getByRole('button', { name: '좌클릭' });
  fireEvent.pointerDown(left, { pointerId: 1 });
  expect(pointerPackets().at(-1)?.mask).toBe(1);
  fireEvent.pointerUp(left, { pointerId: 1 });
  expect(pointerPackets().at(-1)?.mask).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: /드래그 잠금/ }));
  expect(pointerPackets().at(-1)?.mask).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: /드래그 잠금/ }));
  expect(pointerPackets().at(-1)?.mask).toBe(0);
});

it('gamepad: right button and scroll buttons use the right mask bits', async () => {
  await setup();
  fireEvent.click(screen.getByRole('button', { name: '게임패드' }));
  const right = screen.getByRole('button', { name: '우클릭' });
  fireEvent.pointerDown(right, { pointerId: 2 }); fireEvent.pointerUp(right, { pointerId: 2 });
  expect(pointerPackets().map(p => p.mask).slice(-2)).toEqual([4, 0]);
  fireEvent.pointerDown(screen.getByRole('button', { name: '아래로 스크롤' }), { pointerId: 3 });
  fireEvent.pointerUp(screen.getByRole('button', { name: '아래로 스크롤' }), { pointerId: 3 });
  expect(pointerPackets().map(p => p.mask).slice(-2)).toEqual([16, 0]);
});

it('remembers settings on this device', async () => {
  await setup();
  fireEvent.click(screen.getByRole('button', { name: '게임패드' }));
  fireEvent.click(screen.getByRole('button', { name: '설정' }));
  fireEvent.click(screen.getByRole('button', { name: '직접 터치' }));
  fireEvent.click(screen.getByRole('button', { name: '크게' }));
  await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ mode: 'touch', pad: true, cursorSize: 'l' }));
});

it('draws a single pointer of the chosen size', async () => {
  await setup();
  const root = screen.getByRole('region');
  expect(root.style.getPropertyValue('--rd-cursor-size')).toBe('1.25rem');
  fireEvent.click(screen.getByRole('button', { name: '설정' }));
  fireEvent.click(screen.getByRole('button', { name: '작게' }));
  await waitFor(() => expect(root.style.getPropertyValue('--rd-cursor-size')).toBe('0.9rem'));
  expect(root.querySelectorAll('.remote-cursor')).toHaveLength(1);
});
