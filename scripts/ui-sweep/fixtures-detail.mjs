// 상세 화면(회의 상세·PMS 대시보드·이슈·캘린더 일정·채팅 세션·날씨)용 합성 데이터. stub.mjs 가 먼저 물어본다.
// 기본 스텁이 [] 를 돌려주면 이 화면들은 "화면을 그리다 멈췄어요" 로 떨어져 한 번도 검사되지 못했다.
const now = '2026-10-17T00:00:00Z';
const meetingDetail = {
  id: 'm1', title: 'AIP 프로젝트의 회의록과 모바일에서 긴 제목 확인 1', scope: 'work', status: 'review', failed_stage: null, error: null,
  project: { id: 'p1', name: 'PMS 긴 프로젝트 이름' }, held_at: now, participants: ['민수', '지연'], source: 'text', provider: null, audio: null,
  transcript_chars: 4200, transcript_source: 'paste', summary: '프로젝트 진행과 다음 단계를 검토합니다. 일정은 다음 주까지 조율합니다.',
  counts: { discussion: 2, decision: 2, action: 3, open_issue: 1, pending_proposals: 1 }, analysis_run_id: null, analysis_session_id: null,
  created_at: now, updated_at: now, analyzed_at: now,
  transcript: '[00:00] 민수: 안녕하세요, 오늘 회의 시작하겠습니다.\n[00:12] 지연: 네, 지난 주 이슈부터 볼게요.\n'.repeat(12),
  items: [
    { id: 'i1', kind: 'decision', position: 0, text: '배포 일정을 다음 주 화요일로 확정한다', detail: '운영 영향이 적은 시간대', owner: null, due: null, evidence: '화요일이 좋겠어요', status: 'open', conflicts: [] },
    { id: 'i2', kind: 'action', position: 1, text: '민수가 테스트 보고서를 작성한다', detail: null, owner: '민수', due: '2026-10-20', evidence: null, status: 'open', conflicts: [] },
    { id: 'i3', kind: 'action', position: 2, text: '아주 긴 담당자 이름과 아주 긴 제목의 액션 아이템 VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ', detail: null, owner: '아주긴이름의담당자', due: '2026-10-25', evidence: null, status: 'done', conflicts: [] },
    { id: 'i4', kind: 'discussion', position: 3, text: '모바일 UI 개선 범위', detail: '여백과 정렬', owner: null, due: null, evidence: null, status: 'open', conflicts: [] },
    { id: 'i5', kind: 'open_issue', position: 4, text: '푸시 알림 지연 원인', detail: null, owner: null, due: null, evidence: null, status: 'open', conflicts: [] },
  ],
  proposals: [{ id: 'pr1', item_id: 'i1', kind: 'add_memory', status: 'pending', reason: '결정 사항을 기억해 두면 좋아요', payload: { content: '배포는 화요일에 한다', memory_kind: 'decision' }, result: {}, created_at: now, resolved_at: null }],
  analysis_context: [],
};
const task = (i) => ({ id: 't' + i, wbs: String(i + 1), title: '작업 ' + (i + 1) + ' 칸반 카드 제목', assignee: i % 2 ? '민수' : null, status: 'doing', progress: 50, end_date: '2026-10-20', days: i - 1, priority: 'normal' });
const dashboard = {
  project: { id: 'p1', name: 'AIP (Application Intent Protocol) 긴 프로젝트 이름 1 그리고 더 긴 부제목', description: '설명', scope: 'work', status: 'active', start_date: '2026-09-30', end_date: '2026-12-31', members: ['민수', '아주긴이름의담당자이름'], created_at: now, updated_at: now },
  today: '2026-10-17', progress: 35, planned_progress: 42, days_left: 75,
  counts: { total: 10, done: 3, todo: 3, doing: 3, review: 1, overdue: 1, due_soon: 2, no_dates: 2 },
  overdue: [task(0)], due_soon: [task(1), task(2)],
  by_assignee: [{ name: '민수', total: 5, todo: 1, doing: 2, review: 1, done: 1, overdue: 1 }, { name: '', total: 3, todo: 2, doing: 1, review: 0, done: 0, overdue: 0 }],
  phases: [{ id: 'ph1', wbs: '1', title: '기획', progress: 100, status: 'done', start_date: '2026-09-30', end_date: '2026-10-10' }, { id: 'ph2', wbs: '2', title: '개발', progress: 40, status: 'doing', start_date: '2026-10-10', end_date: '2026-11-30' }],
  milestones: [{ id: 'ms1', project_id: 'p1', title: '베타 출시', due_date: '2026-11-15', done: false, days: 29, overdue: false }],
  notes: { open: 2, issues: 1, risks: 1, high: 1, top: [] },
};
const notes = [
  { id: 'n1', project_id: 'p1', task_id: null, kind: 'issue', title: '결제 연동 지연', body: '외부 API 승인이 늦어지고 있어요.', severity: 'high', status: 'open', owner: '민수', created_at: now, updated_at: now, resolved_at: null },
  { id: 'n2', project_id: 'p1', task_id: null, kind: 'risk', title: '일정 지연 위험 아주 긴 제목 VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ', body: '', severity: 'medium', status: 'open', owner: null, created_at: now, updated_at: now, resolved_at: null },
];
const event = {
  id: 'e1', title: '주간 회의 아주 긴 제목의 일정 VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ', description: '안건 정리', location: '회의실 A', all_day: false,
  start: '2026-10-17T10:00:00', end: '2026-10-17T11:00:00', rrule: null, recurring: false, reminder: null, remind_at: null, reminder_sent: false, source: 'user', created_at: now, updated_at: now,
};

