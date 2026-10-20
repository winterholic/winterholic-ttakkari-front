import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { researchRequest } from '../api/client';
import { ResearchPage } from './ResearchPage';

vi.mock('../shell/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('../api/client', () => ({ researchRequest: vi.fn() }));

function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><ResearchPage /></MemoryRouter>
  </QueryClientProvider>);
}

describe('Research Lab', () => {
  it('shows an empty state with an actionable create form', async () => {
    vi.mocked(researchRequest).mockResolvedValue([]);
    mount();
    expect(await screen.findByText('첫 연구를 시작하세요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '새 연구' }));
    expect(screen.getByLabelText('연구 목표')).toBeTruthy();
  });

  it('renders source reports separately from measurements and restores next actions', async () => {
    vi.mocked(researchRequest).mockImplementation(async (path) => {
      if (path === '/studies') return [{ id: 's1', title: 'RAG 품질', goal: '검색 개선', phase: 'paused', version: 1, environment: {}, criteria: [], next_actions: ['실패 원인 점검'] }];
      return { study: { id: 's1', title: 'RAG 품질', goal: '검색 개선', phase: 'paused', version: 1, environment: {}, criteria: [], next_actions: ['실패 원인 점검'] },
        nodes: [{ id: 'n1', kind: 'claim', title: '논문 속 주장', summary: '저자가 보고한 효과', epistemic_status: 'source_reported', conditions: {}, details: {} }],
        relations: [], experiments: [], timeline: [], evidence: [], truncated: false };
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /RAG 품질/ }));
    expect(await screen.findByText('실패 원인 점검')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '지식·근거' }));
    expect(await screen.findByText('원문 보고')).toBeTruthy();
    expect(screen.getByText('논문 속 주장')).toBeTruthy();
  });

  it('surfaces a failed load and allows retry', async () => {
    vi.mocked(researchRequest).mockRejectedValue(new Error('연결 실패'));
    mount();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('연결 실패'));
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy();
  });
});
