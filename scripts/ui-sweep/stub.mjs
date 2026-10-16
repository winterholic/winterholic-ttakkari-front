// 레이아웃 검사용 API 스텁. 실제 서버 없이 긴 이름·긴 제목이 들어간 합성 데이터로 화면을 채운다.
// 사용: scripts/ui-sweep/run.sh (dev 서버 + 이 스텁 + 디자인 시스템의 ttakkari-layout.check.mjs)
// 실제 로그인 계정·실제 데이터는 쓰지 않는다. 모르는 경로는 빈 목록 [] 을 돌려 빈 상태 화면도 같이 본다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

function body(path, method) {
  if (path === 'auth/refresh') return { access_token: 'fixture', expires_in: 900, token_type: 'bearer' };
  if (path === 'auth/me') return { id: 'u1', name: '테스트', role: 'owner' };
  if (path === 'health') return { ok: true };
  if (path === 'tasks/active') return { roots: [], nodes: [] };
  if (path === 'accounts') return accounts;
  if (path === 'accounts/usage') return [];
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
  if (path === 'artifacts') return [artifact(1), artifact(2), artifact(3)];
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
  if (path === 'pms/projects') return { projects: [project(1), project(2)] };
  if (path === 'clovanote/status') return { state: 'unconfigured', message: '테스트', notes: 0, active_jobs: 0, login: { state: 'idle' } };
  if (path === 'clovanote/jobs') return { jobs: [] };
  if (path === 'clovanote/notes') return { notes: [] };
  if (path === 'calendar/events') return { events: [] };
  if (path === 'calendar/holidays') return { holidays: [] };
  if (path === 'notifications') {
    const n = (i, category) => ({ id: i, kind: 'run.completed', category, title: '아주 긴 제목의 알림 ' + i + ' VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ', body: '긴 본문이 들어가는 알림입니다. '.repeat(4), url: '/tasks', created_at: now, read_at: null });
    return { items: [n(1, 'tasks'), n(2, 'planner'), n(3, 'meetings')], next_before: null, unread_counts: { all: 3, tasks: 1, assistant: 0, planner: 1, weather: 0, meetings: 1, system: 0 } };
  }
  if (path === 'tasks/library') return { roots: [], next_before: null };
  return [];
}

export default async function stub(ctx) {
  // 서비스워커 등록은 막혀 있어 pwaUpdate 가 오류를 던진다(검사 환경의 부산물). 등록 API 자체를 지운다.
  await ctx.addInitScript('delete Navigator.prototype.serviceWorker');
  await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      'access-control-allow-origin': req.headers().origin ?? '*', 'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const path = url.pathname.replace(/^\/api\//, '');
    return route.fulfill({ json: body(path, req.method()), headers });
  });
}