const node = (id, kind, title, status) => ({ id, parent_id: null, kind, title, pool: 'personal', created_at: now, updated_at: now, archived_at: null, status, profile: 'claude', model: 'opus', last_result: null });
const MD = '## 결과 요약\n\n- 첫째 항목은 **굵게** 표시돼요.\n- 둘째 항목은 `inline code` 와 [링크](https://example.com) 를 포함해요.\n\n```ts\nconst answer = 42; // 코드 블록\n```\n\n| 열 A | 열 B |\n|---|---|\n| 1 | 2 |\n\n마지막 문단은 조금 더 길게 써서 줄바꿈이 어떻게 되는지 확인해요. VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const run = (id, prompt, status, result) => ({
  id, session_id: 's1', workspace_id: 'fixture', prompt, context_artifact_ids: [], engine: 'claude', model: 'opus', effort: null, status, exit_code: 0, error: status === 'failed' ? '한도에 걸렸어요' : null,
  result_text: result, cost_usd: 0.12, usage: {}, checkpoint_ref: null, origin: 'user', profile: 'claude', last_seq: 4, created_at: now, started_at: now, finished_at: now,
});
const runs = [
  run('r1', '모바일 화면 여백을 점검해 줘', 'succeeded', MD),
  run('r2', '아주 긴 지시문입니다. 여러 줄로 줄바꿈이 되어야 하고 긴 단어 VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ 도 포함해요.', 'failed', null),
  run('r3', '짧은 질문', 'running', null),
];
const events = [
  { seq: 1, type: 'run.status', payload: { status: 'running' }, created_at: now },
  { seq: 2, type: 'message', payload: { text: '확인해 볼게요.' }, created_at: now },
  { seq: 3, type: 'tool.call', payload: { call_id: 'c1', name: 'Bash', input: { command: 'ls -la' } }, created_at: now },
  { seq: 4, type: 'tool.result', payload: { call_id: 'c1', is_error: false, output: 'total 8\nfoo.txt', exit_code: 0 }, created_at: now },
];
const wLoc = (name) => ({
  provider: 'open-meteo', timezone: 'Asia/Seoul', fetched_at: '2026-10-17T09:00', forecast_time: '2026-10-17T09:00', location: { name, latitude: 37.2, longitude: 127.0 },
  units: { temperature: '°C', precipitation: 'mm', wind_speed: 'km/h', visibility: 'm' },
  current: { time: '2026-10-17T09:00', temperature_c: 18.4, apparent_temperature_c: 17, humidity_percent: 52, wind_speed_kmh: 9, weather_code: 2 },
  hourly: Array.from({ length: 24 }, (_, h) => ({ time: '2026-10-17T' + String(h).padStart(2, '0') + ':00', temperature_c: Math.round((12 + Math.sin(h / 4) * 6) * 10) / 10, apparent_temperature_c: 11, precipitation_probability_percent: (h * 5) % 70, precipitation_mm: 0, weather_code: 2, wind_speed_kmh: 8, visibility_m: 20000 })),
  daily: Array.from({ length: 7 }, (_, d) => ({ date: '2026-10-' + String(17 + d).padStart(2, '0'), temperature_min_c: 9 + d, temperature_max_c: 20 + (d % 3), precipitation_probability_max_percent: d * 10, precipitation_sum_mm: d, weather_code: d % 2 ? 61 : 1 })),
  missing_fields: [],
});
const briefing = {
  id: 'w1', day: '2026-10-17', status: 'ready', request_source: 'scheduled', raw_forecasts: null, forecast: { suwon: wLoc('수원'), seoul: wLoc('서울') }, source_errors: null,
  briefing: { summary: ['오전에는 맑고 오후에 구름이 늘어요', '저녁에는 비 가능성이 있어요'], umbrella: '오후 늦게 작은 우산이 있으면 좋아요', outfit: '가벼운 겉옷을 챙기세요', commute: '출근길은 쾌적, 퇴근길은 비가 올 수 있어요', daypart: '오전 맑음 · 오후 구름 · 저녁 비', week: '주말에 기온이 오르고 다음 주 초 비가 와요' },
  analysis_status: 'ok', analysis_engine: 'claude', analysis_model: 'opus', failure: null, scheduled_at: now, generated_at: now, push_sent_at: null, push_error: null, created_at: now, updated_at: now,
};

