import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import type { GamePlay } from "../../api/gameTypes";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { requestPick } from "./pickBridge";
import type { PickHit, PickOutcome } from "./pickBridge";

export interface PickState {
  status: "idle" | "loading" | "done" | "error";
  outcome: PickOutcome | null;
  error: string | null;
  /** 탭한 위치(게임 화면 0~1 비율). 표시용이다 */
  at: [number, number] | null;
}

const IDLE: PickState = { status: "idle", outcome: null, error: null, at: null };

/** 오브젝트 선택 상태. pickAt(fx, fy)는 게임 화면의 0~1 비율 좌표로 묻는다. 마지막 요청의 결과만 남긴다. */
export function useObjectPick(frameRef: RefObject<HTMLIFrameElement | null>, play: GamePlay | undefined) {
  const [state, setState] = useState<PickState>(IDLE);
  const seq = useRef(0);
  const pickAt = useCallback(async (fx: number, fy: number) => {
    const frame = frameRef.current;
    if (!frame || !play) return;
    const mine = (seq.current += 1);
    setState({ status: "loading", outcome: null, error: null, at: [fx, fy] });
    try {
      const outcome = await requestPick(frame, play.origin, fx, fy);
      if (seq.current === mine) setState({ status: "done", outcome, error: null, at: [fx, fy] });
    } catch (e) {
      if (seq.current === mine) setState({ status: "error", outcome: null, error: e instanceof Error ? e.message : String(e), at: [fx, fy] });
    }
  }, [frameRef, play]);
  const reset = useCallback(() => {
    seq.current += 1;
    setState(IDLE);
  }, []);
  return { state, pickAt, reset };
}

const pct = (v: number) => `${Math.round(v * 10000) / 100}%`;

/** 게임 화면 위에 덮는 선택 레이어. 탭한 위치를 비율로 바꿔 pickAt 으로 보내고, 선택한 오브젝트의 경계를 박스로 보인다. */
export function ObjectPickLayer({ onPick, hit, at }: { onPick: (fx: number, fy: number) => void; hit: PickHit | null; at: [number, number] | null }) {
  return (
    <div
      className="game-pick"
      data-testid="game-pick-layer"
      role="button"
      tabIndex={0}
      aria-label="오브젝트를 고를 위치를 누르세요"
      onPointerUp={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        onPick(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
      }}
    >
      {hit && (
        <span
          className="game-pick__box"
          data-testid="game-pick-box"
          style={{ left: pct(hit.bounds.x), top: pct(hit.bounds.y), width: pct(hit.bounds.width), height: pct(hit.bounds.height) }}
        />
      )}
      {at && <span className="game-pick__dot" style={{ left: pct(at[0]), top: pct(at[1]) }} aria-hidden="true" />}
    </div>
  );
}

function hitTitle(h: PickHit): string {
  return h.name || (h.text ? `글자 "${h.text}"` : h.texture ? `이미지 ${h.texture}` : "이름 없는 오브젝트");
}

/** 선택 결과. 게임이 알려 준 관측 값만 보인다(소스 위치는 알 수 없다). */
export function ObjectPickPanel({
  state,
  selected,
  onSelect,
  onUse,
}: {
  state: PickState;
  selected: number;
  onSelect: (index: number) => void;
  /** 고른 오브젝트를 수정 요청에 담는다. 없으면 버튼을 보이지 않는다 */
  onUse?: (hit: PickHit) => void;
}) {
  if (state.status === "idle") return <p className="tk-help game-pick-panel">게임 화면에서 바꾸고 싶은 오브젝트를 눌러 보세요.</p>;
  if (state.status === "loading") return <p className="tk-status game-pick-panel" role="status"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />오브젝트를 찾는 중</p>;
  if (state.status === "error") return <p className="tk-error game-pick-panel" role="alert">{state.error}</p>;
  const outcome = state.outcome;
  if (!outcome) return null;
  if (!outcome.supported) {
    return (
      <p className="tk-help game-pick-panel" role="status">
        <Icon name="info" />
        <span>이 게임은 오브젝트 선택을 지원하지 않아요. {outcome.reason}</span>
      </p>
    );
  }
  if (outcome.hits.length === 0) {
    return <p className="tk-help game-pick-panel" role="status">그 위치에는 고를 수 있는 오브젝트가 없어요. 배경이거나 게임이 직접 그린 그림일 수 있어요.</p>;
  }
  return (
    <section className="game-pick-panel" aria-label="선택한 오브젝트">
      <p className="game-pick-panel__title">이 위치의 오브젝트 {outcome.hits.length}개{outcome.truncated ? " 이상" : ""} · 위에 그려진 것부터</p>
      <ul className="game-pick-list">
        {outcome.hits.map((h, i) => (
          <li key={`${h.scene}-${i}-${h.name}-${h.type}`}>
            <button type="button" className="game-pick-item" aria-pressed={i === selected} onClick={() => onSelect(i)}>
              <span className="game-pick-item__name">{hitTitle(h)}</span>
              <span className="game-pick-item__meta">
                {h.type}
                {h.texture ? ` · 텍스처 ${h.texture}` : ""}
                {h.container ? ` · ${h.container} 안` : ""}
                {h.scene ? ` · 씬 ${h.scene}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {onUse && outcome.hits[selected] && (
        <Button size="sm" variant="primary" onClick={() => onUse(outcome.hits[selected])}>
          <Icon name="send" />
          <span>{"'" + hitTitle(outcome.hits[selected]) + "' 수정 요청에 담기"}</span>
        </Button>
      )}
    </section>
  );
}
