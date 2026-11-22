import type { IntentFacetField, IntentLayout, IntentQuestion } from "../../../api/creativeV2";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Dialog } from "../../../ui/Dialog";
import { Icon } from "../../../ui/Icon";
import { ConditionPicker, ExtraDimensionPicker } from "./ConditionPicker";
import type { ConditionActions } from "./ConditionPicker";
import { FieldInput } from "./FieldInput";
import { answerRecordedOnly } from "./feasibility";
import { DEDICATED_GROUPS, labelOf, optionLabel } from "./intentModel";
import type { Labels } from "./intentModel";
import type { IntentSpecV2 } from "../../../api/creativeV2";

type Answer = (fieldId: string, values: string[]) => void;

function QuestionBlock({ question, field, labels, disabled, onAnswer }: {
  question: IntentQuestion; field: IntentFacetField; labels: Labels; disabled: boolean; onAnswer: Answer;
}) {
  const rec = question.recommended;
  const recLabel = rec ? optionLabel(field, rec, labels) : null;
  return (
    <div className="cw-q" data-mode={question.mode}>
      <div className="cw-q__title">
        <strong>{question.question}</strong>
        {question.mode === "confirm" && <Badge tone="warning">확인 필요</Badge>}
      </div>
      <FieldInput field={field} values={[]} recommended={rec} disabled={disabled} labelOf={(v) => optionLabel(field, v, labels)} onAnswer={(v) => onAnswer(field.id, v)} />
      {rec
        ? <p className="cw-q__rec"><Icon name="sparkles" /><span><strong>AI 추천: {recLabel}</strong> · {question.reason}</span>
            <Button size="xs" disabled={disabled} aria-label={`${question.question} 추천대로 ${recLabel}`} onClick={() => onAnswer(field.id, [rec])}>추천대로</Button></p>
        : <p className="cw-q__rec cw-q__rec--none">고르지 않으면 AI가 장면에 맞게 제안해요.</p>}
      {question.alternatives.length > 0 && (
        <p className="cw-q__alt">다른 후보: {question.alternatives.map((a) => `${optionLabel(field, a.value, labels)}(${a.reason})`).join(" · ")}</p>
      )}
    </div>
  );
}

/** 서버는 조건이 아닌 값을 담은 답변을 의도에만 저장하고 제작에는 쓰지 않는다. 그 사실을 답변 옆에 표시한다. */
function RecordedOnlyBadge({ values, labels }: { values: string[]; labels: Labels }) {
  if (!answerRecordedOnly(values, labels.catalogIds)) return null;
  return <span title="이 답변은 의도에 저장되지만 이 설정을 소비하는 제작 경로가 아직 없어요. 영상에는 반영되지 않을 수 있어요."><Badge tone="warning">계획에만 기록</Badge></span>;
}

function AnsweredBlock({ field, values, labels, disabled, onAnswer }: {
  field: IntentFacetField; values: string[]; labels: Labels; disabled: boolean; onAnswer: Answer;
}) {
  return (
    <div className="cw-q" data-mode="answered">
      <div className="cw-q__title"><strong>{field.question}</strong><Badge tone="success">내가 정함</Badge><RecordedOnlyBadge values={values} labels={labels} /></div>
      <FieldInput field={field} values={values} disabled={disabled} labelOf={(v) => optionLabel(field, v, labels)} onAnswer={(v) => onAnswer(field.id, v)} />
    </div>
  );
}