export function detail(path, method) {
  if (method === 'GET' && path === 'meetings/m1') return meetingDetail;
  if (method === 'GET' && /^pms\/projects\/[^/]+\/dashboard$/.test(path)) return dashboard;
  if (method === 'GET' && /^pms\/projects\/[^/]+\/notes$/.test(path)) return { notes };
  if (method === 'GET' && /^pms\/projects\/[^/]+\/milestones$/.test(path)) return { milestones: dashboard.milestones };
  if (method === 'GET' && path === 'calendar/events') return { events: [event] };
  if (method === 'GET' && path === 'calendar/events/e1') return event;
  if (method === 'GET' && /^sessions\/s1\/runs$/.test(path)) return runs;
  if (method === 'GET' && /^runs\/r\d\/events$/.test(path)) return events;
  if (method === 'GET' && /^weather\/briefings\/[\d-]+$/.test(path)) return briefing;
  if (method === 'GET' && path === 'weather/briefings') return [briefing];
  if (method === 'GET' && path === 'sessions/s1') return { id: 's1', workspace_id: 'fixture', title: '모바일 화면 여백 점검', engine: 'claude', model: 'opus', effort: null, engine_session_id: null, kind: 'desk', parent_id: null, pool: 'personal', created_at: now, updated_at: now, archived_at: null, active_run_id: 'r3', last_run_status: 'running' };
  if (method === 'GET' && /^tasks\/s1\/tree$/.test(path)) { const n = node('s1', 'desk', '모바일 화면 여백 점검', 'running'); return { root_id: 's1', path: [n], nodes: [n] }; }
  return undefined;
}
