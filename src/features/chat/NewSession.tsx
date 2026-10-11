import { useEffect } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { listAccounts, systemInfo } from "../../api/client";
import { useOverride } from "../accounts/OverrideDialog";
import { errorText } from "../viewer/api";
import { useDefaultWorkspace } from "../workspace/useDefaultWorkspace";
import type { Effort, EngineName } from "../../api/types";
import { Select } from "../../ui/Select";
import type { SelectOption } from "../../ui/Select";

export interface NewSessionChoice {
  workspaceId: string;
  engine: EngineName;
  model: string | null;
  effort: Effort | null;
}

const MODELS: Record<EngineName, SelectOption<string>[]> = {
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

// 모델 이름은 그 엔진 계정에만 넘어간다(Claude 모델 → Claude 계정, Codex 모델 → Codex 계정). 백엔드 profiles.model_engine.
const MODEL_OPTIONS: SelectOption<string>[] = [
  { value: "", label: "기본 모델(계정마다 기본값)" },
  ...MODELS.claude.filter((m) => m.value).map((m) => ({ value: m.value, label: `Claude · ${m.label}` })),
  ...MODELS.codex.filter((m) => m.value).map((m) => ({ value: m.value, label: `Codex · ${m.label}` })),
];

const EFFORTS: SelectOption<Effort | "">[] = [
  { value: "", label: "기본" },
  { value: "low", label: "낮음" },
  { value: "medium", label: "보통" },
  { value: "high", label: "높음" },
  { value: "xhigh", label: "매우 높음" },
];

/** 세션이 없는 /chat 화면. 첫 지시를 보내면 세션이 만들어진다. */
export function NewSession({ value, onChange }: { value: NewSessionChoice | null; onChange: (v: NewSessionChoice) => void }) {
  const ws = useDefaultWorkspace();
  const accs = useQuery({ queryKey: ["accounts"], queryFn: listAccounts, staleTime: 30_000 });
  const ov = useOverride();
  const top = (() => {
    const list = accs.data ?? [];
    const ids = ov.data?.active ? ov.data.ids : [];
    const ordered = [...list].sort((a, b) => {
      const ra = ids.indexOf(a.id), rb = ids.indexOf(b.id);
      return (ra < 0 ? ids.length : ra) - (rb < 0 ? ids.length : rb) || a.priority - b.priority;
    });
    return ordered.find((a) => a.enabled);
  })();
  const info = useQuery({ queryKey: ["systemInfo"], queryFn: systemInfo, staleTime: 60_000 });
  const first = ws.data;
  useEffect(() => {
    if (!value && first) onChange({ workspaceId: first.id, engine: "claude", model: null, effort: null });
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
  const noEngine = info.data && !info.data.engines.claude && !info.data.engines.codex;

  return (
    <div className="tk-thread__inner">
      <div className="tk-empty">
        <span className="tk-avatar tk-avatar--agent" aria-hidden />
        <p className="tk-empty__title">무엇을 시킬까요?</p>
        <p>무엇이든 말로 지시하세요. 따까리가 일을 나눠 작업 세션에 맡기고, 끝나면 정리해서 알려 줘요. Claude Code 를 먼저 쓰고, 사용량 한도에 걸리면 다음 계정(마지막엔 Codex)으로 이어가요.</p>
      </div>
      {noEngine && (
        <aside className="tk-callout tk-callout--warning" role="status">
          <div className="tk-callout__body"><p>이 Mac 에 Claude Code 도 Codex 도 없어요. 하나는 설치해야 지시할 수 있어요.</p></div>
        </aside>
      )}
      <div className="tk-grid tk-grid--2">
        <div className="tk-field">
          <label className="tk-label" id="ns-model-label" htmlFor="ns-model">모델</label>
          <Select
            id="ns-model"
            labelledBy="ns-model-label"
            value={current?.model ?? ""}
            options={MODEL_OPTIONS}
            onChange={(model) => set({ model: model || null })}
          />
          {top && (
            <p className="tk-help">
              <span>지금 1순위: {top.name} ({top.engine === "codex" ? "Codex" : "Claude Code"}). 고른 모델은 그 엔진 계정에서만 쓰여요.</span>
            </p>
          )}
        </div>
        <div className="tk-field">
          <label className="tk-label" id="ns-effort-label" htmlFor="ns-effort">추론 강도</label>
          <Select
            id="ns-effort"
            labelledBy="ns-effort-label"
            value={current?.effort ?? ""}
            options={EFFORTS}
            onChange={(effort) => set({ effort: (effort || null) as Effort | null })}
          />
        </div>
      </div>
    </div>
  );
}
