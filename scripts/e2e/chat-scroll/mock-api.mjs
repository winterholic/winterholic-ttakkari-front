// 채팅 스크롤 검증용 합성 백엔드. 실제 서버·계정·데이터는 쓰지 않는다.
// 진짜 HTTP 서버라 SSE 가 조각으로 흘러가고(page.route 는 한 번에 보낸다), 응답 지연을 시나리오가 조절할 수 있다.
// 모르는 경로는 scripts/ui-sweep/stub.mjs 의 합성 데이터로 답한다(앱 껍데기가 부르는 목록들).
import { createServer } from 'node:http';
import { body as sweepBody } from '../../ui-sweep/stub.mjs';

export const DESK = 'desk-1';
export const WORKER = 'worker-1';
/** 접수 대화의 지난 Run 수. 한 번에 40개씩 읽으니 더 보기를 두 번 눌러야 끝까지 온다. */
export const TOTAL = 140;
/** 트리 카드가 실시간으로 자라는 Run 번호(맨 아래에서 10번째). */
export const LIVE_TREE_RUN = 132;

const BASE = Date.parse('2026-11-20T00:00:00Z');
const iso = (i, k = 0) => new Date(BASE + i * 180_000 + k * 1000).toISOString();
const leadId = (i) => (i === LIVE_TREE_RUN ? 'lead-live' : `lead-${i}`);

const para = (i, j) =>
  `${i}번째 질문에 대한 ${j}번째 문단입니다. 긴 대화에서 스크롤 위치가 유지되는지 보려고 만든 합성 문장이고, 폰 폭에서도 여러 줄로 접히도록 충분히 길게 씁니다. `.repeat(1 + ((i + j) % 3));

export function longText(i) {
  const paras = 3 + ((i * 7) % 6);
  const parts = [`## 결과 ${i}`];
  for (let j = 0; j < paras; j++) parts.push(para(i, j));
  parts.push(`- 항목 ${i}-1\n- 항목 ${i}-2\n- 항목 ${i}-3`);
  if (i % 4 === 0) parts.push('```ts\n' + Array.from({ length: 6 + (i % 9) }, (_, k) => `const value${k} = compute(${i}, ${k});`).join('\n') + '\n```');
  return parts.join('\n\n');
}

const artifact = (i) => ({
  id: `art-${i}`, workspace_id: 'ws1', session_id: DESK, run_id: `run-${i}`, filename: `보고서-${i}.md`, mime_type: 'text/markdown', kind: 'markdown',
  source: 'upload', area: 'files', rel_path: `docs/report-${i}.md`, storage_mode: 'copy', size_bytes: 2048, sha256: '0', preview_status: 'not_required',
  preview_mime: null, preview_error: null, export_policy: 'allow', downloadable: true, retention_until: null, created_at: iso(i),
});

export function eventsFor(i) {
  const ev = [];
  let seq = 0;
  const push = (type, payload) => ev.push({ seq: ++seq, type, payload, created_at: iso(i, seq) });
  push('run.status', { status: 'running' });
  const steps = 3 + (i % 7);
  for (let s = 0; s < steps; s++) {
    push('tool.call', { call_id: `c${i}-${s}`, name: 'Bash', input: { command: `echo step ${i}-${s}` } });
    push('tool.result', { call_id: `c${i}-${s}`, is_error: false, output: 'ok', exit_code: 0 });
  }
  if (i % 5 === 2) push('desk.delegated', { lead_id: leadId(i), title: `맡긴 일 ${i}` });
  if (i % 6 === 1) push('artifact.created', { artifact: artifact(i) });
  const text = longText(i);
  push('message', { text });
  push('run.finished', { status: 'succeeded', error: null, result_text: text, cost_usd: 0.1, exit_code: 0 });
  return ev;
}

