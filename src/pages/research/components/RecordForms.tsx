import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';
import { Select } from '../../../ui/Select';
import { addNode, addRelation, addSource, createStudy, discoverPapers, errorText, updateStudy } from '../api';
import { safeLink } from '../format';
import { KEY } from '../hooks';
import { KIND, PHASE } from '../labels';
import type { KnowledgeNode, Study } from '../types';
import { Callout } from './parts';

/** "gpu = M2 Ultra" 형태의 줄들을 객체로. JSON 을 직접 쓰지 않게 하는 입력 방식이다. */
export function parsePairs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const i = line.search(/[=:]/);
    const k = (i < 0 ? line : line.slice(0, i)).trim();
    if (k) out[k] = i < 0 ? '' : line.slice(i + 1).trim();
  }
  return out;
}

function useSave<T>(fn: (v: T) => Promise<unknown>, onDone: () => void) {
  const cache = useQueryClient();
  const [error, setError] = useState('');
  const m = useMutation({ mutationFn: fn, onSuccess: () => { void cache.invalidateQueries({ queryKey: KEY }); onDone(); } });
  return { error, pending: m.isPending, run: (v: T) => { setError(''); m.mutate(v, { onError: e => setError(errorText(e)) }); } };
}

function Shell({ title, onClose, formId, pending, valid, children, error, label = '저장' }: { title: string; onClose: () => void; formId: string; pending: boolean; valid: boolean; children: React.ReactNode; error: string; label?: string }) {
  return <Dialog open onClose={onClose} size="sm" title={title} modal footer={<><Button variant="ghost" onClick={onClose}>닫기</Button><Button variant="primary" type="submit" form={formId} busy={pending} disabled={!valid}>{label}</Button></>}>
    <div className="rs-form">{children}{error && <Callout kind="caution">{error}</Callout>}</div></Dialog>;
}

export function StudyFormModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: Study) => void }) {
  const [title, setTitle] = useState(''); const [goal, setGoal] = useState(''); const [scope, setScope] = useState('personal'); const [criteria, setCriteria] = useState(''); const [env, setEnv] = useState('');
  const s = useSave(async (b: Parameters<typeof createStudy>[0]) => { const r = await createStudy(b); onCreated(r); }, onClose);
  const valid = !!title.trim() && !!goal.trim();
  return <Shell title="새 연구" onClose={onClose} formId="study-form" pending={s.pending} valid={valid} error={s.error} label="연구 시작">
    <form id="study-form" className="rs-form" onSubmit={(e: FormEvent) => { e.preventDefault(); if (valid) s.run({ title: title.trim(), goal: goal.trim(), scope, criteria: criteria.split(',').map(x => x.trim()).filter(Boolean), environment: parsePairs(env) }); }} noValidate>
      <div className="tk-field"><label className="tk-label" htmlFor="sf-title">연구 이름</label><input id="sf-title" className="tk-input" value={title} onChange={e => setTitle(e.target.value)} maxLength={240} required /></div>
      <div className="tk-field"><label className="tk-label" htmlFor="sf-goal">연구 목표</label><textarea id="sf-goal" className="tk-textarea" rows={3} value={goal} onChange={e => setGoal(e.target.value)} maxLength={6000} placeholder="무엇을 알고 싶거나 무엇을 나아지게 하고 싶은가" required /></div>
      <div className="tk-field"><label className="tk-label" id="sf-scope-l" htmlFor="sf-scope">범위</label><Select id="sf-scope" labelledBy="sf-scope-l" value={scope} options={[{ value: 'personal', label: '개인 연구' }, { value: 'work', label: '회사 연구' }]} onChange={setScope} /></div>
      <div className="tk-field"><label className="tk-label" htmlFor="sf-crit">평가 기준 <span className="tk-label__optional">쉼표로 구분</span></label><input id="sf-crit" className="tk-input" value={criteria} onChange={e => setCriteria(e.target.value)} placeholder="recall@5, 지연 시간, 메모리" /></div>
      <div className="tk-field"><label className="tk-label" htmlFor="sf-env">실험 환경 <span className="tk-label__optional">한 줄에 하나, 이름 = 값</span></label><textarea id="sf-env" className="tk-textarea tk-input--mono" rows={3} value={env} onChange={e => setEnv(e.target.value)} placeholder={'장비 = Mac Studio M2 Ultra\n모델 = qwen3.5-4b-q4_k_m'} /></div>
    </form>
  </Shell>;
}

