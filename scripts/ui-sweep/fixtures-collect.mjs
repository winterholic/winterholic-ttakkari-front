// /collect 화면 검사용 합성 데이터. 긴 제목·긴 주소·보류·예산 대기·일시정지·실패 전달을 한 번에 채워 가로 넘침과 잘림을 본다.
const LONG_URL = 'https://kubernetes.io/ko/docs/concepts/workloads/controllers/deployment/VeryLongUnbrokenSegment_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/';
const LONG_TITLE = '매우 긴 제목의 공식 문서 출처 VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const now = '2026-10-23T08:00:00Z';
const budget = {
  day: '2026-10-23', timezone: 'Asia/Seoul', teacher_enabled: false, unsettled: 1,
  tokens: { limit: 60000, used: 4000, remaining: 56000 }, calls: { limit: 20, used: 2, remaining: 18 },
  micro_usd: { limit: 1000000, used: 1000, remaining: 999000 }, per_job: { tokens: 12000, calls: 4, micro_usd: 200000 },
  pages: { limit: 500, reserved: 36 },
};
const source = (i) => ({
  id: `src${i}`, title: LONG_TITLE + i, source_key: `pilot:long-${i}`, scope: 'personal', seeds: [LONG_URL], enabled: i !== 2, auto_import: i !== 1,
  interval_minutes: 1440, next_run_at: now, last_job_id: null, version: 1, request: { profile: 'tech_docs', max_pages: 10, max_depth: 0 },
  policy: { license_id: 'CC-BY-4.0', policy_url: LONG_URL, basis: '확인한 근거 '.repeat(20), checked_at: now, permissions: { store: 'allowed', knowledge: 'allowed', export: 'allowed', train: 'unknown' } },
  last_error: i === 2 ? 'daily collection page budget reached' : null,
});
const job = (i, status) => ({
  job_id: `job${i}`, source_key: `pilot:long-${i}`, status, stage: 'process', created_at: now, attempts: 1, cancel_requested: false,
  last_error: status === 'budget_wait' ? { code: 'fetch_deferred', detail: 'robots_unreachable' } : null, cursor: { counts: { accepted: 3 }, processed: 3 },
});
const review = (i) => ({
  id: `it${i}`, url: LONG_URL + i, source_key: 'pilot:long-1', status: i % 2 ? 'held' : 'accepted', reason_codes: ['l0_too_short', 'news_stale'], language: 'ko',
  text_chars: 1200 + i, preview: '검토할 본문 미리보기 '.repeat(30), signals: {},
});

export function collect(path, method, search) {
  const q = new URLSearchParams(search ?? '');
  const p = path.replace(/^assistant\/collect\/?/, '');
  if (p === 'summary') return {
    funnel: { discovered: 2, fetched: 26, extracted: 24, accepted: 23, held: 1, blocked: 0, failed: 1, not_modified: 8, delivered: 15, awaiting_delivery: 3, awaiting_review: 9 },
    jobs: { succeeded: 3, budget_wait: 1 }, outbox: { pending: 3 },
    waiting: [{ job_id: 'job9', status: 'budget_wait', source_key: 'pilot:long-9', not_before: now, reason: 'fetch_deferred' },
      { job_id: 'job8', status: 'retry_wait', source_key: 'pilot:' + 'x'.repeat(80), not_before: null, reason: null }],
    runtime: { loop_available: true, paused: q.get('paused') === '1', reason: 'owner', since: now }, budget, daily_page_cap: 500,
  };
  if (p === 'runtime') return { loop_available: true, general_consume_enabled: false, paused: false, reason: null, since: null,
    pilot: { seeded: ['pilot:a'], rights_checked_at: now }, pilot_enabled: true, ml_spending_enabled: false };
  if (p === 'budgets') return budget;
  if (p === 'sources') return { items: [1, 2, 3].map(source), runtime_enabled: true, daily_page_cap: 500, ml_spending_enabled: false };
  if (p === 'jobs') return { jobs: [job(1, 'succeeded'), job(2, 'budget_wait'), job(3, 'failed')], next_cursor: null };
  if (p.startsWith('jobs/') && p.endsWith('/items')) return { items: [], total: 0, limit: 30, offset: 0 };
  if (p === 'review') return { items: [1, 2, 3].map(review), total: 3, limit: 20, offset: 0 };
  if (p.startsWith('items/')) return { id: 'it1', url: LONG_URL, final_url: LONG_URL, status: 'held', stage: 'decide', http_status: 200, language: 'ko', text_chars: 1201,
    reason_codes: [], preview: '', decision: { state: 'hold', reason_codes: ['l0_too_short'] }, quality: null, versions: { parser: 'trafilatura-2', normalizer: 'nfc-1' },
    hashes: { raw_sha256: 'a'.repeat(64), text_sha256: 'b'.repeat(64), payload: null }, rights: { license_id: 'CC-BY-4.0', purposes: ['store', 'knowledge', 'export'] }, reviews: [], deliveries: [] };
  if (p === 'deliveries') return { items: [
    { outbox_id: 'o1', job_id: 'job1', sink: 'export', status: 'failed', attempts: 5, not_before: null, last_error: 'transient:OSError ' + 'x'.repeat(60), created_at: now, delivered_at: null, outcome: null },
    { outbox_id: 'o2', job_id: 'job1', sink: 'export', status: 'delivered', attempts: 0, not_before: null, last_error: null, created_at: now, delivered_at: now, outcome: 'imported' },
  ], total: 2, limit: 30, offset: 0 };
  if (p === 'quality') return { reviewed_items: 4, accepted: 3, rejected: 1, factuality: 'unmeasured', teacher_enabled: false, model: null };
  return undefined;
}
