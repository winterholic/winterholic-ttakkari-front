import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { RemoteDesktopPage } from './RemoteDesktopPage';
import * as api from '../api/client';

vi.mock('../shell/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('../api/client', () => ({ listRemoteMacs: vi.fn(), connectRemoteMac: vi.fn(), registerRemoteMac: vi.fn(), disconnectRemoteMac: vi.fn(), apiUrl: (p: string) => `http://localhost${p}` }));
vi.mock('@novnc/novnc', () => ({ default: class extends EventTarget { disconnect() {} } }));
afterEach(cleanup);
function setup() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RemoteDesktopPage /></QueryClientProvider>);
}
it('requires explicit owner authorization before opening a Mac and never labels an unprobed Mac connected', async () => {
  vi.mocked(api.listRemoteMacs).mockResolvedValue({ devices: [{ id: 'mac-studio', name: 'Mac Studio', host: '127.0.0.1', port: 5900 }] });
  setup();
  await screen.findByRole('button', { name: 'Mac Studio에 접속' });
  expect(screen.queryByText('연결됨')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Mac Studio에 접속' }));
  expect(api.connectRemoteMac).not.toHaveBeenCalled();
  expect(screen.getByLabelText('따까리 비밀번호')).toBeTruthy();
  expect(screen.getByLabelText('Mac 계정 이름')).toBeTruthy();
});
it('shows actionable errors without hiding setup instructions', async () => {
  vi.mocked(api.listRemoteMacs).mockRejectedValue(new Error('서버에 연결할 수 없습니다.'));
  setup();
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('서버에 연결할 수 없습니다.'));
  expect(screen.getByText('처음 연결하기')).toBeTruthy();
});
