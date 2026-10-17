import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import {
  addEntity, addMemory, addRelation, addSource, assistantStatus, deleteEntity, deleteMemory, deleteSource, getInstructions,
  listEntities, listMemories, listSources, listTools, patchEntity, patchMemory, putInstructions, reindexSource, resetInstructions,
  CATEGORY_LABEL, SCOPE_LABEL,
} from "../api/client";
import type { EntityType, InstructionRole, MemoryKind } from "../api/client";
import { errorText } from "../features/viewer/api";
import { EmptyState, ErrorState, ListSkeleton } from "../features/viewer/screenStates";
import { PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";
import { Select } from "../ui/Select";
import { toast } from "../ui/toastStore";
import { OrchestrationFlow } from "./OrchestrationFlow";
import "./settings.css";
import "./assistant.css";

type Tab = "instructions" | "memory" | "knowledge" | "tools" | "flow";
const TABS: { id: Tab; label: string }[] = [
  { id: "instructions", label: "지침" },
  { id: "memory", label: "기억" },
  { id: "knowledge", label: "지식" },
  { id: "tools", label: "도구" },
  { id: "flow", label: "흐름도" },
];
const KINDS: { value: MemoryKind; label: string }[] = [
  { value: "fact", label: "사실" },
  { value: "preference", label: "취향" },
  { value: "decision", label: "결정" },
  { value: "event", label: "사건" },
  { value: "instruction", label: "지침" },
  { value: "note", label: "메모" },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label])) as Record<MemoryKind, string>;
const ETYPES: { value: EntityType; label: string }[] = [
  { value: "person", label: "사람" },
  { value: "project", label: "프로젝트" },
  { value: "org", label: "조직" },
  { value: "place", label: "장소" },
  { value: "tool", label: "도구" },
  { value: "topic", label: "주제" },
  { value: "preference", label: "취향" },
  { value: "other", label: "기타" },
];
const ETYPE_LABEL = Object.fromEntries(ETYPES.map((k) => [k.value, k.label])) as Record<EntityType, string>;

/**
 * 비서 관리(ADR 0007). 따까리에만 적용되는 하네스: 지침(시스템 프롬프트), 기억·온톨로지, 지식(RAG 출처), 도구 목록.
 * 지금은 틀이다. 세부 정책(자동 추출·만료 등)은 쓰면서 채운다.
 */
export function AssistantPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "instructions") as Tab;
  const status = useQuery({ queryKey: ["assistant", "status"], queryFn: assistantStatus, refetchInterval: (q) => (q.state.data?.ready ? false : 3000) });
  const s = status.data;
  return (
    <div className="tk-screen">
      <PageHeader
        title="비서 관리"
        meta={s ? `${s.ready ? "검색 준비됨" : "검색 모델 불러오는 중"} · 기억 ${s.counts.memories} · 항목 ${s.counts.entities} · 문서 ${s.counts.documents}` : undefined}
      />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--md">
          <div className="tk-segmented tk-segmented--block assistant-tabs" role="radiogroup" aria-label="비서 관리">
            {TABS.map((t) => (
              <label key={t.id}>
                <input type="radio" name="assistant-tab" checked={tab === t.id} onChange={() => setParams(t.id === "instructions" ? {} : { tab: t.id })} />
                {t.label}
              </label>
            ))}
          </div>
          {tab === "instructions" && <InstructionsTab brief={s?.brief ?? ""} />}
          {tab === "memory" && <MemoryTab />}
          {tab === "knowledge" && <KnowledgeTab />}
          {tab === "tools" && <ToolsTab />}
          {tab === "flow" && <OrchestrationFlow />}
        </div>
      </div>
    </div>
  );
}

const ROLES: { id: InstructionRole; label: string; help: string; placeholder: string }[] = [
  {
    id: "common",
    label: "공통",
    help: "기획·작업 세션과 일반 대화의 시스템 프롬프트에 붙어요. 접수에는 안 들어가요.",
    placeholder: "예)\n- 확실하지 않은 건 '확인 필요'라고 표시한다.\n- 맥락은 recall → work-history 순으로 찾는다.",
  },
  {
    id: "desk",
    label: "접수",
    help: "메시지를 받자마자 바로 답할지 기획 세션에 넘길지 고르는 가벼운 모델(luna → haiku)의 지침이에요. 전역 하네스와 공통 지침 없이 이것만 받아요. 답은 JSON 한 줄 형식을 지켜야 해요.",
    placeholder: "",
  },
  {
    id: "lead",
    label: "기획",
    help: "접수가 넘긴 일을 맡아 작업 세션을 나눠 돌리는 기획 세션(Opus·Sol)에만 붙어요. 모델 배정, 계정, 컨텍스트 교체 방침을 여기에 둬요.",
    placeholder: "예)\n- 간단한 작업은 Luna high 부터 배정한다.\n- 컨텍스트 70% 이상이면 새 세션으로 교체한다.",
  },
  {
    id: "worker",
    label: "작업",
    help: "기획 세션이 만든 작업 세션(Sonnet·Luna)에만 붙어요.",
    placeholder: "예)\n- 받은 지시 범위만 고친다.\n- 끝나면 실행한 검증 명령과 결과를 보고한다.",
  },
];

