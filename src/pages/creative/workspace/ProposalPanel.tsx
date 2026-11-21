import { useState } from "react";
import type { IntentResolveResult } from "../../../api/creativeV2";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Dialog } from "../../../ui/Dialog";
import { Icon } from "../../../ui/Icon";
import { ASPECT_LABEL, UNSUPPORTED_REASON, DEDICATED_GROUPS, durationLabel, labelOf, optionLabel } from "./intentModel";
import type { Labels } from "./intentModel";

/** AI가 비워 둔 설정에 어떻게 채울지 미리 보여 주는 제안. 고르지 않은 설정은 이 값으로 진행하되 사용자가 바꿀 수 있다. */
export function ProposalPanel({ result, labels }: { result: IntentResolveResult; labels: Labels }) {
  const [detail, setDetail] = useState(false);
  const { intent, layout } = result;
  const confirmed = intent.conditions.filter((c) => c.origin === "user_confirmed");
  const unconfirmed = intent.conditions.length - confirmed.length;
  const proposals = layout.questions
    .filter((q) => q.recommended && !DEDICATED_GROUPS.has(q.group))
    .map((q) => ({ id: q.field_id, label: labels.fields.get(q.field_id)?.label ?? q.field_id, value: optionLabel(labels.fields.get(q.field_id), q.recommended!, labels), reason: q.reason }));
  const open = layout.questions.filter((q) => !q.recommended && !DEDICATED_GROUPS.has(q.group)).length;
  return (
    <section className="tk-card cw-proposal" aria-labelledby="cw-proposal-title">
      <header className="cw-proposal__head">
        <h3 id="cw-proposal-title">AI 제작 제안</h3>
        <Button size="xs" onClick={() => setDetail(true)}>상세 보기</Button>
      </header>
      <p className="cw-proposal__summary">
        {confirmed.length
          ? confirmed.map((c) => labelOf(labels, c.id)).join(" · ")
          : "아직 확정한 조건이 없어요."}
        {` · ${durationLabel(intent.duration)}`}{intent.aspect ? ` · ${ASPECT_LABEL[intent.aspect.value]}` : ""}
      </p>
      {unconfirmed > 0 && <p className="cw-hint"><Icon name="sparkles" /> 확정하지 않은 값 {unconfirmed}개는 제안에만 쓰고 계획에는 넣지 않아요.</p>}
      {proposals.length > 0 ? (
        <>
          <h4>고르지 않으면 이렇게 진행해요</h4>
          <ul className="cw-proposal__list">
            {proposals.map((p) => <li key={p.id} title={p.reason}><strong>{p.label}</strong><span>{p.value}</span></li>)}
          </ul>
        </>
      ) : <p className="cw-hint">조건을 고르면 AI가 장면에 맞는 값을 제안해요.</p>}
      {open > 0 && <p className="cw-hint">추천값이 없는 설정 {open}개는 AI가 장면별로 정해요.</p>}
      {intent.unsupported.length > 0 && (
        <div className="tk-callout tk-callout--warning" role="note">
          <Icon className="tk-callout__icon" name="warning" />
          <div className="tk-callout__body">
            <strong className="tk-callout__title">지금은 반영하지 못해요</strong>
            <ul>{intent.unsupported.map((u) => <li key={u.id}>{UNSUPPORTED_REASON[u.reason]}: {u.subject}. {u.message}{u.alternatives.length ? ` 대안: ${u.alternatives.join(", ")}` : ""}</li>)}</ul>
          </div>
        </div>
      )}
      <p className="cw-hint">제작 도구와 실행 가능 여부는 계획을 만든 뒤 장면별로 확인해요. 이 제안은 실행 보장이 아니에요.</p>
      <Dialog open={detail} onClose={() => setDetail(false)} size="lg" title="제안 상세" footer={<Button variant="primary" onClick={() => setDetail(false)}>닫기</Button>}>
        <div className="cw-detail">
          <dl className="cw-detail__facts">
            <div><dt>의도 버전</dt><dd>revision {intent.revision} · 규칙 {layout.rules_version}</dd></div>
            <div><dt>적용된 규칙</dt><dd>{layout.applied_rules.join(", ") || "없음"}</dd></div>
            <div><dt>계획 가능 판정</dt><dd>{result.ready_for_plan ? "가능" : `막힘: ${result.blocking.join(", ")}`}</dd></div>
            <div><dt>길이 판정</dt><dd>{result.length.status} · {result.length.message}</dd></div>
          </dl>
          <h4>숨긴 설정</h4>
          {layout.hidden.length ? <ul>{layout.hidden.map((h) => <li key={h.field_id}>{labels.fields.get(h.field_id)?.label ?? h.field_id}: {h.reason}</li>)}</ul> : <p className="cw-hint">숨긴 설정이 없어요.</p>}
          <h4>변경 이력</h4>
          <ol className="cw-detail__history">
            {intent.history.slice(-30).map((h, i) => <li key={i}>r{h.revision} · {h.actor} · {h.action}{h.detail ? ` · ${h.detail}` : ""}</li>)}
          </ol>
          <Badge mono>{`conditions ${intent.conditions.length}`}</Badge>
        </div>
      </Dialog>
    </section>
  );
}
