import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { researchRequest } from '../api/client';
import { PageHeader } from '../shell/PageHeader';
import './research.css';

type Data = Record<string, unknown>;
type Study = { id: string; title: string; goal: string; scope: string; phase: string; version: number; environment: Data; criteria: string[]; next_actions: string[] };
type Node = { id: string; kind: string; title: string; summary: string; conditions: Data; details: Data; epistemic_status: string; evidence_id?: string; supersedes_id?: string };
type Experiment = { id: string; title: string; hypothesis: string; rationale: string; state: string; adapter: string; environment: Data; budget: { seconds: number; memory_mb: number }; receipt: { origin?: string; error?: string; result?: Data; interpretation?: string } };
type Snapshot = { study: Study; nodes: Node[]; relations: { id: string; from_id: string; to_id: string; predicate: string; rationale: string; conditions: Data }[]; experiments: Experiment[]; timeline: { id: string; kind: string; actor: string; payload: Data; created_at: string }[]; evidence: { id: string; quote: string; locator: string; source_key: string; sha256: string; active: boolean }[]; truncated: boolean };
type Discovered = { source_key: string; title: string; locator: string; body: string; content_scope: string };
const phases: Record<string, string> = { planning: '연구 기획', investigation: '자료 조사', paused: '일시 중단', analysis: '결과 분석', completed: '완료', archived: '보관' };
const states: Record<string, string> = { queued: '실행 대기', running: '실행 중', paused: '일시 중단', blocked: '실행 보류', completed: '측정 완료', failed: '실패', needs_verification: '검증 필요', cancelled: '취소' };
const knowledgeLabels: Record<string, string> = { source_reported: '원문 보고', locally_measured: '직접 측정', unverified: '미검증' };
const kindLabels: Record<string, string> = { method: '방법론', claim: '주장', finding: '경험적 발견', hypothesis: '가설', observation: '관찰', interpretation: '해석', decision: '결정', constraint: '제약', artifact: '아티팩트' };
const events: Record<string, string> = { study_created: '연구 시작', study_updated: '계획 갱신', source_imported: '원문 확보', node_added: '연구 지식 기록', relation_proposed: '연구 간 관계 제안', selection_recorded: '방법론 비교', experiment_planned: '실험 설계', execution_started: '실행 시작', execution_finished: '실행 결과', external_report_added: '외부 결과 접수', experiment_control: '실험 제어' };
function errorText(e: unknown) { return e instanceof Error ? e.message : '저장하지 못했습니다. 다시 시도해 주세요.'; }
function object(text: FormDataEntryValue | null): Data {
  const value: unknown = JSON.parse(String(text || '{}'));
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('조건과 설정은 JSON 객체로 입력해 주세요.');
  return value as Data;
}
function safeLink(url: string) { return /^https?:\/\//i.test(url) ? url : undefined; }
function Details({ value, label = '조건과 설정' }: { value: unknown; label?: string }) {
  return <details className="research-details"><summary>{label}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>;
}

export function ResearchPage() {
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selected = params.get('study');
  const [tab, setTab] = useState('overview');
  const [form, setForm] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [discovered, setDiscovered] = useState<Discovered[]>([]);
  const [lastUnit, setLastUnit] = useState('');
  const [selection, setSelection] = useState<{ id: string; title: string; eligibility: string; reason: Data }[] | null>(null);
  const [selectedMethods, setSelectedMethods] = useState<{ id: string; title: string }[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<Data | null>(null);
  const studies = useQuery({ queryKey: ['research', 'studies'], queryFn: () => researchRequest<Study[]>('/studies') });
  const detail = useQuery({ queryKey: ['research', selected], queryFn: () => researchRequest<Snapshot>(`/studies/${selected}/resume`), enabled: !!selected });
  const data = detail.data;
  const write = useMutation({
    mutationFn: ({ path, body, method }: { path: string; body: unknown; method?: string }) => researchRequest<Data>(path, body, method),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: ['research'] }); },
  });
  async function action(path: string, body: unknown, method?: string) {
    setError(''); setMessage('');
    try { const result = await write.mutateAsync({ path, body, method }); return result; }
    catch (e) { setError(errorText(e)); return null; }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    const value = (key: string) => String(values.get(key) ?? '');
    try {
      let result: Data | null = null;
      if (form === 'study') {
        result = await action('/studies', { title: value('title'), goal: value('goal'), scope: value('scope'), environment: object(values.get('environment')), criteria: value('criteria').split(',').map(x => x.trim()).filter(Boolean) });
        if (result) setParams({ study: String(result.id) });
      } else if (form === 'source') {
        result = await action(`/studies/${selected}/sources`, { title: value('title'), source_key: value('source_key'), locator: value('locator'), body: value('body') });
        if (result) { const units = result.units as { id: string }[]; setLastUnit(units[0]?.id ?? ''); setMessage('원문을 보관했습니다. 인용 구간을 지정해 주장이나 방법론을 기록하세요.'); }
      } else if (form === 'node') {
        result = await action(`/studies/${selected}/nodes`, { kind: value('kind'), title: value('title'), summary: value('summary'), conditions: object(values.get('conditions')), details: object(values.get('details')), ...(value('unit_id') ? { unit_id: value('unit_id'), start: Number(value('start')), quote: value('quote') } : {}) });
      } else if (form === 'experiment') {
        result = await action(`/studies/${selected}/experiments`, { title: value('title'), hypothesis: value('hypothesis'), rationale: value('rationale'), adapter: value('adapter'), config: object(values.get('config')), environment: object(values.get('environment')), budget: { seconds: Number(value('seconds')), memory_mb: Number(value('memory_mb')) }, method_ids: selectedMethods.map(m => m.id) });
      } else if (form === 'relation') {
        result = await action(`/studies/${selected}/relations`, { from_id: value('from_id'), to_id: value('to_id'), predicate: value('predicate'), rationale: value('rationale'), conditions: object(values.get('conditions')) });
      } else if (form === 'next' && data) {
        result = await action(`/studies/${selected}`, { expected_version: data.study.version, next_actions: value('next_actions').split('\n').filter(Boolean), phase: value('phase') }, 'PATCH');
      }
      if (result) setForm(null);
    } catch (e) { setError(errorText(e)); }
  }
  async function discover(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError('');
    const q = String(new FormData(e.currentTarget).get('q') ?? '');
    try { const result = await researchRequest<{ items: Discovered[] }>(`/discover?q=${encodeURIComponent(q)}`); setDiscovered(result.items); if (!result.items.length) setMessage('검색 결과가 없습니다. 검색어를 바꿔 보세요.'); }
    catch (e) { setError(errorText(e)); }
  }
  const pending = write.isPending;
  const showForm = (name: string) => { setForm(form === name ? null : name); setError(''); };
  return <div className="tk-screen">
    <PageHeader title="AI Research Lab" meta="근거를 쌓고, 실험으로 확인하는 연구 공간" />
    <div className="tk-screen__body"><div className="tk-container tk-container--lg research">
      {(error || studies.error || detail.error) && <div role="alert" className="research-error">{error || errorText(studies.error || detail.error)} <button className="tk-button tk-button--ghost" onClick={() => { setError(''); void studies.refetch(); if (selected) void detail.refetch(); }}>다시 불러오기</button></div>}
      {message && <p role="status" className="research-note">{message}</p>}
      <div className="research-toolbar"><p>RESEARCH / 연구 관제탑</p><button className="tk-button tk-button--primary" onClick={() => showForm('study')}>새 연구</button></div>
      {form === 'study' && <form onSubmit={submit} className="research-form"><h2>새 연구</h2><fieldset disabled={pending}>
        <label>연구 이름<input className="tk-input" name="title" required maxLength={240} /></label>
        <label>연구 목표<textarea className="tk-input" name="goal" required maxLength={6000} /></label>
        <label>범위<select className="tk-input" name="scope"><option value="personal">개인 연구</option><option value="work">회사 연구</option></select></label>
        <label>평가 기준<input className="tk-input" name="criteria" placeholder="recall@5, 지연 시간, 메모리" /></label>
        <label>환경 조건 (JSON)<textarea className="tk-input research-code" name="environment" defaultValue={'{}'} /></label>
        <FormActions pending={pending} onClose={() => setForm(null)} /></fieldset></form>}
      {studies.isPending && <p role="status">연구를 불러오는 중…</p>}
      {studies.data?.length === 0 && <div className="research-empty"><h2>첫 연구를 시작하세요</h2><p>목표를 정하고 자료를 모으세요. 알려진 방법뿐 아니라 가설·실패·설명되지 않은 결과도 연구 자산으로 남깁니다.</p></div>}
      <div className="research-layout"><aside className="research-studies" aria-label="연구 목록">
        {studies.data?.map(s => <button key={s.id} className="research-study" aria-pressed={selected === s.id} onClick={() => { setParams({ study: s.id }); setForm(null); setSelection(null); setLastUnit(''); setDiscovered([]); setCompareIds([]); setComparison(null); setSelectedMethods([]); }}><span>{phases[s.phase] ?? s.phase} · {s.scope === 'work' ? '회사' : '개인'}</span><strong>{s.title}</strong><small>{s.goal}</small></button>)}
      </aside><section className="research-main" aria-label="선택한 연구">
        {selected && detail.isPending && <p role="status">연구 맥락과 실험 결과를 복원하는 중…</p>}
        {!selected && !!studies.data?.length && <div className="research-empty"><h2>이어서 살펴볼 연구를 고르세요</h2><p>기존 목표와 근거, 실패 기록, 다음 작업을 함께 복원합니다.</p></div>}
        {data && <>
          <div className="research-heading"><span className="research-kicker">{phases[data.study.phase] ?? data.study.phase}</span><h2>{data.study.title}</h2><p>{data.study.goal}</p><div className="research-criteria">{data.study.criteria.map(c => <span key={c}>{c}</span>)}</div></div>
          <div className="research-counts"><span><strong>{data.nodes.length}</strong> 지식</span><span><strong>{data.experiments.filter(x => x.state === 'queued').length}</strong> 대기</span><span><strong>{data.experiments.filter(x => x.state === 'needs_verification').length}</strong> 검증 필요</span><span><strong>{data.experiments.filter(x => x.state === 'failed').length}</strong> 실패 기록</span></div>
          {data.truncated && <p role="alert">이 연구는 일부 기록만 표시됩니다. 전체 기록을 확인한 뒤 재개해 주세요.</p>}
          <nav className="research-tabs" aria-label="연구 보기">{[['overview', '연구 현황'], ['knowledge', '지식·근거'], ['experiments', '실험'], ['timeline', '타임라인']].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setForm(null); }}>{label}</button>)}</nav>
          {tab === 'overview' && <>
            <section className="research-section"><div className="research-section-title"><h3>다음 연구</h3><button className="tk-button tk-button--ghost" onClick={() => showForm('next')}>계획 편집</button></div>{data.study.next_actions.length ? <ol>{data.study.next_actions.map((a, i) => <li key={i}>{a}</li>)}</ol> : <p className="research-muted">다음에 확인할 질문과 필요한 검증을 남겨 두세요.</p>}
              <Details value={data.study.environment} label="현재 연구 환경" /><p><Link to="/resources">Mac Studio 자원 현황</Link> · <Link to="/pms/664a2c29-b3d1-425c-b016-6c430cb7a7dc">Lab 개발 WBS</Link></p>
            </section>
            <section className="research-section"><div className="research-section-title"><h3>방법론 탐색</h3><button className="tk-button" disabled={pending} onClick={async () => { const r = await action(`/studies/${selected}/select`, { budget_seconds: 60 }); if (r) setSelection(r.candidates as typeof selection); }}>후보 비교</button></div><p className="research-muted">같은 범위의 과거 연구를 함께 찾습니다. 조건과 비용이 불명확한 방법은 확인 필요로 남깁니다.</p>
              {selection?.length === 0 && <p>등록된 방법론이 없습니다. 자료에서 방법론을 먼저 기록하세요.</p>}
              {selection?.map(c => <article className="research-row" key={c.id}><strong>{c.title}</strong><span className="research-status">{c.eligibility === 'candidate' ? '실험 후보' : c.eligibility === 'excluded' ? '현재 조건에서 제외' : '조건·비용 확인 필요'}</span><Details value={c.reason} label="선택·제외 근거" />{c.eligibility !== "excluded" && <button className="tk-button" onClick={() => { setSelectedMethods([{ id: c.id, title: c.title }]); setTab("experiments"); setForm("experiment"); }}>이 방법으로 실험 설계</button>}</article>)}
            </section>
            <section className="research-section"><h3>공개 연구 발견</h3><form onSubmit={discover} className="research-search"><label className="research-grow">논문 검색어<input className="tk-input" name="q" required maxLength={240} placeholder="예: retrieval ranking" /></label><button className="tk-button" type="submit">arXiv 검색</button></form><p className="research-muted">초록을 발견하고 가져옵니다. 논문 전체의 조건이나 결과를 확인한 상태는 아닙니다.</p>
              {discovered.map(d => <article className="research-row" key={d.source_key}><a href={safeLink(d.locator)} target="_blank" rel="noreferrer">{d.title}</a><p>{d.body}</p><button className="tk-button" disabled={pending} onClick={async () => { const r = await action(`/studies/${selected}/sources`, { source_key: d.source_key, title: d.title, locator: d.locator, body: d.body }); if (r) { setLastUnit((r.units as { id: string }[])[0]?.id ?? ''); setMessage('초록을 보관했습니다. 주장 추출은 원문 인용과 함께 검토해야 합니다.'); } }}>초록 보관</button></article>)}
            </section>
          </>}
          {tab === 'knowledge' && <section className="research-section"><div className="research-section-title"><h3>연구 지식과 근거</h3><div className="research-actions"><button className="tk-button" onClick={() => showForm('source')}>원문 연결</button><button className="tk-button" onClick={() => showForm('node')}>지식 기록</button><button className="tk-button" onClick={() => showForm('relation')}>관계 연결</button></div></div>
            {!data.nodes.length && <p className="research-muted">원문을 보관하고 주장·관찰·가설을 구분해 기록하세요. 실패와 상충하는 결과도 함께 보존합니다.</p>}
            {data.nodes.map(n => { const evidence = data.evidence.find(e => e.id === n.evidence_id); return <article className="research-row" key={n.id}><div className="research-row-meta"><span>{kindLabels[n.kind] ?? n.kind}</span><span className="research-status" data-state={n.epistemic_status}>{knowledgeLabels[n.epistemic_status] ?? n.epistemic_status}</span>{n.supersedes_id && <span>기존 기록의 정정</span>}</div><h4>{n.title}</h4><p>{n.summary}</p>
              {evidence && <blockquote><p>{evidence.quote}</p><footer><a href={safeLink(evidence.locator)} target="_blank" rel="noreferrer">{evidence.source_key}</a> {!evidence.active && '· 이전 원문 버전'}<details><summary>출처 지문</summary><code>{evidence.sha256}</code></details></footer></blockquote>}
              <Details value={{ conditions: n.conditions, details: n.details }} />
            </article>; })}
            {!!data.relations.length && <div className="research-relations"><h3>방법과 주장 사이의 관계</h3>{data.relations.map(r => <article key={r.id} className="research-row"><p><strong>{data.nodes.find(n => n.id === r.from_id)?.title ?? r.from_id}</strong> <span className="research-predicate">{r.predicate}</span> <strong>{data.nodes.find(n => n.id === r.to_id)?.title ?? r.to_id}</strong></p><p>{r.rationale}</p><span className="research-muted">조건부 관계 제안 · 인과관계 확정 아님</span><Details value={r.conditions} /></article>)}</div>}
          </section>}
          {tab === 'experiments' && <section className="research-section">{compareIds.length === 2 && <form className="research-form" onSubmit={async e => { e.preventDefault(); const vary = String(new FormData(e.currentTarget).get('vary') || '').split(',').map(v => v.trim()).filter(Boolean); try { const query = new URLSearchParams({ a: compareIds[0], b: compareIds[1] }); vary.forEach(v => query.append('vary', v)); setComparison(await researchRequest<Data>(`/studies/${selected}/compare?${query}`)); } catch (error) { setError(errorText(error)); } }}><label>실험에서 의도적으로 바꾼 조건<input className="tk-input" name="vary" placeholder="예: cache_type_k, cache_type_v" /></label><button className="tk-button" type="submit">비교 조건 확인</button></form>}{comparison && <div className="research-note" role="status"><strong>{comparison.comparable ? '기록된 조건상 비교 가능' : '조건 확인 필요 · 공정한 비교로 판정하지 않습니다'}</strong><Details value={{ missing: comparison.missing, differences: comparison.differences, uncontrolled: comparison.uncontrolled_differences, controlled: comparison.controlled_variables }} label="비교 근거" /></div>}<div className="research-section-title"><h3>실험과 결과</h3><button className="tk-button" onClick={() => showForm('experiment')}>실험 설계</button></div>
            {!data.experiments.length && <p className="research-muted">가설과 선택 이유부터 기록하세요. 실행하지 않은 실험은 결과로 표시하지 않습니다.</p>}
            {data.experiments.map(x => <article className="research-row" key={x.id}><label className="research-compare-check"><input type="checkbox" checked={compareIds.includes(x.id)} disabled={!compareIds.includes(x.id) && compareIds.length >= 2} onChange={e => { setComparison(null); setCompareIds(e.target.checked ? [...compareIds, x.id] : compareIds.filter(id => id !== x.id)); }} />{x.title} 비교에 추가</label><div className="research-row-meta"><span className="research-status" data-state={x.state}>{states[x.state] ?? x.state}</span><span>{x.budget.seconds}초 · {x.budget.memory_mb} MB 예산</span></div><h4>{x.title}</h4><p>{x.hypothesis}</p><p className="research-muted">선택 이유: {x.rationale}</p>
              {x.receipt.origin === 'external_report' && <p className="research-note">외부 보고입니다. 따까리가 직접 실행한 측정으로 검증되지 않았습니다.</p>}
              {x.receipt.error && <p role="status" className="research-error">실패 기록: {x.receipt.error}</p>}
              {x.receipt.result && <ResultChart result={x.receipt.result} />}
              <Details value={{ environment: x.environment, receipt: x.receipt }} label="실험 조건과 원본 결과" />
              <div className="research-actions">{x.state === 'queued' && <>
                {x.adapter === 'retrieval_eval' && <button className="tk-button tk-button--primary" disabled={pending} onClick={() => { void action(`/experiments/${x.id}/execute`, {}); }}>실험 실행</button>}
                <button className="tk-button" disabled={pending} onClick={() => { void action(`/experiments/${x.id}/control`, { action: 'pause', reason: '사용자가 실행 대기를 중단함' }); }}>대기 중단</button></>}
                {x.state === 'paused' && <button className="tk-button" disabled={pending} onClick={() => { void action(`/experiments/${x.id}/control`, { action: 'resume', reason: '사용자가 연구를 재개함' }); }}>실행 대기 재개</button>}
              </div>
            </article>)}
          </section>}
          {tab === 'timeline' && <section className="research-section"><h3>연구의 흐름</h3><ol className="research-timeline">{data.timeline.map(t => <li key={t.id}><time dateTime={t.created_at}>{new Date(t.created_at).toLocaleString('ko-KR')}</time><strong>{events[t.kind] ?? t.kind}</strong><Details value={t.payload} label="의사결정과 기록" /></li>)}</ol></section>}
          {form && form !== 'study' && <form onSubmit={submit} className="research-form"><h3>{({ source: '원문 연결', node: '지식 기록', experiment: '실험 설계', relation: '관계 연결', next: '다음 연구 계획' } as Record<string, string>)[form]}</h3><fieldset disabled={pending}>
            {['source', 'node', 'experiment'].includes(form) && <label>이름<input className="tk-input" name="title" required maxLength={240} /></label>}
            {form === 'source' && <><label>출처 식별자<input className="tk-input" name="source_key" required placeholder="arxiv:2409.01666v1" /></label><label>원문 주소<input className="tk-input" name="locator" required /></label><label>확보한 원문<textarea className="tk-input" name="body" required rows={6} /></label></>}
            {form === 'node' && <><label>개념 종류<input className="tk-input" name="kind" list="research-kinds" defaultValue="method" required pattern="[a-z][a-z0-9_-]*" /><datalist id="research-kinds">{Object.keys(kindLabels).filter(x => x !== 'observation').map(k => <option key={k} value={k}>{kindLabels[k]}</option>)}</datalist></label><p className="research-muted">목록 밖의 새 개념도 입력할 수 있습니다. 관찰은 서버가 직접 실행한 실험에서 생성합니다.</p><label>내용<textarea className="tk-input" name="summary" /></label><label>적용 조건 (JSON)<textarea className="tk-input research-code" name="conditions" defaultValue="{}" /></label><label>추가 정보 (JSON)<textarea className="tk-input research-code" name="details" defaultValue="{}" /></label><details><summary>원문 근거 연결 · 주장과 발견에는 필수</summary><label>원문 단위 ID<input className="tk-input" name="unit_id" defaultValue={lastUnit} /></label><label>인용 시작 위치<input className="tk-input" name="start" type="number" min="0" defaultValue="0" /></label><label>정확한 인용<textarea className="tk-input" name="quote" /></label></details></>}
            {form === 'relation' && <><label>출발 개념<select name="from_id" className="tk-input" required>{data.nodes.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label><label>도착 개념<select name="to_id" className="tk-input" required>{data.nodes.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label><label>관계 이름<input className="tk-input" name="predicate" required placeholder="contradicts_under_conditions" /></label><label>관계의 근거<textarea className="tk-input" name="rationale" required /></label><label>적용 조건 (JSON)<textarea className="tk-input" name="conditions" defaultValue="{}" /></label></>}
            {form === 'experiment' && <>{!!selectedMethods.length && <p>선택한 방법: {selectedMethods.map(m => m.title).join(', ')}</p>}<label>검증할 가설<textarea className="tk-input" name="hypothesis" required /></label><label>선택 이유와 대안<textarea className="tk-input" name="rationale" required /></label><label>실험 실행 방식<select className="tk-input" name="adapter"><option value="external">에이전트·외부 실험</option><option value="retrieval_eval">검색 평가 · CPU</option></select></label><label>실험 설정 (JSON)<textarea className="tk-input research-code" name="config" defaultValue="{}" rows={5} /></label><label>비교 조건 (JSON)<textarea className="tk-input research-code" name="environment" defaultValue={JSON.stringify(data.study.environment)} /></label><div className="research-fields"><label>시간 예산 (초)<input className="tk-input" name="seconds" type="number" min="1" max="600" defaultValue="30" required /></label><label>메모리 예산 (MB)<input className="tk-input" name="memory_mb" type="number" min="64" max="4096" defaultValue="256" required /></label></div><p className="research-muted">검색 평가는 corpus, queries, k가 필요합니다. 기존 모델을 내려받거나 서비스를 중단하지 않습니다.</p></>}
            {form === 'next' && <><label>연구 단계<input className="tk-input" name="phase" list="research-phases" defaultValue={data.study.phase} required /><datalist id="research-phases">{Object.entries(phases).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</datalist></label><label>다음 작업 · 한 줄에 하나<textarea className="tk-input" name="next_actions" defaultValue={data.study.next_actions.join('\n')} rows={5} /></label></>}
            <FormActions pending={pending} onClose={() => setForm(null)} />
          </fieldset></form>}
        </>}
      </section></div>
    </div></div>
  </div>;
}

function FormActions({ pending, onClose }: { pending: boolean; onClose: () => void }) {
  return <div className="research-actions"><button className="tk-button tk-button--primary" type="submit">{pending ? '저장하는 중…' : '저장'}</button><button className="tk-button tk-button--ghost" type="button" onClick={onClose}>닫기</button></div>;
}

function ResultChart({ result }: { result: Data }) {
  const means = result.means as Record<string, { recall: number; reciprocal_rank: number }> | undefined;
  if (!means) return <Details value={result} label="측정 결과" />;
  return <figure className="research-chart"><figcaption>동일 입력에서의 검색 재현율 · Recall@{String(result.k)}<small>쿼리 {String(result.query_count)}개 · 문서 {String(result.corpus_count)}개 · 생성 품질 미측정</small></figcaption>{Object.entries(means).map(([name, m]) => <div className="research-bar" key={name}><span>{name === 'bm25' ? 'BM25' : '단어 일치'}</span><meter min={0} max={1} value={m.recall} aria-label={`${name} recall`} /><strong>{(m.recall * 100).toFixed(1)}%</strong></div>)}<p className="research-muted">이 실험 입력에 한정된 결과입니다. 다른 모델·데이터·하드웨어의 결과로 일반화하지 않습니다.</p></figure>;
}