function InstructionsTab({ brief }: { brief: string }) {
  const id = useId();
  const [role, setRole] = useState<InstructionRole>("common");
  const meta = ROLES.find((r) => r.id === role) ?? ROLES[0];
  return (
    <section className="tk-section" aria-labelledby={`${id}-t`}>
      <div className="tk-section__head">
        <h2 className="tk-section__title" id={`${id}-t`}>비서 지침</h2>
      </div>
      <div className="tk-segmented assistant-roles" role="radiogroup" aria-label="지침 대상">
        {ROLES.map((r) => (
          <label key={r.id}>
            <input type="radio" name="instruction-role" checked={role === r.id} onChange={() => setRole(r.id)} />
            {r.label}
          </label>
        ))}
      </div>
      <p className="tk-fieldset__help">
        {meta.help} 전역 Claude Code·Codex 설정(~/.claude, ~/.codex)과는 따로예요. 에이전트는 이 지침을 고칠 수 없어요.
      </p>
      {/* 역할을 바꾸면 고치던 글을 버리고 그 역할의 저장본을 새로 읽는다 */}
      <RoleEditor key={role} role={role} label={meta.label} placeholder={meta.placeholder} />
      {role !== "desk" && (
        <>
          <h3 className="assistant-sub">접수를 뺀 모든 실행에 같이 들어가는 고정 기억</h3>
          {brief ? <pre className="assistant-brief">{brief}</pre> : <p className="tk-fieldset__help">기억 탭에서 핀을 꽂은 기억이 여기에 모여요.</p>}
        </>
      )}
    </section>
  );
}

function RoleEditor({ role, label, placeholder }: { role: InstructionRole; label: string; placeholder: string }) {
  const q = useQuery({ queryKey: ["assistant", "instructions", role], queryFn: () => getInstructions(role) });
  const [text, setText] = useState<string | null>(null);
  const value = text ?? q.data?.text ?? "";
  const done = (message: string) => {
    setText(null);
    void q.refetch();
    toast({ message, tone: "success" });
  };
  const save = useMutation({ mutationFn: () => putInstructions(role, value), onSuccess: () => done(`${label} 지침을 저장했어요. 다음 지시부터 적용돼요.`) });
  const reset = useMutation({ mutationFn: () => resetInstructions(role), onSuccess: () => done(`${label} 지침을 기본값으로 되돌렸어요.`) });
  const dirty = text !== null && text !== q.data?.text;
  const canReset = role === "desk" && q.data && !q.data.is_default;
  return (
    <>
      {q.isError && <ErrorState error={q.error} what="지침" onRetry={() => void q.refetch()} />}
      <textarea
        className="tk-textarea assistant-instructions"
        rows={14}
        value={value}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={`${label} 지침`}
        maxLength={20000}
      />
      <div className="assistant-editor__foot">
        <p className="assistant-count">
          {q.data?.is_default && !dirty ? "기본값 · " : ""}
          {value.length.toLocaleString()} / 20,000자
        </p>
        {canReset && (
          <button className="tk-button tk-button--sm tk-button--ghost" type="button" aria-busy={reset.isPending || undefined} onClick={() => reset.mutate()}>
            기본값으로
          </button>
        )}
        <button className="tk-button tk-button--sm tk-button--primary" type="button" aria-disabled={!dirty || undefined} aria-busy={save.isPending || undefined} onClick={() => dirty && save.mutate()}>
          저장
        </button>
      </div>
      {(save.error || reset.error) && <p className="tk-error" role="alert">{errorText(save.error ?? reset.error).message}</p>}
    </>
  );
}

