import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultHandler, mount, runs, setup } from './testkit';

vi.mock('../../shell/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('../../api/client', () => ({ researchRequest: vi.fn(), contentBlob: vi.fn(), downloadLink: vi.fn(), moveArtifact: vi.fn(), apiUrl: (p: string) => p }));
afterEach(cleanup);

describe('실행 소유권 관측', () => {
  it('구버전 응답에서 잠금 부재를 단정하지 않는다', async () => {
    setup();
    mount('/research?view=monitor&study=s1&experiment=e1');
    expect(await screen.findByText('서버에서 실행 소유권 관측 정보를 받지 못했습니다.')).toBeTruthy();
    expect(screen.queryByText('점유 중인 잠금이 없습니다.')).toBeNull();
  });

  it('관측된 실행 소유권과 조회 한계·미확인을 함께 표시한다', async () => {
    setup((path, body) => new URL(path, 'http://x').pathname === '/runs' ? {
      runs,
      active_locks: [{ lock: 'research_execution_owner', run_id: 'r1', evidence: 'os_lock_observed' }],
      lock_observations: { basis: 'execution_owner_os_lock', candidate_limit: 500, truncated: true,
        unverified_run_ids: ['r2'], resource_lock_status: 'unverified' },
    } : defaultHandler(path, body));
    mount('/research?view=monitor&study=s1&experiment=e1');
    expect(await screen.findByText('연구 실행 소유권')).toBeTruthy();
    expect(screen.getByText('소유권 확인 불가 1건.')).toBeTruthy();
    expect(screen.getByText('최근 500개 실행까지만 확인한 결과입니다.')).toBeTruthy();
    expect(screen.getByText('GPU·TTS 자원 점유를 확인한 결과는 아닙니다.')).toBeTruthy();
    expect(screen.queryByText('다른 작업이 끝나야 실행됩니다.')).toBeNull();
  });
});