export function PlanEditModal({ study, onClose }: { study: Study; onClose: () => void }) {
  const [phase, setPhase] = useState(study.phase); const [next, setNext] = useState(study.next_actions.join('\n'));
  const s = useSave((b: Record<string, unknown>) => updateStudy(study.id, b), onClose);
  return <Shell title="연구 단계와 다음 작업" onClose={onClose} formId="plan-form" pending={s.pending} valid error={s.error}>
    <form id="plan-form" className="rs-form" onSubmit={(e: FormEvent) => { e.preventDefault(); s.run({ expected_version: study.version, phase, next_actions: next.split('\n').map(x => x.trim()).filter(Boolean) }); }}>
      <div className="tk-field"><label className="tk-label" id="pl-ph-l" htmlFor="pl-ph">연구 단계</label><Select id="pl-ph" labelledBy="pl-ph-l" value={phase} options={Object.entries(PHASE).map(([value, label]) => ({ value, label }))} onChange={setPhase} /></div>
      <div className="tk-field"><label className="tk-label" htmlFor="pl-next">다음 작업 <span className="tk-label__optional">한 줄에 하나</span></label><textarea id="pl-next" className="tk-textarea" rows={5} value={next} onChange={e => setNext(e.target.value)} /></div>
    </form>
  </Shell>;
}

const KINDS = ['hypothesis', 'claim', 'finding', 'interpretation', 'decision', 'constraint', 'method'];
export function NodeFormModal({ studyId, onClose, unitId }: { studyId: string; onClose: () => void; unitId?: string }) {
  const [kind, setKind] = useState('hypothesis'); const [title, setTitle] = useState(''); const [summary, setSummary] = useState(''); const [cond, setCond] = useState(''); const [quote, setQuote] = useState(''); const [start, setStart] = useState('0'); const [unit, setUnit] = useState(unitId ?? '');
  const needsEvidence = kind === 'claim' || kind === 'finding';
  const s = useSave((b: Record<string, unknown>) => addNode(studyId, b), onClose);
  const valid = !!title.trim() && (!needsEvidence || (!!unit.trim() && !!quote.trim()));
  return <Shell title="연구 지식 기록" onClose={onClose} formId="node-form" pending={s.pending} valid={valid} error={s.error}>
    <form id="node-form" className="rs-form" onSubmit={(e: FormEvent) => { e.preventDefault(); s.run({ kind, title: title.trim(), summary: summary.trim(), conditions: parsePairs(cond), details: {}, ...(unit.trim() && quote.trim() ? { unit_id: unit.trim(), start: Number(start) || 0, quote: quote.trim() } : {}) }); }}>
      <div className="tk-field"><label className="tk-label" id="nd-k-l" htmlFor="nd-k">종류</label><Select id="nd-k" labelledBy="nd-k-l" value={kind} options={KINDS.map(k => ({ value: k, label: KIND[k] ?? k }))} onChange={setKind} />
        <p className="tk-help">관찰은 서버가 실행 결과에서 만듭니다. 주장·발견은 원문 인용이 필요합니다.</p></div>
      <div className="tk-field"><label className="tk-label" htmlFor="nd-t">제목</label><input id="nd-t" className="tk-input" value={title} onChange={e => setTitle(e.target.value)} maxLength={240} /></div>
      <div className="tk-field"><label className="tk-label" htmlFor="nd-s">내용</label><textarea id="nd-s" className="tk-textarea" rows={3} value={summary} onChange={e => setSummary(e.target.value)} /></div>
      <div className="tk-field"><label className="tk-label" htmlFor="nd-c">적용 조건 <span className="tk-label__optional">한 줄에 하나, 이름 = 값</span></label><textarea id="nd-c" className="tk-textarea tk-input--mono" rows={2} value={cond} onChange={e => setCond(e.target.value)} placeholder="모델 = 4B Q4, 장비 = M2 Ultra" /></div>
      <details open={needsEvidence} className="rs-advanced"><summary>원문 근거 연결{needsEvidence ? ' (필수)' : ''}</summary>
        <div className="tk-field"><label className="tk-label" htmlFor="nd-u">원문 단위 ID</label><input id="nd-u" className="tk-input tk-input--mono" value={unit} onChange={e => setUnit(e.target.value)} /></div>
        <div className="tk-field"><label className="tk-label" htmlFor="nd-st">인용 시작 위치</label><input id="nd-st" className="tk-input" type="number" min={0} value={start} onChange={e => setStart(e.target.value)} /></div>
        <div className="tk-field"><label className="tk-label" htmlFor="nd-q">정확한 인용</label><textarea id="nd-q" className="tk-textarea" rows={3} value={quote} onChange={e => setQuote(e.target.value)} /></div></details>
    </form>
  </Shell>;
}