function MemoryTab() {
  const qc = useQueryClient();
  const id = useId();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<MemoryKind | "">("");
  const mems = useQuery({ queryKey: ["assistant", "memories", q, kind], queryFn: () => listMemories({ q: q || undefined, kind: kind || undefined }) });
  const ents = useQuery({ queryKey: ["assistant", "entities"], queryFn: () => listEntities() });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["assistant"] });
  const [draft, setDraft] = useState({ content: "", kind: "fact" as MemoryKind, entities: "", pinned: false });
  const add = useMutation({
    mutationFn: () => addMemory({ content: draft.content.trim(), kind: draft.kind, pinned: draft.pinned,
      entities: draft.entities.split(",").map((x) => x.trim()).filter(Boolean) }),
    onSuccess: () => {
      setDraft({ content: "", kind: draft.kind, entities: "", pinned: false });
      refresh();
    },
  });
  const pin = useMutation({ mutationFn: (m: { id: string; pinned: boolean }) => patchMemory(m.id, { pinned: !m.pinned }), onSuccess: refresh });
  const del = useMutation({ mutationFn: (mid: string) => deleteMemory(mid), onSuccess: refresh });
  const [ent, setEnt] = useState({ name: "", type: "project" as EntityType, summary: "" });
  const addEnt = useMutation({ mutationFn: () => addEntity({ name: ent.name.trim(), type: ent.type, summary: ent.summary.trim() || null }), onSuccess: () => { setEnt({ ...ent, name: "", summary: "" }); refresh(); } });
  const pinEnt = useMutation({ mutationFn: (e: { id: string; pinned: boolean }) => patchEntity(e.id, { pinned: !e.pinned }), onSuccess: refresh });
  const delEnt = useMutation({ mutationFn: (eid: string) => deleteEntity(eid), onSuccess: refresh });
  const [rel, setRel] = useState({ subject: "", predicate: "", object: "" });
  const addRel = useMutation({ mutationFn: () => addRelation(rel), onSuccess: () => { setRel({ subject: rel.subject, predicate: "", object: "" }); refresh(); toast({ message: "관계를 기록했어요." }); } });
  const err = add.error ?? pin.error ?? del.error ?? addEnt.error ?? addRel.error;

  return (
    <>
      <section className="tk-section" aria-labelledby={`${id}-m`}>
        <div className="tk-section__head"><h2 className="tk-section__title" id={`${id}-m`}>기억</h2></div>
        <p className="tk-fieldset__help">따까리가 대화 중에 스스로 쌓고(remember), 필요할 때 찾아 써요(recall). 핀을 꽂으면 모든 실행에 같이 들어가요.</p>
        <form className="assistant-form" onSubmit={(e) => { e.preventDefault(); if (draft.content.trim()) add.mutate(); }}>
          <textarea className="tk-textarea" rows={2} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="예) 나는 백엔드는 FastAPI 를 주로 쓴다" aria-label="새 기억" />
          <div className="assistant-form__row">
            <Select id={`${id}-kind`} value={draft.kind} options={KINDS} onChange={(k) => setDraft({ ...draft, kind: k })} size="sm" />
            <input className="tk-input tk-input--sm" value={draft.entities} onChange={(e) => setDraft({ ...draft, entities: e.target.value })} placeholder="관련 항목(쉼표로)" aria-label="관련 항목" />
            <label className="tk-switch"><input type="checkbox" role="switch" checked={draft.pinned} onChange={() => setDraft({ ...draft, pinned: !draft.pinned })} />핀</label>
            <button className="tk-button tk-button--sm tk-button--primary" type="submit" aria-disabled={!draft.content.trim() || undefined} aria-busy={add.isPending || undefined}>추가</button>
          </div>
        </form>
        <div className="tk-filterbar" role="search">
          <span className="tk-input-wrap"><Icon name="search" /><input className="tk-input tk-input--sm" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="기억 찾기" aria-label="기억 찾기" /></span>
          <div className="tk-chips" role="group" aria-label="종류">
            <button className="tk-chip" type="button" aria-pressed={kind === ""} onClick={() => setKind("")}>전체</button>
            {KINDS.map((k) => <button key={k.value} className="tk-chip" type="button" aria-pressed={kind === k.value} onClick={() => setKind(k.value)}>{k.label}</button>)}
          </div>
        </div>
        {err && <p className="tk-error" role="alert">{errorText(err).message}</p>}
        {mems.isPending && <ListSkeleton rows={3} label="기억을 불러오는 중" />}
        {mems.isSuccess && mems.data.memories.length === 0 && <EmptyState icon="tip" art="state-empty" artSize="sm" title="아직 기억이 없어요">위에서 직접 넣거나, 따까리와 대화하면 쌓여요.</EmptyState>}
        <ul className="tk-list" aria-label="기억 목록">
          {mems.data?.memories.map((m) => (
            <li key={m.id}>
              <div className="tk-list__item">
                <span className="tk-list__body">
                  <span className="tk-list__title tk-list__title--wrap">{m.content}</span>
                  <span className="tk-list__meta">
                    <span>{KIND_LABEL[m.kind]}</span>
                    {m.scope && <span>{SCOPE_LABEL[m.scope]}</span>}
                    <span>{m.source === "agent" ? "따까리가 기억" : m.source === "manual" ? "직접 넣음" : m.source}</span>
                    {m.entities.length > 0 && <span>{m.entities.join(", ")}</span>}
                  </span>
                </span>
                <span className="tk-list__end">
                  <button className="tk-icon-button tk-icon-button--sm" type="button" aria-pressed={m.pinned} aria-label={m.pinned ? "핀 빼기" : "핀 꽂기"} onClick={() => pin.mutate(m)}>
                    <Icon name="pin" />
                  </button>
                  <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label="기억 지우기" onClick={() => del.mutate(m.id)}>
                    <Icon name="trash" />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="tk-section" aria-labelledby={`${id}-e`}>
        <div className="tk-section__head"><h2 className="tk-section__title" id={`${id}-e`}>사람·프로젝트·도구 (온톨로지)</h2></div>
        <p className="tk-fieldset__help">나와 관련된 것들과 그 관계예요. 따까리가 recall 하면 관계까지 같이 찾아요.</p>
        <form className="assistant-form__row" onSubmit={(e) => { e.preventDefault(); if (ent.name.trim()) addEnt.mutate(); }}>
          <input className="tk-input tk-input--sm" value={ent.name} onChange={(e) => setEnt({ ...ent, name: e.target.value })} placeholder="이름" aria-label="항목 이름" />
          <Select id={`${id}-etype`} value={ent.type} options={ETYPES} onChange={(t) => setEnt({ ...ent, type: t })} size="sm" />
          <input className="tk-input tk-input--sm" value={ent.summary} onChange={(e) => setEnt({ ...ent, summary: e.target.value })} placeholder="한 줄 설명(선택)" aria-label="설명" />
          <button className="tk-button tk-button--sm" type="submit" aria-disabled={!ent.name.trim() || undefined}>추가</button>
        </form>
        <form className="assistant-form__row" onSubmit={(e) => { e.preventDefault(); if (rel.subject && rel.predicate && rel.object) addRel.mutate(); }}>
          <input className="tk-input tk-input--sm" value={rel.subject} onChange={(e) => setRel({ ...rel, subject: e.target.value })} placeholder="주어(예: winterholic)" aria-label="관계 주어" />
          <input className="tk-input tk-input--sm" value={rel.predicate} onChange={(e) => setRel({ ...rel, predicate: e.target.value })} placeholder="관계(예: works_on)" aria-label="관계" />
          <input className="tk-input tk-input--sm" value={rel.object} onChange={(e) => setRel({ ...rel, object: e.target.value })} placeholder="목적어(예: Ttakkari)" aria-label="관계 목적어" />
          <button className="tk-button tk-button--sm" type="submit" aria-disabled={!(rel.subject && rel.predicate && rel.object) || undefined}>잇기</button>
        </form>
        {ents.isSuccess && ents.data.entities.length === 0 && <p className="tk-fieldset__help">아직 항목이 없어요.</p>}
        <ul className="tk-list" aria-label="항목 목록">
          {ents.data?.entities.map((e) => (
            <li key={e.id}>
              <div className="tk-list__item">
                <span className="tk-list__body">
                  <span className="tk-list__title">{e.name}</span>
                  <span className="tk-list__meta"><span>{ETYPE_LABEL[e.type]}</span>{e.summary && <span>{e.summary}</span>}</span>
                </span>
                <span className="tk-list__end">
                  <button className="tk-icon-button tk-icon-button--sm" type="button" aria-pressed={e.pinned} aria-label={e.pinned ? "핀 빼기" : "핀 꽂기"} onClick={() => pinEnt.mutate(e)}><Icon name="pin" /></button>
                  <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label={`${e.name} 지우기`} onClick={() => delEnt.mutate(e.id)}><Icon name="trash" /></button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function KnowledgeTab() {
  const qc = useQueryClient();
  const id = useId();
  const src = useQuery({
    queryKey: ["assistant", "sources"],
    queryFn: listSources,
    refetchInterval: (q) => ((q.state.data?.sources ?? []).some((s) => s.indexing) ? 2000 : false),
  });
  const [path, setPath] = useState("");
  const add = useMutation({ mutationFn: () => addSource(path.trim()), onSuccess: () => { setPath(""); void qc.invalidateQueries({ queryKey: ["assistant"] }); } });
  const re = useMutation({ mutationFn: (sid: string) => reindexSource(sid), onSuccess: () => void src.refetch() });
  const del = useMutation({ mutationFn: (sid: string) => deleteSource(sid), onSuccess: () => void qc.invalidateQueries({ queryKey: ["assistant"] }) });
  const err = add.error ?? re.error ?? del.error;
  return (
    <>
      <section className="tk-section" aria-labelledby={`${id}-s`}>
        <div className="tk-section__head"><h2 className="tk-section__title" id={`${id}-s`}>지식 출처</h2></div>
        <p className="tk-fieldset__help">폴더 안의 마크다운·텍스트를 잘라 색인해요. 따까리가 recall 로 찾아 써요(키워드·부분 일치 검색, 별도 임베딩 모델 없음). 바뀐 파일만 매시간 다시 색인해요.</p>
        <form className="assistant-form__row" onSubmit={(e) => { e.preventDefault(); if (path.trim()) add.mutate(); }}>
          <input className="tk-input tk-input--sm tk-input--mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder="~/work-history" aria-label="폴더 경로" />
          <button className="tk-button tk-button--sm tk-button--primary" type="submit" aria-disabled={!path.trim() || undefined} aria-busy={add.isPending || undefined}>추가</button>
        </form>
        {err && <p className="tk-error" role="alert">{errorText(err).message}</p>}
        {src.isError && <ErrorState error={src.error} what="출처" onRetry={() => void src.refetch()} />}
        <ul className="tk-list" aria-label="출처 목록">
          {src.data?.sources.map((s) => (
            <li key={s.id}>
              <div className="tk-list__item">
                <span className="tk-glyph" data-type="other"><Icon name="folder" /></span>
                <span className="tk-list__body">
                  <span className="tk-list__title tk-mono">{s.path.replace(/^\/Users\/[^/]+/, "~")}</span>
                  <span className="tk-list__meta">
                    {s.scope && <span>{SCOPE_LABEL[s.scope]}</span>}
                    {s.category && <span>{CATEGORY_LABEL[s.category] ?? s.category}</span>}
                    {s.indexing ? <span><span className="tk-spinner tk-spinner--xs" aria-hidden /> 색인 중</span> : <span>문서 {s.documents} · 조각 {s.chunks}</span>}
                    <span>{s.pattern}</span>
                    {s.last_indexed_at && <span>{new Date(s.last_indexed_at).toLocaleString("ko-KR")}</span>}
                  </span>
                  {s.last_error && <span className="tk-error">{s.last_error}</span>}
                </span>
                <span className="tk-list__end">
                  <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label="다시 색인" disabled={s.indexing} onClick={() => re.mutate(s.id)}><Icon name="retry" /></button>
                  <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label="출처 빼기" onClick={() => del.mutate(s.id)}><Icon name="trash" /></button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="tk-section" aria-labelledby={`${id}-r`}>
        <div className="tk-section__head"><h2 className="tk-section__title" id={`${id}-r`}>찾기 시험·구조 보기</h2></div>
        <p className="tk-fieldset__help">검색 결과와 점수, 구조 트리, 온톨로지 그래프, 품질 진단은 맥락 도서관 화면으로 옮겼어요. 여기는 출처를 더하고 빼는 곳이에요.</p>
        <div className="assistant-form__row">
          <Link className="tk-button tk-button--sm" to="/context-library?tab=search"><Icon name="search" />검색 실험실 열기</Link>
          <Link className="tk-button tk-button--sm" to="/context-library"><Icon name="context-library" />맥락 도서관 열기</Link>
        </div>
      </section>
    </>
  );
}

function ToolsTab() {
  const q = useQuery({ queryKey: ["assistant", "tools"], queryFn: listTools, staleTime: Infinity });
  const tools = q.data?.tools ?? [];
  const groups = new Map<string, typeof tools>();
  for (const t of tools) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
  return (
    <section className="tk-section">
      <p className="tk-fieldset__help">따까리에서 도는 Claude Code·Codex 가 쓸 수 있는 ttakkari MCP 도구예요. 앱 기능이 늘면 여기에 같이 늘어나요.</p>
      {q.isPending && <ListSkeleton rows={4} label="도구를 불러오는 중" />}
      {[...groups].map(([g, list]) => (
        <div key={g} role="group" aria-label={g}>
          <p className="tk-list__group">{g}</p>
          <ul className="tk-list">
            {list.map((t) => (
              <li key={t.name}>
                <div className="tk-list__item">
                  <span className="tk-list__body">
                    <span className="tk-list__title tk-mono">{t.name}</span>
                    <span className="tk-list__meta"><span>{t.desc}</span><span>{t.who}</span></span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
