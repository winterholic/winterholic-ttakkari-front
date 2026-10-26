// 레이아웃 검사용 API 스텁. 실제 서버 없이 긴 이름·긴 제목이 들어간 합성 데이터로 화면을 채운다.
// 사용: scripts/ui-sweep/run.sh (dev 서버 + 이 스텁 + 디자인 시스템의 ttakkari-layout.check.mjs)
// 실제 로그인 계정·실제 데이터는 쓰지 않는다. 모르는 경로는 빈 목록 [] 을 돌려 빈 상태 화면도 같이 본다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detail } from './fixtures-detail.mjs';
import { collect } from './fixtures-collect.mjs';
import { github } from './fixtures-github.mjs';
import { research } from './fixtures-research.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const lib = JSON.parse(readFileSync(join(here, 'fixtures-library.json'), 'utf8'));
const sys = JSON.parse(readFileSync(join(here, 'fixtures-system.json'), 'utf8'));

const LONG_NAMES = [
  '내 클로드 (iuholic83@example.com)',
  'Daddy codex(hyeonmin@example.com)',
  '하이페이지 FDE (fde@hyperez.io)',
  '추가할 매우 긴 회사 계정 이름 (very-long-account-name@example.com)',
  '개인 예비 계정',
  'claude',
];
const accounts = LONG_NAMES.map((name, i) => ({
  id: `a${i + 1}`, name, engine: i % 2 ? 'codex' : 'claude', pool: 'work', enabled: true, work_enabled: true,
  priority: i + 1, work_priority: i + 1, login: 'ok', login_label: null, cooldown_seconds: 0, config_dir: null,
}));
const now = '2026-10-17T00:00:00Z';
const LONG_TITLE = '매우 긴 제목으로 작성된 모바일 작업 공간 세션 VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const session = (id, kind = 'worker', status = 'completed') => ({ id, title: LONG_TITLE, kind, status, pool: 'personal', created_at: now, updated_at: now });
const artifact = (i) => ({
  id: `art${i}`, workspace_id: 'fixture', session_id: 's1', run_id: null,
  filename: `아주 긴 프로젝트 이름의 모바일 검증 보고서와 참고자료_${i}_VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ.md`,
  mime_type: 'text/markdown', kind: 'markdown', source: 'upload', area: 'files', rel_path: 'docs/report.md', storage_mode: 'copy',
  size_bytes: 1024, sha256: '0', preview_status: 'not_required', preview_mime: null, preview_error: null, export_policy: 'allow',
  downloadable: true, retention_until: null, created_at: now,
});
// 실데이터 규모: 보관함 한 쪽(30건) 가득, 알림 148건·여러 날짜, PMS 작업이 네 상태에 고르게 있다. 실기기 결함은 합성 3건짜리 데이터에서는 보이지 않았다.
const dayAgo = (n, h = 12) => new Date(Date.UTC(2026, 9, 17 - n, h - 9, 30)).toISOString();
const realArtifacts = (n) => Array.from({ length: n }, (_, i) => ({
  ...artifact(i + 1),
  filename: i % 7 === 0 ? `resource-history-mobile-${i}.png` : i % 5 === 0 ? `아주 긴 프로젝트 이름의 모바일 검증 보고서와 참고자료_${i}_VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ.md` : `보고서-${i}.md`,
  kind: i % 7 === 0 ? 'image' : 'markdown', mime_type: i % 7 === 0 ? 'image/png' : 'text/markdown', created_at: dayAgo(Math.floor(i / 9), 12 + (i % 9)),
}));
const STATUS_CYCLE = ['todo', 'doing', 'review', 'done'];
export const pmsTask = (i) => ({
  id: `t${i}`, project_id: 'p1', parent_id: null, position: i, depth: 0, wbs: String(i + 1), has_children: false,
  title: i === 3 ? '아주 긴 제목의 작업 VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 칸반 카드 줄바꿈 확인' : `작업 ${i + 1} 칸반 카드 제목`,
  description: '', priority: ['low', 'normal', 'high', 'urgent'][i % 4], assignee: i % 3 ? '민수' : null, status: STATUS_CYCLE[i % 4], progress: i % 4 === 3 ? 100 : i % 4 === 0 ? 0 : 50,
  start_date: '2026-10-01', end_date: '2026-10-20', dates_rollup: false, overdue: i === 2, predecessors: [], created_at: now, updated_at: now, done_at: i % 4 === 3 ? now : null,
});
const project = (i) => ({
  id: `p${i}`, name: `AIP (Application Intent Protocol) 긴 프로젝트 이름 ${i} 그리고 더 긴 부제목`, description: '모바일에서 프로젝트의 긴 이름과 설명이 모두 표시되는지 확인합니다. '.repeat(2),
  scope: 'work', status: 'active', progress: 35, counts: { total: 10, done: 3, todo: 5, doing: 2, review: 0, overdue: 1, due_soon: 0, no_dates: 2 },
  open_notes: 2, start_date: '2026-09-30', end_date: '2026-12-31', members: ['민수', '아주긴이름의담당자이름'], next_milestone: null, created_at: now, updated_at: now,
});
const memo = (i) => ({
  id: `memo${i}`, title: '모바일에서 긴 제목과 여러 태그가 있는 메모를 확인해요 ' + i, excerpt: '긴 본문 미리보기와 목록의 넘침을 검증합니다. '.repeat(3),
  tags: ['아주긴프로젝트태그이름', '모바일개선'], category_id: 'cat', pinned: i === 1, source: 'user', rev: 1, created_at: now, updated_at: now, body: '본문',
});
const meeting = (i) => ({
  id: `m${i}`, title: 'AIP 프로젝트의 회의록과 모바일에서 긴 제목 확인 ' + i, scope: 'personal', status: 'review', project: { id: 'p1', name: 'PMS 긴 프로젝트 이름' },
  held_at: now, created_at: now, updated_at: now, source: 'text', participants: ['민수'], summary: '프로젝트 진행과 다음 단계를 검토합니다.',
  counts: { discussion: 1, decision: 2, action: 3, open_issue: 1, pending_proposals: 1 },
});

