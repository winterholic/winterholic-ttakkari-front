import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RemoteSession } from './RemoteSession';

const calls = vi.hoisted(() => ({ key: vi.fn(), disconnect: vi.fn(), autoConnect: true, autoOpen: true, rfb: null as EventTarget | null }));
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
    calls.rfb = this;
    if (calls.autoConnect) queueMicrotask(() => this.dispatchEvent(new Event('connect')));
  }
  blur() {}
  disconnect = calls.disconnect;
  sendKey = calls.key;
} }));
class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    Socket.instances.push(this);
    if (calls.autoOpen) queueMicrotask(() => { this.readyState = 1; this.onopen?.(); });
  }
  send(value: unknown) { if (typeof value === 'string') queueMicrotask(() => this.onmessage?.({ data: 'ready' })); }
  close() { this.readyState = 3; }
}
beforeEach(() => { vi.clearAllMocks(); Socket.instances = []; calls.autoConnect = true; calls.autoOpen = true; calls.rfb = null; vi.stubGlobal('WebSocket', Socket); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function setup() {
  render(<StrictMode><RemoteSession device={{ id: 'mac', name: 'Mac', host: '127.0.0.1', port: 5900 }} initialPermit={permit} credentials={{ username: 'fixture', password: 'fixture' }} onExit={() => {}} /></StrictMode>);
  await screen.findByText('연결됨');
  fireEvent.click(screen.getByRole('button', { name: '키보드' }));
  return screen.getByRole('textbox', { name: 'Mac에 입력할 글' });
}
it('does not transmit incomplete Korean composition and sends each completed character once', async () => {
  const input = await setup();
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: '한글' } });
  fireEvent.click(screen.getByRole('button', { name: '글 보내기' }));
  expect(calls.key).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  fireEvent.click(screen.getByRole('button', { name: '글 보내기' }));
  expect(calls.key.mock.calls).toEqual([[0x100d55c], [0x100ae00]]);
  expect((input as HTMLTextAreaElement).value).toBe('');
});
it('applies a selected modifier only to the next key and releases it before continuing text', async () => {
  const input = await setup();
  fireEvent.click(screen.getByText('특수 키'));
  fireEvent.click(screen.getByRole('button', { name: '⌘ Cmd' }));
  fireEvent.change(input, { target: { value: 'ab' } });
  fireEvent.click(screen.getByRole('button', { name: '글 보내기' }));
  expect(calls.key.mock.calls).toEqual([[0xffe7, undefined, true], [97], [0xffe7, undefined, false], [98]]);
});
it('names the Mac account and screen sharing check when the handshake drops before connect', async () => {
  calls.autoConnect = false;
  render(<StrictMode><RemoteSession device={{ id: 'mac', name: 'Mac', host: '127.0.0.1', port: 5900 }} initialPermit={permit} credentials={{ username: 'fixture', password: 'fixture' }} onExit={() => {}} /></StrictMode>);
  await vi.waitFor(() => expect(calls.rfb).not.toBeNull());
  calls.rfb!.dispatchEvent(new Event('disconnect'));
  await screen.findByText(/Mac 화면 열기에 실패했습니다/);
});
it('names the server connection check when the socket closes before ready', async () => {
  calls.autoOpen = false;
  render(<StrictMode><RemoteSession device={{ id: 'mac', name: 'Mac', host: '127.0.0.1', port: 5900 }} initialPermit={permit} credentials={{ username: 'fixture', password: 'fixture' }} onExit={() => {}} /></StrictMode>);
  await vi.waitFor(() => expect(Socket.instances.length).toBeGreaterThan(0));
  Socket.instances.at(-1)!.onclose!({ code: 1006, reason: '' });
  await screen.findByText(/서버와의 연결이 끊겼습니다/);
});
