import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { researchRequest } from '../../api/client';
import { reviewCatalog } from './api';
import { CatalogReview } from './components/CatalogReview';

vi.mock('../../api/client', () => ({ researchRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const result = { selection_contract: 1, candidate_source: 'catalog', truncated: false, candidates: [{
  id: 'm1', method_id: 'm1', slug: 'node-free', title: '노트 없는 방법', eligibility: 'needs_review',
  execution_status: 'hypothesis_stage', is_executable: false, unavailable_reason: '프로토콜 구체화 필요',
  reason: { conditions: { missing: ['dataset'], mismatches: [] }, cost_seconds: null,
    research_context: { truncated: false, relations: [{ affects_selection: true }], failures: [{
      run_id: 'r1', experiment_id: 'e1', study_id: 'source', error_code: 'KeyError', error_message: '원래 오류', affects_selection: true,
    }] } },
}] };

it('requires catalog contract and forwards the explicit selection source', async () => {
  vi.mocked(researchRequest).mockResolvedValueOnce({ candidates: [] });
  await expect(reviewCatalog('s1', 'cache')).rejects.toThrow(/카탈로그 검토/);
  vi.mocked(researchRequest).mockResolvedValueOnce(result);
  await reviewCatalog('s1', 'cache');
  expect(researchRequest).toHaveBeenLastCalledWith('/studies/s1/select', { candidate_source: 'catalog', query: 'cache', budget_seconds: 60 });
});

it('opens on demand and distinguishes investigation priority from host readiness and failures', async () => {
  vi.mocked(researchRequest).mockResolvedValue(result);
  const onMethod = vi.fn(), onFailure = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <CatalogReview studyId="s1" query="cache" onMethod={onMethod} onFailure={onFailure} />
  </QueryClientProvider>);
  expect(researchRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '현재 연구에 맞춰 검토' }));
  fireEvent.click(await screen.findByText(/노트 없는 방법/));
  expect(screen.getByText(/dataset/)).toBeTruthy();
  expect(screen.getByText(/실행 비용 미측정/)).toBeTruthy();
  expect(screen.getByText(/원래 오류/)).toBeTruthy();
  expect(screen.getByText(/검토 필요/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '방법 상세' }));
  expect(onMethod).toHaveBeenCalledWith('node-free');
  fireEvent.click(screen.getByRole('button', { name: '실패 기록 보기' }));
  expect(onFailure).toHaveBeenCalledWith('source', 'e1', 'r1');
});

it('prevents anonymous study selection and reports API errors', async () => {
  const { rerender } = render(<CatalogReview studyId={null} query="" onMethod={vi.fn()} onFailure={vi.fn()} />);
  expect((screen.getByRole('button', { name: '현재 연구에 맞춰 검토' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/연구를 선택/)).toBeTruthy();
  vi.mocked(researchRequest).mockRejectedValue(new Error('검토 서버 오류'));
  rerender(<CatalogReview studyId="s1" query="" onMethod={vi.fn()} onFailure={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '현재 연구에 맞춰 검토' }));
  expect((await screen.findByRole('alert')).textContent).toContain('검토 서버 오류');
});

it('explains deployment lag without hiding an actual budget validation error', async () => {
  vi.mocked(researchRequest).mockRejectedValueOnce({ status: 422, errors: [{ loc: ['body', 'candidate_source'], msg: 'Extra inputs are not permitted' }] });
  await expect(reviewCatalog('s1', '')).rejects.toThrow(/서버 업데이트/);
  const invalidBudget = { status: 422, errors: [{ loc: ['body', 'budget_seconds'], msg: 'Invalid value' }] };
  vi.mocked(researchRequest).mockRejectedValueOnce(invalidBudget);
  await expect(reviewCatalog('s1', '', 0)).rejects.toBe(invalidBudget);
});
