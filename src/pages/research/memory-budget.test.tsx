import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_BUDGET } from './designerModel';
import { ValidatePanel } from './components/ValidatePanel';

afterEach(cleanup);
it('new experiments do not silently request a memory limit', () => {
  expect(DEFAULT_BUDGET).not.toHaveProperty('max_memory_mb');
});
it('shows an explicit unmonitored state when no RSS threshold is requested', () => {
  render(<ValidatePanel pending={false} budget={{ max_runs: 1, max_total_seconds: 30 }} stale={false} localErrors={[]} />);
  expect(screen.getByText(/모델 자식 RSS 감시 꺼짐/)).toBeTruthy();
});
it('treats a stored null threshold as monitoring disabled', () => {
  render(<ValidatePanel pending={false} budget={{ max_runs: 1, max_total_seconds: 30, max_memory_mb: null }} stale={false} localErrors={[]} />);
  expect(screen.getByText(/모델 자식 RSS 감시 꺼짐/)).toBeTruthy();
});

vi.mock('../../api/client', () => ({ researchRequest: vi.fn(), contentBlob: vi.fn(), downloadLink: vi.fn(), moveArtifact: vi.fn(), apiUrl: (p: string) => p }));
vi.mock('../../shell/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
it('sends an explicit threshold and removes it when the field is cleared', async () => {
  const { setup, mount } = await import('./testkit');
  const { researchRequest } = await import('../../api/client');
  setup();
  mount('/research?view=designer&study=s1&method=bm25');
  const input = await screen.findByLabelText('모델 자식 RSS 중단 기준 (MiB, 선택)');
  fireEvent.change(input, { target: { value: '128' } });
  const latestBudget = () => {
    const requests = vi.mocked(researchRequest).mock.calls.filter(c => c[0] === '/experiments/validate');
    return (requests.at(-1)?.[1] as { budget?: { max_memory_mb?: number } } | undefined)?.budget;
  };
  await waitFor(() => expect(latestBudget()?.max_memory_mb).toBe(128), { timeout: 3000 });
  fireEvent.change(input, { target: { value: '' } });
  await waitFor(() => expect(JSON.stringify(latestBudget())).not.toContain('max_memory_mb'), { timeout: 3000 });
});
it('rejects explicit RSS thresholds against a server without the guard contract', async () => {
  const { researchRequest } = await import('../../api/client');
  const { validateExperiment } = await import('./api');
  const { buildPayload, initialDesign } = await import('./designerModel');
  const payload = buildPayload('s1', [], { ...initialDesign, adapterId: 'tts_synthesis', budget: { max_runs: 1, max_total_seconds: 30, max_memory_mb: 128 } }, []);
  vi.mocked(researchRequest).mockResolvedValue({ valid: true, resource_estimate: { estimated_seconds: 1, estimated_memory_mb: 512 } });
  const legacy = await validateExperiment(payload);
  expect(legacy.valid).toBe(false);
  expect(legacy.errors.join()).toContain('RSS 감시 지원을 확인할 수 없습니다');
  vi.mocked(researchRequest).mockResolvedValue({ valid: true, resource_estimate: { estimated_seconds: 1, estimated_memory_mb: 512, memory_budget_contract: 1 } });
  expect((await validateExperiment(payload)).valid).toBe(true);
});
