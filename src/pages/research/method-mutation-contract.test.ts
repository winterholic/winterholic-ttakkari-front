import { afterEach, expect, it, vi } from 'vitest';
import { researchRequest } from '../../api/client';
import { createMethod, patchMethod, promoteMethod, setResearchScope } from './api';
import type { MethodInput } from './types';

vi.mock('../../api/client', () => ({ researchRequest: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); setResearchScope('personal'); });

it.each(['create', 'patch', 'promote'] as const)('%s returns server-computed readiness from a fresh detail read', async operation => {
  setResearchScope('work');
  vi.mocked(researchRequest).mockResolvedValueOnce({ id: 'm1', slug: 'new-method', lifecycle_status: 'hypothesis' });
  vi.mocked(researchRequest).mockResolvedValueOnce({ id: 'm1', slug: 'new-method', execution_status: 'hypothesis_stage', unavailable_reason: '실행 프로토콜 미정', parameters: [], relations: [] });
  const result = operation === 'create' ? await createMethod({} as MethodInput)
    : operation === 'patch' ? await patchMethod('m1', { summary: 'changed' })
    : await promoteMethod('m1', { run_id: 'r1', decision_note: 'manual fixture', target_status: 'candidate' });
  expect(result.execution_status).toBe('hypothesis_stage');
  expect(result.unavailable_reason).toBe('실행 프로토콜 미정');
  expect(vi.mocked(researchRequest).mock.calls[1][0]).toBe('/methods/m1?scope=work');
});
