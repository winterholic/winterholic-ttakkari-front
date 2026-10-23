import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { getHarnessSummary } from "../api/client";
import type { HarnessSession, LayerEngine } from "../api/harnessTypes";
import { Detail } from "../features/harness/Detail";
import { Filters, ResultList, SearchBar, SummaryBar, failure, type FinderState } from "../features/harness/Finder";
import { Layers } from "../features/harness/Layers";
import { PageHeader } from "../shell/PageHeader";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { formatTime } from "../features/harness/labels";
import "../features/harness/harness.css";

type View = "find" | "layers";
const SESSIONS: HarnessSession[] = ["desk", "lead", "worker", "orchestrator"];
const LAYER_ENGINES: LayerEngine[] = ["claude", "codex", "antigravity", "muse", "qwen-local"];

/**
 * 부가 기능 > 하네스. 내 Claude Code·Codex·Antigravity 설정과 따까리가 세션에 주입하는 지침을 한 곳에서 읽기만 한다.
 * 백엔드 ADR 0069. 편집 기능은 없고, 값은 서버에서 마스킹된 채로 온다. 상태는 모두 URL 에 둔다.
 */
export function HarnessPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: ["harness-summary"], queryFn: () => getHarnessSummary() });
  const view: View = params.get("view") === "layers" ? "layers" : "find";
  const selected = params.get("item") || "";
  const state: FinderState = {
    q: params.get("q") || "", cat: params.get("cat") || "", engine: params.get("engine") || "", scope: params.get("scope") || "",
    active: params.get("active") === "1" ? "1" : params.get("active") === "0" ? "0" : "",
    warn: params.get("warn") === "1", hideMissing: params.get("hide_missing") === "1",
  };
  const session = (SESSIONS.find((s) => s === params.get("s")) ?? "lead");
  const layerEngine = (LAYER_ENGINES.find((e) => e === params.get("le")) ?? "claude");
  const pool = params.get("pool") === "work" ? "work" : "personal";

  const update = useCallback((values: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(values)) { if (v) next.set(k, v); else next.delete(k); }
      return next;
    });
  }, [setParams]);
  const setQuery = useCallback((q: string) => update({ q: q || null, item: null }), [update]);
  const openItem = useCallback((id: string) => {
    update({ view: null, item: id });
    if (window.matchMedia?.("(max-width: 1023px)").matches) requestAnimationFrame(() => document.querySelector(".hv-detail")?.scrollIntoView({ block: "start" }));
  }, [update]);
  const refresh = async () => {
    await getHarnessSummary(true).then((data) => queryClient.setQueryData(["harness-summary"], data));
    await queryClient.invalidateQueries({ queryKey: ["harness-items"] });
    await queryClient.invalidateQueries({ queryKey: ["harness-item"] });
    await queryClient.invalidateQueries({ queryKey: ["harness-layers"] });
  };
  const data = summary.data;

  return <div className="tk-screen">
    <PageHeader title="하네스" meta="내 하네스를 한 곳에서 · 읽기 전용" actions={
      <button type="button" className="tk-icon-button" aria-label="다시 읽기" onClick={() => void refresh()}><Icon name="retry" /></button>
    } />
    <div className="tk-screen__body"><div className="tk-container tk-container--lg hv-page" data-selected={Boolean(selected && view === "find")}>
      <nav className="hv-tabs" aria-label="보기 방식">
        <button type="button" aria-pressed={view === "find"} onClick={() => update({ view: null })}>찾기</button>
        <button type="button" aria-pressed={view === "layers"} onClick={() => update({ view: "layers", item: null })}>세션별로 보기</button>
      </nav>
      {summary.isPending && <p className="hv-note" role="status">하네스를 읽는 중</p>}
      {summary.isError && <div className="hv-error"><p className="tk-error" role="alert">{failure(summary.error)}</p><Button variant="ghost" onClick={() => void summary.refetch()}>다시 시도</Button></div>}
      {data && view === "layers" && <Layers state={{ session, engine: layerEngine, pool }} update={update} openItem={openItem} />}
      {data && view === "find" && <>
        <div className="hv-top" data-selected={Boolean(selected)}>
          <SearchBar value={state.q} onSubmit={setQuery} />
          <SummaryBar summary={data} state={state} update={update} openItem={openItem} />
          <Filters summary={data} state={state} update={update} />
        </div>
        <div className="hv-browser" data-selected={Boolean(selected)}>
          <ResultList state={state} selected={selected} select={openItem} />
          {selected
            ? <Detail key={selected} id={selected} query={state.q} back={() => update({ item: null })} openSession={(s) => update({ view: "layers", s, item: null })} />
            : <div className="hv-placeholder"><p>항목을 고르면 출처 경로, 적용 범위, 본문이 여기에 보여요.</p><p className="hv-note">“세션별로 보기”에서는 접수·기획·작업자 세션에 어떤 지침이 어떤 순서로 합쳐지는지 볼 수 있어요.</p></div>}
        </div>
        <p className="hv-note hv-foot">읽은 시각 {formatTime(data.generated_at)} · 파일은 수정하지 않고 비밀 값은 서버에서 가려요.</p>
      </>}
    </div></div>
  </div>;
}
