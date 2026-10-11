import { useEffect } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { systemInfo } from "../../api/client";
import { errorText } from "../viewer/api";
import { useDefaultWorkspace } from "../workspace/useDefaultWorkspace";
import type { Effort, EngineName } from "../../api/types";

export interface NewSessionChoice {
  workspaceId: string;
  engine: EngineName;
  model: string | null;
  effort: Effort | null;
}

const MODELS: Record<EngineName, { value: string; label: string }[]> = {
  claude: [
    { value: "", label: "기본 모델" },
    { value: "opus", label: "Opus" },
    { value: "sonnet", label: "Sonnet" },
    { value: "haiku", label: "Haiku(빠름)" },
  ],
  codex: [
    { value: "", label: "기본 모델" },
    { value: "gpt-6-luna", label: "GPT-6 Luna" },
    { value: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
  ],
};

const EFFORTS: { value: Effort | ""; label: string }[] = [
  { value: "", label: "기본" },
  { value: "low", label: "낮음" },
  { value: "medium", label: "보통" },
  { value: "high", label: "높음" },
  { value: "xhigh", label: "매우 높음" },
];

/** 세션이 없는 /chat 화면. 첫 지시를 보내면 세션이 만들어진다. */
export function NewSession({ value, onChange }: { value: NewSessionChoice | null; onChange: (v: NewSessionChoice) => void }) {
  const ws = useDefaultWorkspace();
  const info = useQuery({ queryKey: ["systemInfo"], queryFn: systemInfo, staleTime: 60_000 });
  const first = ws.data;
  useEffect(() => {
    if (!value && first) onChange({ workspaceId: first.id, engine: first.default_engine as EngineName, model: null, effort: null });
  }, [value, first, onChange]);
  const current = value;

  const set = (patch: Partial<NewSessionChoice>) => {
    if (current) onChange({ ...current, ...patch });
  };

  if (ws.isPending) {
    return (
      <div className="tk-thread__inner">
        <p className="tk-thinking">
          <span className="tk-spinner tk-spinner--sm" aria-hidden />
          작업 공간을 불러오는 중
        </p>
      </div>
    );
  }
  if (ws.isError) {
    return (
      <div className="tk-thread__inner">
        <div className="tk-empty">
          <p className="tk-empty__title">작업 공간을 불러오지 못했어요</p>
          <p>{errorText(ws.error).message}</p>
          <div className="tk-button-group">
            <button className="tk-button" type="button" onClick={() => void ws.refetch()}>
              다시 시도
            </button>
            <Link className="tk-button" to="/settings">
              설정 열기
            </Link>
          </div>
        </div>
      </div>
    );
  }
  const engineMissing = current && info.data && !info.data.engines[current.engine];

  return (
    <div className="tk-thread__inner">
      <div className="tk-empty">
        <span className="tk-avatar tk-avatar--agent" aria-hidden />
        <p className="tk-empty__title">무엇을 시킬까요?</p>
        <p>Mac Studio에서 할 일을 말로 지시하세요. 엔진과 모델은 아래에서 고를 수 있어요.</p>
      </div>
      <div className="tk-grid tk-grid--2">
        <div className="tk-field">
          <label className="tk-label" htmlFor="ns-engine">엔진</label>
          <span className="tk-select">
            <select id="ns-engine" value={current?.engine ?? "claude"} onChange={(e) => set({ engine: e.target.value as EngineName, model: null })}>
            <option value="claude">Claude Code</option>
            <option value="codex">Codex</option>
          </select>
          </span>
          {engineMissing && <p className="tk-error">이 Mac 에 {current?.engine} CLI 가 없어요.</p>}
        </div>
        <div className="tk-field">
          <label className="tk-label" htmlFor="ns-model">모델</label>
          <span className="tk-select">
            <select id="ns-model" value={current?.model ?? ""} onChange={(e) => set({ model: e.target.value || null })}>
            {MODELS[current?.engine ?? "claude"].map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          </span>
        </div>
        <div className="tk-field">
          <label className="tk-label" htmlFor="ns-effort">추론 강도</label>
          <span className="tk-select">
            <select id="ns-effort" value={current?.effort ?? ""} onChange={(e) => set({ effort: (e.target.value || null) as Effort | null })}>
            {EFFORTS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          </span>
        </div>
      </div>
    </div>
  );
}
