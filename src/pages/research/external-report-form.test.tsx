import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ExternalReportForm } from './components/ExternalReportForm';
import { addExternalReport } from './api';
import type { Configuration } from './types';

vi.mock('./api', () => ({ addExternalReport: vi.fn().mockResolvedValue({}), errorText: String }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount() {
  render(<QueryClientProvider client={new QueryClient()}><ExternalReportForm experimentId="e1" configurations={[{ id: 'c1', label: 'A' } as Configuration]} /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText('측정 환경'), { target: { value: 'Synthetic fixture; no hardware measurement' } });
  fireEvent.change(screen.getByLabelText('지표'), { target: { value: 'decode_tps' } });
  fireEvent.change(screen.getByLabelText('값'), { target: { value: '1' } });
}

it('requires a title and locator for an external benchmark and sends both without inventing provenance', async () => {
  mount();
  const submit = screen.getByRole('button', { name: '외부 결과 등록' });
  expect(submit).toHaveProperty('disabled', true);
  fireEvent.change(screen.getByLabelText('출처 제목'), { target: { value: ' Synthetic UI fixture ' } });
  expect(submit).toHaveProperty('disabled', true);
  fireEvent.change(screen.getByLabelText('출처 URL 또는 위치'), { target: { value: ' https://example.invalid/ui-fixture#table-1 ' } });
  fireEvent.click(submit);
  await waitFor(() => expect(addExternalReport).toHaveBeenCalledOnce());
  expect(vi.mocked(addExternalReport).mock.calls[0][1]).toMatchObject({ provenance: 'external_benchmark', source_title: 'Synthetic UI fixture', source_url: 'https://example.invalid/ui-fixture#table-1' });
});

it('keeps manual evaluation source-free and does not forward stale benchmark attribution', async () => {
  mount();
  fireEvent.change(screen.getByLabelText('출처 제목'), { target: { value: 'stale fixture title' } });
  fireEvent.change(screen.getByLabelText('출처 URL 또는 위치'), { target: { value: 'https://example.invalid/stale' } });
  fireEvent.click(screen.getByRole('combobox', { name: /결과의 출처/ }));
  fireEvent.click(screen.getByRole('option', { name: '사람이 직접 평가 (청취 점수 등)' }));
  fireEvent.click(screen.getByRole('button', { name: '외부 결과 등록' }));
  await waitFor(() => expect(addExternalReport).toHaveBeenCalledOnce());
  const payload = vi.mocked(addExternalReport).mock.calls[0][1];
  expect(payload.provenance).toBe('manual_evaluation');
  expect(payload).not.toHaveProperty('source_title');
  expect(payload).not.toHaveProperty('source_url');
});
