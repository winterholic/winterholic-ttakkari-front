import { useQuery } from "@tanstack/react-query";
import { getHarnessLayers } from "../../api/client";
import type { HarnessLayer, HarnessSession, LayerEngine } from "../../api/harnessTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { failure } from "./Finder";
import { LAYER_ENGINE_LABEL, ORIGIN_LABEL, PHASE_LABEL, SESSION_HINT, SESSION_LABEL } from "./labels";

const SESSIONS: HarnessSession[] = ["desk", "lead", "worker", "orchestrator"];
const ENGINES: LayerEngine[] = ["claude", "codex", "antigravity", "muse", "qwen-local"];
// 접수는 Qwen 라우터가 1순위이고 codex·claude 가 폴백이다. antigravity·muse 는 접수에 쓰이지 않는다.
const DESK_ENGINES: LayerEngine[] = ["qwen-local", "codex", "claude"];

export interface LayerState { session: HarnessSession; engine: LayerEngine; pool: "personal" | "work" }

function LayerCard({ layer, open }: { layer: HarnessLayer; open: (id: string) => void }) {
  return <li className="hv-layer" data-applied={layer.applies} data-evidence={layer.evidence}>
    <span className="hv-layer__order" aria-hidden="true">{layer.order}</span>
    <div className="hv-layer__body">
      <div className="hv-layer__title">
        <h3 className="tk-heading-4 hv-break">{layer.title}</h3>
        <Badge tone={layer.applies ? "success" : undefined}>{layer.applies ? "적용" : "미적용"}</Badge>
      </div>
      <span className="hv-badges">
        <Badge>{PHASE_LABEL[layer.phase]}</Badge>
        <Badge mono>{ORIGIN_LABEL[layer.origin]}</Badge>
        <Badge tone={layer.evidence === "code" ? "info" : "warning"}>{layer.evidence === "code" ? "코드로 확인" : "엔진 동작 · 확인 필요"}</Badge>
      </span>
      <code className="hv-path hv-path--full">{layer.source}</code>
      {layer.condition && <p className="hv-note">{layer.condition}</p>}
      {layer.chars > 0 && <p className="hv-note">{layer.chars.toLocaleString()}자</p>}
      {layer.preview && <details className="hv-disclosure"><summary>미리보기</summary><pre className="hv-code">{layer.preview}</pre></details>}
      {layer.item_id && <Button variant="ghost" size="sm" onClick={() => open(layer.item_id!)}>원문·상세 보기<Icon name="chevron-right" /></Button>}
    </div>
  </li>;
}

export function Layers({ state, update, openItem }: { state: LayerState; update: (v: Record<string, string | null>) => void; openItem: (id: string) => void }) {
  const engines = state.session === "desk" ? DESK_ENGINES : ENGINES;
  const engine = engines.includes(state.engine) ? state.engine : engines[0];
  const query = useQuery({ queryKey: ["harness-layers", state.session, engine, state.pool], queryFn: () => getHarnessLayers(state.session, engine, state.pool) });
  const data = query.data;
  return <div className="hv-layers-view">
    <section className="hv-layer-controls" aria-label="세션과 엔진 선택">
      <div className="hv-field"><span>세션 종류</span>
        <div className="hv-segment" role="group" aria-label="세션 종류">
          {SESSIONS.map((s) => <button key={s} type="button" aria-pressed={state.session === s} onClick={() => update({ s })}>{SESSION_LABEL[s]}</button>)}
        </div>
        <p className="hv-note">{SESSION_HINT[state.session]}</p>
      </div>
      <label className="hv-field"><span>엔진</span>
        <select className="tk-select" aria-label="엔진 선택" value={engine} onChange={(e) => update({ le: e.target.value })}>
          {engines.map((e) => <option key={e} value={e}>{LAYER_ENGINE_LABEL[e]}{state.session === "desk" && e === "qwen-local" ? " (1순위 라우터)" : ""}</option>)}
        </select></label>
      <div className="hv-field"><span>범위</span>
        <div className="hv-segment" role="group" aria-label="개인·회사">
          {(["personal", "work"] as const).map((p) => <button key={p} type="button" aria-pressed={state.pool === p} onClick={() => update({ pool: p === "personal" ? null : p })}>{p === "personal" ? "개인" : "회사"}</button>)}
        </div>
      </div>
    </section>
    <section className="hv-layer-result" aria-label="합쳐지는 레이어">
      {query.isPending && <p role="status" className="hv-note">레이어를 조립하는 중</p>}
      {query.isError && <div className="hv-error"><p className="tk-error" role="alert">{failure(query.error)}</p><Button variant="ghost" onClick={() => void query.refetch()}>다시 시도</Button></div>}
      {data && <>
        <div className="hv-layer-summary" role="status">
          <strong>{data.session_label} · {LAYER_ENGINE_LABEL[data.engine]}</strong>
          <span>프롬프트 합본 {data.prompt_chars.toLocaleString()}자</span>
          <span>적용 {data.applied}/{data.total}</span>
          {data.external > 0 && <span>엔진 CLI 동작 {data.external}개(코드 밖)</span>}
        </div>
        {data.notes.length > 0 && <ul className="hv-notes">{data.notes.map((n) => <li key={n}><Icon name="info" /><span>{n}</span></li>)}</ul>}
        <ol className="hv-layer-list" aria-label="적용 순서">{data.layers.map((l) => <LayerCard key={l.id} layer={l} open={openItem} />)}</ol>
        <p className="hv-note">위에서 아래 순서로 합쳐져요. "엔진 동작"은 이 저장소 코드가 아니라 각 엔진 CLI 가 스스로 읽는 파일이라 코드만으로는 확인할 수 없어요.</p>
      </>}
    </section>
  </div>;
}
