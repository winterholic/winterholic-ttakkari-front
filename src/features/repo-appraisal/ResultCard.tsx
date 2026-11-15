import type { CSSProperties } from "react";
import { APPRAISAL_AXES } from "../../api/repoAppraisalTypes";
import type { AppraisalDetail } from "../../api/repoAppraisalTypes";
import { Badge } from "../../ui/Badge";
import {
  AXIS_LABEL, AXIS_STATE_LABEL, ITEM_STATUS_LABEL, MODE_LABEL, REPO_TYPE_LABEL,
  axisItems, axisState, evidenceLines, fmtDelta, fmtScore, itemName,
} from "./format";

/** 완료된 평가의 결과 카드. 등급·점수·축 막대·약점·총평·근거 펼침·비용 순서다. */
export function ResultCard({ appraisal }: { appraisal: AppraisalDetail }) {
  const result = appraisal.result;
  if (!result || appraisal.weighted_score === null || appraisal.grade === null) return null;
  const delta = fmtDelta(appraisal.delta);
  const deltaDir = appraisal.delta === null || appraisal.delta === 0 ? "same" : appraisal.delta > 0 ? "up" : "down";
  return (
    <section className="ra-card" aria-labelledby="ra-result-title">
      <h2 id="ra-result-title" className="ra-card__title">평가 결과</h2>
      <div className="ra-score">
        <p className="ra-score__grade">{appraisal.grade}</p>
        <p className="ra-score__points">{fmtScore(appraisal.weighted_score)}점</p>
        <p className="ra-score__meta">
          {result.repo_type ? REPO_TYPE_LABEL[result.repo_type] : "유형 미확인"} · {MODE_LABEL[appraisal.mode]} 모드
        </p>
        {delta && (
          <p className="ra-delta" data-dir={deltaDir} aria-label={appraisal.delta === 0 ? "이전 평가와 같은 점수예요" : `이전 평가보다 ${Math.abs(appraisal.delta ?? 0).toFixed(1)}점 ${deltaDir === "up" ? "올랐어요" : "내려갔어요"}`}>
            {delta}
          </p>
        )}
      </div>
      <ul className="ra-axes" aria-label="축별 점수">
        {APPRAISAL_AXES.map((axis) => {
          const st = axisState(axis, result);
          return (
            <li key={axis} className="ra-axis" data-testid={`axis-${axis}`}>
              <div className="ra-axis__head">
                <span className="ra-axis__name">{AXIS_LABEL[axis]}</span>
                {axis === "originality" && <span className="ra-axis__lowrel">의견·신뢰도 낮음</span>}
                <span className="ra-axis__value" data-kind={st.kind}>{st.kind === "scored" ? `${fmtScore(st.value)} / 5` : AXIS_STATE_LABEL[st.kind]}</span>
              </div>
              {st.kind === "scored" && (
                <span
                  role="progressbar" aria-label={AXIS_LABEL[axis]} aria-valuenow={st.value} aria-valuemin={0} aria-valuemax={5}
                  className="tk-progress" style={{ "--tk-progress": st.value / 5 } as CSSProperties}
                />
              )}
            </li>
          );
        })}
      </ul>
      {result.weaknesses.length > 0 && (
        <div className="ra-block">
          <h3 className="ra-block__title">약점 Top 3</h3>
          <ol className="ra-weak">
            {result.weaknesses.map((w) => (
              <li key={w.item}>
                <p className="ra-weak__item">{itemName(w.item)} · {fmtScore(w.score)}점</p>
                <p className="ra-weak__advice">{w.advice}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
      {result.summary && (
        <div className="ra-block">
          <h3 className="ra-block__title">한 줄 총평</h3>
          <p className="ra-summary">{result.summary}</p>
        </div>
      )}
      <div className="ra-block">
        <h3 className="ra-block__title">항목별 근거</h3>
        {APPRAISAL_AXES.map((axis) => {
          const items = axisItems(axis, result.items);
          if (items.length === 0) return null;
          return (
            <details key={axis} className="ra-disclosure">
              <summary>{AXIS_LABEL[axis]} 항목 {items.length}건</summary>
              <ul>
                {items.map((i) => (
                  <li key={i.item}>
                    <p className="ra-evidence__item">
                      <span>{itemName(i.item)}</span>
                      {i.score !== null ? <span>{fmtScore(i.score)} / 5</span> : <Badge>{ITEM_STATUS_LABEL[i.status]}</Badge>}
                    </p>
                    {evidenceLines(i.evidence).map((line) => <p key={line} className="ra-evidence__line">{line}</p>)}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
      <p className="ra-cost">
        {appraisal.llm_used ? `LLM 사용 · ${appraisal.llm_model ?? "모델 미확인"}` : "결정론 점수만"} · 근거 {appraisal.evidence_chars.toLocaleString("ko-KR")}자
      </p>
    </section>
  );
}