export function body(path, method, search) {
  const q = new URLSearchParams(search ?? '');
  const rs = research(path, method, search);
  if (rs !== undefined) return rs;
  const d = detail(path, method);
  if (d !== undefined) return d;
  const g = github(path, search);
  if (g !== undefined) return g;
  const c = path.startsWith('assistant/collect') ? collect(path, method, search) : undefined;
  if (c !== undefined) return c;
  if (path === 'auth/refresh') return { access_token: 'fixture', expires_in: 900, token_type: 'bearer' };
  if (path === 'auth/me') return { id: 'u1', name: '테스트', role: 'owner' };
  if (path === 'health') return { ok: true };
  if (path === 'tasks/active') return { roots: [], nodes: [] };
  if (path === 'accounts') return accounts;
  const usageOne = path.match(/^accounts\/([^/]+)\/usage$/);
  if (path === 'accounts/usage' || path === 'accounts/usage/cached' || usageOne) {
    const rows = [
      {
        id: 'a1', name: '내 클로드 (iuholic83@example.com)', engine: 'claude', pool: 'personal', enabled: true, rank: 1,
        max_used_percent: 38, remaining_to_limit_percent: 62, stale: false, work_enabled: true, work_rank: 1, login: 'ok',
        cooldown_seconds: 0, windows: [{ key: '5h', label: '5시간 한도', percent: 38, resets_at: Math.floor(Date.now() / 1000) + 7200 }],
        source: 'api', plan: 'Team', error: null, updated_at: Math.floor(Date.now() / 1000),
      },
      {
        id: 'a2', name: 'Daddy codex (hyeonmin@example.com)', engine: 'codex', pool: 'personal', enabled: true, rank: 2,
        max_used_percent: 15, remaining_to_limit_percent: 85, stale: false, work_enabled: true, work_rank: 2, login: 'ok',
        cooldown_seconds: 0, windows: [{ key: '5h', label: '5시간 한도', percent: 15, resets_at: Math.floor(Date.now() / 1000) + 11000 }],
        source: 'session_log', plan: 'Plus', error: null, updated_at: Math.floor(Date.now() / 1000),
      },
      {
        id: 'a3', name: 'Antigravity Workspace', engine: 'antigravity', pool: 'personal', enabled: true, rank: 3,
        max_used_percent: 45, remaining_to_limit_percent: 55, stale: false, work_enabled: false, work_rank: null, login: 'ok',
        cooldown_seconds: 0, windows: [{ key: 'agy_gemini_models_flash', label: 'Flash Quota', percent: 45, resets_at: Math.floor(Date.now() / 1000) + 14400 }],
        source: 'antigravity_cli', plan: 'Standard', error: null, updated_at: Math.floor(Date.now() / 1000),
      },
    ];
    return usageOne ? rows.find((r) => r.id === usageOne[1]) : rows;
  }
  if (path === 'accounts/qwen-flash-usage') {
    return {
      model: 'qwen2.5-coder:7b',
      observed_at: now,
      collection_started_at: '2026-10-17T00:00:00+09:00',
      server: { status: 'running', detail: null },
      metrics_status: 'available',
      requests_processing: 0,
      requests_deferred: 0,
      today: { starts_at: '2026-10-17T00:00:00+09:00', ends_at: '2026-10-18T00:00:00+09:00', input_tokens: 158400, cached_input_tokens: 42000, output_tokens: 89200, total_tokens: 247600, last_used_at: now },
      week: { starts_at: '2026-10-12T00:00:00+09:00', ends_at: '2026-10-19T00:00:00+09:00', input_tokens: 984000, cached_input_tokens: 280000, output_tokens: 542000, total_tokens: 1526000, last_used_at: now },
    };
  }
  if (path === 'accounts/qwen-usage') {
    const period = (starts_at, ends_at, calls, input_tokens, output_tokens) => ({
      starts_at, ends_at, calls, metered_calls: calls, usage_missing_calls: 0, failed_calls: 0, unmetered_calls: 0,
      input_tokens, output_tokens, total_tokens: input_tokens + output_tokens, last_used_at: now,
    });
    return {
      model: 'qwen2.5-coder:0.5b',
      timezone: 'Asia/Seoul',
      collection_started_at: '2026-10-17T00:00:00+09:00',
      server: { enabled: true, status: 'running', detail: null },
      today: period('2026-10-17T00:00:00+09:00', '2026-10-18T00:00:00+09:00', 56, 285000, 142000),
      week: period('2026-10-12T00:00:00+09:00', '2026-10-19T00:00:00+09:00', 312, 1520000, 780000),
    };
  }
  if (path === 'accounts/override') return { active: true, ids: ['a1', 'a2', 'a3'], until: '2099-10-14T00:00:00Z' };
  if (path === 'push/status') return { configured: false, enabled: false };
  if (path === 'workspaces/default') return { id: 'fixture', name: '테스트', root_path: '/tmp/fixture', extra_writable_roots: [] };
  if (path.startsWith('assistant/library') && path.endsWith('/overview')) return lib.overview;
  if (path.startsWith('assistant/library') && path.endsWith('/tree')) return lib.tree;
  if (path.startsWith('assistant/library') && path.endsWith('/quality')) return lib.quality;
  if (path === 'assistant/library/graph') return sys.graph;
  if (path === 'memo-categories') return { categories: [{ id: 'cat', name: '매우 긴 프로젝트 카테고리', color: 'blue', position: 0, count: 2 }], total: 2, uncategorized: 0 };
  if (path === 'memos/tags') return { tags: [{ name: '모바일개선', count: 1 }, { name: '아주긴프로젝트태그이름', count: 2 }] };
  if (path === 'memos' && method === 'GET') return { memos: [memo(1), memo(2)] };
  if (path.startsWith('memos/memo')) return memo(1);
  if (path === 'artifacts') return realArtifacts(Number(q.get('limit') ?? 30));
  if (/^sessions\/[^/]+\/runs/.test(path)) return [];
  if (path === 'runs/failed') return { items: [], next_before: null, next_before_id: null };
  if (path === 'checklists') return { day: '2026-10-17', items: [{ id: 'c1', day: '2026-10-17', title: '아주 긴 체크리스트 항목 제목 VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ', checked: false, template_id: null }], completed: 0, total: 1 };
  if (path === 'checklists/templates') return { templates: [{ id: 't1', title: '매일 반복하는 아주 긴 템플릿 제목' }] };
  if (path === 'system/resources/history') return { range: '24h', from: now, to: now, bucket_seconds: 600, points: [] };
  if (path === 'meetings/providers') return { default_provider: 'local_whisper', providers: [] };
  if (path === 'sessions') return [session('s1'), session('s2', 'desk', 'running')];
  if (path.startsWith('sessions/')) return session('s1');
  if (path === 'system/resources') return sys.resources;
  if (path === 'assistant/status') return { ready: true, counts: { memories: 4, entities: 5, documents: 12 }, brief: '레이아웃 검증' };
  if (path === 'assistant/instructions') return { text: '테스트 지침', is_default: false };
  if (path === 'system/info') return { engines: [], default_engine: 'auto', writable_roots: [], version: 'test' };
  if (path.startsWith('workspaces/') && path.endsWith('/files')) {
    return { rel_path: '.', entries: [{ name: '긴 이름의 파일과 모바일 화면 검증자료_VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ.md', rel_path: 'mobile.md', type: 'file', size_bytes: 2048, mtime: now }], truncated: false };
  }
  if (path === 'meetings') return { meetings: [meeting(1), meeting(2)] };
  // 맥락 도서관 '근거·검토' 탭. 이전 스텁에는 없어 이 탭이 화면을 그리다 멈췄고(counts 없음) 한 번도 검사되지 않았다.
  if (path === 'assistant/knowledge/status') return { scope: q.get('scope') ?? 'all', counts: { revisions: 349, units: 5175, assertion_states: { candidate: 193, accepted: 15 } } };
  if (path === 'assistant/knowledge/assertions') {
    const item = (i) => ({
      id: `as${i}`, version: 1, subject: `프로젝트 ${i} 아주 긴 주어 VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ`, predicate: 'depends_on', object: '또 다른 긴 대상 이름', state: 'candidate',
      review_level: 'agent_checked', modality: 'fact', polarity: true, valid_from: null, valid_to: null,
      evidence: [{ id: `ev${i}`, revision_id: 'rev1', quote: '긴 인용문이 들어가는 근거입니다. '.repeat(3), speaker: '사용자', locator: 'work-history/2026-10-17.md#L12', revision_sha256: 'abc', start: 0, end: 40, event_time: null, active_branch: null }], history: [],
    });
    return { items: Array.from({ length: 6 }, (_, i) => item(i)) };
  }
  if (/^pms\/projects\/[^/]+\/tasks$/.test(path)) return { tasks: Array.from({ length: 14 }, (_, i) => pmsTask(i)) };
  if (/^pms\/projects\/[^/]+$/.test(path)) return project(1);
  if (path === 'pms/projects') return { projects: [project(1), project(2)] };
  if (path === 'clovanote/status') return { state: 'unconfigured', message: '테스트', notes: 0, active_jobs: 0, login: { state: 'idle' } };
  if (path === 'clovanote/jobs') return { jobs: [] };
  if (path === 'clovanote/notes') return { notes: [] };
  if (path === 'calendar/events') return { events: [] };
  if (path === 'calendar/holidays') return { holidays: [] };
  if (path === 'notifications') {
    const cats = ['tasks', 'assistant', 'assistant', 'planner', 'meetings'];
    const n = (i) => ({
      id: 1000 - i, kind: 'run.completed', category: cats[i % cats.length],
      title: i % 6 === 0 ? `e8415e3 UI 재검증 보고서 ${i} VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ` : `작업 ${i} 완료 알림`,
      body: i % 3 ? '긴 본문이 들어가는 알림입니다. '.repeat(3) : '', url: '/tasks', created_at: dayAgo(Math.floor(i / 8), 12 - (i % 8)), read_at: i < 21 ? null : now,
    });
    const limit = Number(q.get('limit') ?? 30);
    return { items: Array.from({ length: limit }, (_, i) => n(i)), next_before: 900, unread_counts: { all: 148, tasks: 21, assistant: 115, planner: 6, weather: 0, meetings: 6, system: 0 } };
  }
  if (path === 'tasks/library') return { roots: [], next_before: null };
  return [];
}

export default async function stub(ctx) {
  // 서비스워커 등록은 막혀 있어 pwaUpdate 가 오류를 던진다(검사 환경의 부산물). 등록 API 자체를 지운다.
  await ctx.addInitScript('delete Navigator.prototype.serviceWorker');
  // 첫 실행 소개(Onboarding)는 평소 본 것으로 두어 다른 화면을 가리지 않게 하고, SWEEP_ONBOARDING=1 일 때만 연다.
  if (!process.env.SWEEP_ONBOARDING) await ctx.addInitScript("try { localStorage.setItem('tk-onboarded', '1') } catch {}");
  await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      'access-control-allow-origin': req.headers().origin ?? '*', 'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const path = url.pathname.replace(/^\/api\//, '');
    return route.fulfill({ json: body(path, req.method(), url.search), headers });
  });
}