const runOut = (session, i, over = {}) => ({
  id: `run-${session}-${i}`, session_id: session, workspace_id: 'ws1', prompt: `질문 ${i}: 이전에 시킨 일의 결과를 다시 보여 줘`, context_artifact_ids: [],
  engine: 'claude', model: null, effort: null, status: 'succeeded', exit_code: 0, error: null, result_text: `요약 ${i}: 한 줄로 줄인 결과`, cost_usd: 0.1,
  usage: {}, checkpoint_ref: null, origin: 'user', profile: null, last_seq: 0, created_at: iso(i), started_at: iso(i), finished_at: iso(i, 60), ...over,
});

export function startMockApi({ port = 0 } = {}) {
  const ctl = { eventDelay: 250, treeDelay: 350, treeLive: false, treeRequests: 0, live: null, liveRun: null };
  const events = new Map(); // runId -> 이벤트 배열
  const runsOf = (session) => {
    const n = session === DESK ? TOTAL : 12;
    const list = Array.from({ length: n }, (_, i) => runOut(session, i));
    if (session === DESK && ctl.liveRun) list.push(ctl.liveRun);
    return list;
  };
  const idOf = (session, i) => `run-${session}-${i}`;
  const eventsOfRun = (runId) => {
    if (events.has(runId)) return events.get(runId);
    const m = /^run-(.+)-(\d+)$/.exec(runId);
    const e = m ? eventsFor(Number(m[2])) : [];
    events.set(runId, e);
    return e;
  };
  const node = (id, parent, status, title) => ({
    id, parent_id: parent, kind: 'worker', title, pool: 'personal', created_at: iso(1), updated_at: iso(1), archived_at: null, status, profile: null, model: null, last_result: null,
  });
  const tree = (id) => {
    const live = id === 'lead-live' && ctl.treeLive;
    const kids = live ? Math.min(2 + ctl.treeRequests, 24) : 3;
    const nodes = [{ ...node(id, DESK, live ? 'running' : 'succeeded', `맡긴 일 ${id}`), kind: 'orchestrator' }];
    for (let k = 0; k < kids; k++) nodes.push({ ...node(`${id}-w${k}`, id, live && k === kids - 1 ? 'running' : 'succeeded', `작업 ${k + 1}: 세부 항목을 처리합니다`), created_at: iso(2 + k) });
    return { root_id: id, path: [nodes[0]], nodes };
  };
  const session = (id) => ({
    id, workspace_id: 'ws1', title: id === DESK ? '따까리' : '작업 세션', engine: 'claude', model: null, effort: null, engine_session_id: null,
    kind: id === DESK ? 'desk' : 'worker', parent_id: id === DESK ? null : 'lead-3', pool: 'personal', created_at: iso(0), updated_at: iso(0), archived_at: null,
    active_run_id: ctl.liveRun && id === DESK ? ctl.liveRun.id : null, last_run_status: 'succeeded',
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('access-control-allow-origin', req.headers.origin ?? '*');
    res.setHeader('access-control-allow-credentials', 'true');
    res.setHeader('access-control-allow-headers', 'authorization,content-type,last-event-id');
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    const send = (data, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    let m;
    if (url.pathname === '/__ctl' && req.method === 'POST') {
      let raw = '';
      for await (const c of req) raw += c;
      const op = JSON.parse(raw || '{}');
      if (op.op === 'config') Object.assign(ctl, op.set);
      if (op.op === 'startLive') {
        const id = 'run-live';
        const base = { seq: 0 };
        const list = [];
        events.set(id, list);
        const push = (type, payload) => list.push({ seq: ++base.seq, type, payload, created_at: new Date().toISOString() });
        push('run.status', { status: 'running' });
        ctl.liveRun = runOut(DESK, TOTAL, { id, prompt: '질문 live: 지금 진행 중인 일', status: 'running', result_text: null, finished_at: null, created_at: new Date().toISOString() });
        let lines = 0;
        ctl.live = setInterval(() => {
          lines++;
          if (lines % 6 === 0) {
            push('tool.call', { call_id: `lc${lines}`, name: 'Bash', input: { command: `echo live ${lines}` } });
            push('tool.result', { call_id: `lc${lines}`, is_error: false, output: 'ok', exit_code: 0 });
          }
          push('message', { text: Array.from({ length: lines }, (_, k) => `실시간 응답 ${k + 1}번째 줄입니다. 계속 길어지는 스트리밍 본문이 아래로 자랍니다.`).join('\n\n') });
        }, op.interval ?? 150);
      }
      if (op.op === 'stopLive') {
        clearInterval(ctl.live);
        ctl.live = null;
        const list = events.get('run-live');
        if (list) list.push({ seq: list.length + 1, type: 'run.finished', payload: { status: 'succeeded', error: null, result_text: null, cost_usd: 0, exit_code: 0 }, created_at: new Date().toISOString() });
        if (ctl.liveRun) ctl.liveRun = { ...ctl.liveRun, status: 'succeeded', finished_at: new Date().toISOString() };
      }
      if (op.op === 'reset') {
        clearInterval(ctl.live);
        Object.assign(ctl, { eventDelay: 250, treeDelay: 350, treeLive: false, treeRequests: 0, live: null, liveRun: null });
        events.delete('run-live');
      }
      return send({ ok: true });
    }
    if ((m = /^\/api\/sessions\/([^/]+)\/runs$/.exec(url.pathname)) && req.method === 'GET') {
      const list = runsOf(m[1]);
      const limit = Number(url.searchParams.get('limit') ?? list.length);
      return send(list.slice(-limit));
    }
    if ((m = /^\/api\/sessions\/([^/]+)$/.exec(url.pathname)) && req.method === 'GET') return send(session(m[1]));
    if (/^\/api\/workspaces\/[^/]+$/.test(url.pathname)) return send({ id: 'ws1', name: '테스트 작업공간', root_path: '/tmp/ws', is_git: false, default_engine: 'claude', codex_sandbox: 'workspace-write', export_allowed: true, extra_writable_roots: [], created_at: iso(0), archived_at: null });
    if ((m = /^\/api\/runs\/([^/]+)\/events$/.exec(url.pathname))) {
      await sleep(ctl.eventDelay);
      const after = Number(url.searchParams.get('after') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 500);
      return send(eventsOfRun(m[1]).filter((e) => e.seq > after).slice(0, limit));
    }
    if ((m = /^\/api\/runs\/([^/]+)\/stream$/.exec(url.pathname))) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      let last = Number(url.searchParams.get('after') ?? 0);
      const tick = setInterval(() => {
        const list = eventsOfRun(m[1]);
        for (const e of list) {
          if (e.seq <= last) continue;
          last = e.seq;
          res.write(`event: run_event\nid: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);
          if (e.type === 'run.finished') {
            res.write('event: end\ndata: {}\n\n');
            clearInterval(tick);
            res.end();
            return;
          }
        }
      }, 40);
      req.on('close', () => clearInterval(tick));
      return;
    }
    if ((m = /^\/api\/tasks\/([^/]+)\/tree$/.exec(url.pathname))) {
      await sleep(ctl.treeDelay);
      if (m[1] === 'lead-live') ctl.treeRequests++;
      if (m[1] === WORKER) {
        const t = tree('lead-3');
        return send({ ...t, path: [t.nodes[0], { ...node(WORKER, 'lead-3', 'succeeded', '작업 세션') }] });
      }
      return send(tree(m[1]));
    }
    const path = url.pathname.replace(/^\/api\//, '');
    return send(sweepBody(path, req.method, url.search));
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: p } = server.address();
      resolve({ port: p, url: `http://127.0.0.1:${p}`, ctl, idOf, close: () => { clearInterval(ctl.live); server.closeAllConnections?.(); server.close(); } });
    });
  });
}