/** 활성 설정 묶음. 서버가 계산한 묶음과 중복 없는 질문만 그린다. 12개 카탈로그를 나열하지 않는다. */
export function GroupCards({ layout, labels, disabled, onAnswer }: { layout: IntentLayout; labels: Labels; disabled: boolean; onAnswer: Answer }) {
  const questions = new Map(layout.questions.map((q) => [q.field_id, q]));
  const answered = new Map(layout.answered.map((a) => [a.field_id, a.values]));
  const hidden = new Set(layout.hidden.map((h) => h.field_id));
  const groups = layout.groups.filter((g) => !DEDICATED_GROUPS.has(g.id));
  if (groups.length === 0) return null;
  return (
    <div className="cw-groups">
      {groups.map((g) => {
        const fields = g.fields.map((id) => labels.fields.get(id)).filter((f): f is IntentFacetField => !!f && !hidden.has(f.id));
        const main = fields.filter((f) => answered.has(f.id) || (questions.get(f.id) && questions.get(f.id)!.tier === "essential"));
        const extra = fields.filter((f) => !main.includes(f));
        const reasons = [...new Set(g.reasons)];
        return (
          <section key={g.id} className="tk-card cw-group" aria-labelledby={`cw-group-${g.id}`} data-group={g.id}>
            <header className="cw-group__head">
              <h3 id={`cw-group-${g.id}`}>{g.title}</h3>
              {g.tier === "advanced" && <Badge>전문</Badge>}
            </header>
            <p className="cw-group__why"><Icon name="info" /><span>{g.triggered_by.map((id) => labelOf(labels, id)).join(" · ")}{g.triggered_by.length ? " 조합이라 열렸어요. " : ""}{reasons.join(" ")}</span></p>
            {main.map((f) => answered.has(f.id)
              ? <AnsweredBlock key={f.id} field={f} values={answered.get(f.id)!} labels={labels} disabled={disabled} onAnswer={onAnswer} />
              : <QuestionBlock key={f.id} question={questions.get(f.id)!} field={f} labels={labels} disabled={disabled} onAnswer={onAnswer} />)}
            {extra.length > 0 && (
              <details className="cw-group__extra">
                <summary>세부 설정 {extra.length}개 (전문)</summary>
                {extra.map((f) => {
                  const q = questions.get(f.id);
                  return q
                    ? <QuestionBlock key={f.id} question={q} field={f} labels={labels} disabled={disabled} onAnswer={onAnswer} />
                    : <div key={f.id} className="cw-q"><div className="cw-q__title"><strong>{f.question}</strong></div>
                        <FieldInput field={f} values={[]} disabled={disabled} labelOf={(v) => optionLabel(f, v, labels)} onAnswer={(v) => onAnswer(f.id, v)} /></div>;
                })}
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** 이번 조합에서 꺼 둔 묶음과 숨긴 설정을 여는 전문 설정. 숨김은 삭제가 아니다. */
export function AdvancedSettingsDialog({ open, onClose, layout, labels, intent, disabled, onAnswer, actions }: {
  open: boolean; onClose: () => void; layout: IntentLayout; labels: Labels; intent: IntentSpecV2 | undefined; disabled: boolean; onAnswer: Answer; actions: ConditionActions;
}) {
  const answered = new Map(layout.answered.map((a) => [a.field_id, a.values]));
  const hiddenReason = new Map(layout.hidden.map((h) => [h.field_id, h.reason]));
  const groupIds = [...new Set([...layout.available_groups, ...layout.groups.filter((g) => layout.hidden.some((h) => g.fields.includes(h.field_id))).map((g) => g.id)])]
    .filter((id) => !DEDICATED_GROUPS.has(id));
  const fieldsOf = (gid: string) => [...labels.fields.values()].filter((f) => f.group === gid && (layout.available_groups.includes(gid) || hiddenReason.has(f.id)));
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="전문 설정" footer={<Button variant="primary" onClick={onClose}>닫기</Button>}>
      {open && <div className="cw-advanced">
        <p className="cw-hint">이번 조합에는 필요 없다고 보고 꺼 둔 설정이에요. 직접 정하면 의도에 반영되고, 필요한 묶음이 자동으로 열려요.</p>
        {groupIds.map((gid) => {
          const group = labels.groups.get(gid);
          const fields = fieldsOf(gid);
          if (!group || fields.length === 0) return null;
          return (
            <details key={gid} className="cw-advanced__group">
              <summary><strong>{group.title}</strong> <span className="cw-hint">{group.description}</span></summary>
              {fields.map((f) => (
                <div key={f.id} className="cw-q">
                  <div className="cw-q__title"><strong>{f.question}</strong>{hiddenReason.has(f.id) && <Badge>숨김</Badge>}</div>
                  {hiddenReason.has(f.id) && <p className="cw-hint">{hiddenReason.get(f.id)}</p>}
                  <FieldInput field={f} values={answered.get(f.id) ?? []} disabled={disabled} labelOf={(v) => optionLabel(f, v, labels)} onAnswer={(v) => onAnswer(f.id, v)} />
                </div>
              ))}
            </details>
          );
        })}
        <details className="cw-advanced__group">
          <summary><strong>조건 더 추가하기</strong> <span className="cw-hint">캐릭터·환경·카메라·모션·서사·음악·편집·품질</span></summary>
          <ExtraDimensionPicker intent={intent} labels={labels} actions={actions} />
        </details>
      </div>}
    </Dialog>
  );
}

export { ConditionPicker };