export function SourceFormModal({ studyId, onClose, onSaved }: { studyId: string; onClose: () => void; onSaved: (unitId: string) => void }) {
  const [title, setTitle] = useState(''); const [key, setKey] = useState(''); const [url, setUrl] = useState(''); const [body, setBody] = useState('');
  const s = useSave(async (b: Record<string, unknown>) => { const r = await addSource(studyId, b); onSaved(r.units?.[0]?.id ?? ''); }, onClose);
  const valid = !!title.trim() && !!key.trim() && !!url.trim() && !!body.trim();
  return <Shell title="원문 연결" onClose={onClose} formId="src-form" pending={s.pending} valid={valid} error={s.error}>
    <form id="src-form" className="rs-form" onSubmit={(e: FormEvent) => { e.preventDefault(); s.run({ title: title.trim(), source_key: key.trim(), locator: url.trim(), body }); }}>
      <div className="tk-field"><label className="tk-label" htmlFor="sr-t">제목</label><input id="sr-t" className="tk-input" value={title} onChange={e => setTitle(e.target.value)} /></div>
      <div className="tk-field"><label className="tk-label" htmlFor="sr-k">출처 식별자</label><input id="sr-k" className="tk-input tk-input--mono" value={key} onChange={e => setKey(e.target.value)} placeholder="arxiv:2409.01666v1" /></div>
      <div className="tk-field"><label className="tk-label" htmlFor="sr-u">원문 주소</label><input id="sr-u" className="tk-input" value={url} onChange={e => setUrl(e.target.value)} /></div>
      <div className="tk-field"><label className="tk-label" htmlFor="sr-b">확보한 원문</label><textarea id="sr-b" className="tk-textarea" rows={6} value={body} onChange={e => setBody(e.target.value)} /></div>
    </form>
  </Shell>;
}

