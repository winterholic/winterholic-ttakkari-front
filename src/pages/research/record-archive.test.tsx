import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { researchRequest } from '../../api/client';
import { getSnapshot } from './api';
import { RecordArchive } from './components/RecordArchive';
import type { Snapshot } from './types';

vi.mock('../../api/client', () => ({ researchRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function page(offset = 0): Snapshot {
  return { study: { id: 's1', title: '페이지 연구', goal: '모든 기록 조회', scope: 'personal', phase: 'planning', version: 1, environment: {}, criteria: [], next_actions: [] }, nodes: [{ id: `n${offset}`, kind: 'hypothesis', title: `기록 ${offset + 1}`, summary: '합성 연구 기록', conditions: {}, details: {}, epistemic_status: 'unverified' }],
    relations: [], experiments: [], timeline: [], evidence: [], truncated: true,
    pagination: { offset, limit: 100, totals: { nodes: 501, relations: 0, experiments: 0, timeline: 0 }, has_more: offset < 500 } };
}
function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RecordArchive studyId="s1" onExperiment={vi.fn()} /></QueryClientProvider>);
  fireEvent.click(screen.getByText('전체 기록 찾아보기'));
}

it('forwards page bounds while preserving the default resume URL', async () => {
  vi.mocked(researchRequest).mockResolvedValue(page());
  await getSnapshot('s1');
  expect(researchRequest).toHaveBeenLastCalledWith('/studies/s1/resume');
  await getSnapshot('s1', { offset: 500, limit: 100 });
  expect(researchRequest).toHaveBeenLastCalledWith('/studies/s1/resume?offset=500&limit=100');
});

it('opens lazily, reaches record 501, and resets the page when the collection changes', async () => {
  vi.mocked(researchRequest).mockImplementation(async path => page(String(path).includes('offset=500') ? 500 : 0));
  mount();
  await screen.findByText('기록 1');
  fireEvent.change(screen.getByLabelText('기록 페이지'), { target: { value: '6' } });
  fireEvent.click(screen.getByRole('button', { name: '이동' }));
  await screen.findByText('기록 501');
  expect(researchRequest).toHaveBeenLastCalledWith('/studies/s1/resume?offset=500&limit=100');
  expect((screen.getByRole('button', { name: '다음 기록' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('기록 종류'), { target: { value: 'timeline' } });
  await screen.findByText('이 종류의 기록이 없습니다.');
  expect((screen.getByLabelText('기록 페이지') as HTMLInputElement).value).toBe('1');
});

it('shows errors with retry and does not claim complete coverage for an older server', async () => {
  vi.mocked(researchRequest).mockRejectedValueOnce(new Error('page unavailable')).mockResolvedValueOnce({ ...page(), pagination: undefined });
  mount();
  await screen.findByText(/page unavailable/);
  fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
  await waitFor(() => expect(screen.getByText(/페이지 정보를 제공하지 않습니다/)).toBeTruthy());
  expect(screen.queryByText('기록 1')).toBeNull();
});