export function RelationFormModal({ studyId, nodes, onClose }: { studyId: string; nodes: KnowledgeNode[]; onClose: () => void }) {
  const [from, setFrom] = useState(nodes[0]?.id ?? ''); const [to, setTo] = useState(nodes[1]?.id ?? nodes[0]?.id ?? ''); const [pred, setPred] = useState('supports'); const [why, setWhy] = useState('');
  const s = useSave((b: Record<string, unknown>) => addRelation(studyId, b), onClose);
  const opts = nodes.map(n => ({ value: n.id, label: n.title }));
  const valid = !!from && !!to && from !== to && !!pred.trim() && !!why.trim();
  return <Shell title="지식 사이 관계 연결" onClose={onClose} formId="rel-form" pending={s.pending} valid={valid} error={s.error}>
    <form id="rel-form" className="rs-form" onSubmit={(e: FormEvent) => { e.preventDefault(); s.run({ from_id: from, to_id: to, predicate: pred.trim(), rationale: why.trim(), conditions: {} }); }}>
      <div className="tk-field"><label className="tk-label" id="rl-f-l" htmlFor="rl-f">출발</label><Select id="rl-f" labelledBy="rl-f-l" value={from} options={opts} onChange={setFrom} /></div>
      <div className="tk-field"><label className="tk-label" htmlFor="rl-p">관계</label><input id="rl-p" className="tk-input" list="rl-preds" value={pred} onChange={e => setPred(e.target.value)} /><datalist id="rl-preds">{['supports', 'contradicts_under_conditions', 'explains', 'depends_on'].map(p => <option key={p} value={p} />)}</datalist></div>
      <div className="tk-field"><label className="tk-label" id="rl-t-l" htmlFor="rl-t">도착</label><Select id="rl-t" labelledBy="rl-t-l" value={to} options={opts} onChange={setTo} /></div>
      <div className="tk-field"><label className="tk-label" htmlFor="rl-w">관계의 근거</label><textarea id="rl-w" className="tk-textarea" rows={3} value={why} onChange={e => setWhy(e.target.value)} /></div>
    </form>
  </Shell>;
}

export function DiscoverModal({ studyId, onClose, onSaved }: { studyId: string; onClose: () => void; onSaved: (unitId: string) => void }) {
  const [q, setQ] = useState(''); const [items, setItems] = useState<Awaited<ReturnType<typeof discoverPapers>>['items']>([]); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const cache = useQueryClient();
  async function search(e: FormEvent) { e.preventDefault(); setBusy(true); setMsg(''); try { const r = await discoverPapers(q); setItems(r.items); if (!r.items.length) setMsg('검색 결과가 없습니다. 검색어를 바꿔 보세요.'); } catch (err) { setMsg(errorText(err)); } finally { setBusy(false); } }
  async function keep(d: (typeof items)[number]) {
    try { const r = await addSource(studyId, { source_key: d.source_key, title: d.title, locator: d.locator, body: d.body }); onSaved(r.units?.[0]?.id ?? ''); setMsg('초록을 보관했습니다. 주장 추출은 원문 인용과 함께 검토해야 합니다.'); void cache.invalidateQueries({ queryKey: KEY }); } catch (err) { setMsg(errorText(err)); }
  }
  return <Dialog open onClose={onClose} size="lg" title="논문 찾기 (arXiv)" footer={<Button onClick={onClose}>닫기</Button>}>
    <div className="rs-form">
      <form className="rs-inline" onSubmit={search}><div className="tk-field rs-grow"><label className="tk-label" htmlFor="ds-q">검색어</label><input id="ds-q" className="tk-input" value={q} onChange={e => setQ(e.target.value)} maxLength={240} placeholder="예: kv cache quantization" required /></div><Button type="submit" busy={busy}>검색</Button></form>
      <p className="rs-muted">초록을 찾아 가져옵니다. 논문 전체의 조건이나 결과를 확인한 상태는 아닙니다.</p>
      {msg && <p role="status">{msg}</p>}
      <ul className="rs-rellist">{items.map(d => <li key={d.source_key}>{safeLink(d.locator) ? <a href={safeLink(d.locator)} target="_blank" rel="noreferrer">{d.title}</a> : <strong>{d.title}</strong>}<p className="rs-prose">{d.body.slice(0, 280)}{d.body.length > 280 ? '…' : ''}</p><Button size="sm" onClick={() => void keep(d)}>초록 보관</Button></li>)}</ul>
    </div>
  </Dialog>;
}
