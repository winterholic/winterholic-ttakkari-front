import { Icon } from "../ui/Icon";

const STEPS = [
  {
    kind: "person",
    title: "사용자 요청",
    detail: "폰에서 보낸 메시지가 접수 세션에 도착",
  },
  {
    kind: "desk",
    title: "접수 · 빠른 판정",
    detail: "Luna high → Haiku · 도구 없이 한 번 판단",
    note: "가벼운 대화는 여기서 답하고, 일이 필요하면 기획에 넘겨요.",
    context: "접수 지침만 · 작업판 + 최근 대화",
  },
  {
    kind: "lead",
    title: "기획 세션 · 오케스트레이터",
    detail: "Opus medium 또는 GPT Sol high",
    note: "일을 나누고 도구를 골라 짧게 맡긴 뒤, 작업을 기다리며 다음 사용자 메시지를 받아요.",
    context: "공통 + 기획 지침 · 핀 기억 · Ttakkari 도구",
  },
  {
    kind: "worker",
    title: "작업 세션",
    detail: "Claude: Sonnet high · Codex/auto: Luna high",
    note: "필요한 경우에만 Opus / GPT Sol로 올리고, 승격 사유를 지정해요.",
    context: "공통 + 작업 지침 · 핀 기억 · 필요한 도구와 지식",
  },
  {
    kind: "report",
    title: "[작업 보고]",
    detail: "끝난 작업의 결과와 오류 요약이 기획 세션으로 돌아옴",
  },
  {
    kind: "lead-report",
    title: "기획 세션이 결과 정리",
    detail: "필요하면 후속 작업을 맡기고, 결과를 사용자 대화에 보고",
  },
  {
    kind: "person final",
    title: "사용자에게 결과 보고",
    detail: "접수 화면에 기획 세션의 마지막 답변이 표시돼요.",
  },
];

export function OrchestrationFlow() {
  return (
    <section className="tk-section assistant-flow" aria-labelledby="assistant-flow-title">
      <details open>
        <summary className="tk-section__head assistant-flow__summary">
          <span className="tk-section__title" id="assistant-flow-title">실제 실행 흐름</span>
          <span className="assistant-flow__hint">접수에서 바로 답하거나, 기획·작업 세션을 거쳐 보고해요</span>
        </summary>
        <figure className="assistant-flow__figure" aria-label="따까리 실제 실행 흐름">
          <ol className="assistant-flow__steps">
            {STEPS.map((step, index) => (
              <li className={`assistant-flow__step assistant-flow__step--${step.kind}`} key={step.title}>
                <div className="assistant-flow__node">
                  <span className="assistant-flow__index" aria-hidden="true">{index + 1}</span>
                  <div className="assistant-flow__copy">
                    <strong>{step.title}</strong>
                    <span>{step.detail}</span>
                    {"note" in step && <span className="assistant-flow__note">{step.note}</span>}
                    {"context" in step && <span className="assistant-flow__context"><Icon name="tip" />{step.context}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <figcaption>접수 세션은 즉시 답할 수도 있고 기획 세션에 넘길 수도 있어요. 아래는 도구가 필요한 요청의 경로예요.</figcaption>
        </figure>

        <div className="assistant-flow__details">
          <section className="assistant-flow__detail">
            <h3>지침 · 기억</h3>
            <p><strong>접수</strong>에는 접수 지침만 들어가요. 전역·공통 지침, 고정 기억, 도구는 받지 않아요.</p>
            <p><strong>기획·작업</strong>에는 공통 지침과 역할 지침, 핀을 꽂은 기억이 들어가요. 그 밖의 기억은 <code>recall</code>로 찾고, <code>remember</code>로 저장하며 <code>link</code>로 관계를 기록해요.</p>
          </section>
          <section className="assistant-flow__detail">
            <h3>지식 · 도구</h3>
            <p><code>library_catalog</code>로 도서관 목차를 보고 <code>recall</code>로 기억·관계·색인 문서를 찾아요. work-history는 색인된 범위에서 필요할 때 검색해요.</p>
            <p>스킬과 work-history 원문은 매번 자동 주입되지 않아요. 필요에 따라 찾아 읽고, 출처를 확인해요.</p>
            <p>실행 도구 예: 메모·일정, PMS, 알림, <code>share_file</code>. 작업 세션 배정 도구는 기획 전용이에요.</p>
          </section>
          <section className="assistant-flow__detail">
            <h3>계정 배정 · 한도</h3>
            <p>기획은 <code>account_usage</code>로 마지막 관측 사용량과 실행 중 계정을 살펴요. auto 작업은 신선한 사용량의 계정별 상한 여유와 유휴 상태를 고려해 배정해요.</p>
            <p>계정마다 설정한 상한에 5시간 또는 주간 사용량이 닿으면 초기화까지 제외해요. 다른 엔진으로 넘어가면 같은 급 모델로 바꿔 이어가고, stale·미측정 값이면 기존 우선순위를 써요.</p>
            <p>Claude가 필요한 디자인·시각 작업은 다른 엔진으로 보내지 않고 Claude 초기화 뒤로 미룰 수 있어요.</p>
          </section>
          <section className="assistant-flow__detail">
            <h3>컨텍스트 사용률</h3>
            <p><strong>50% 이상</strong>: 남은 일과 기록 여부를 보고 새로 시작할지 검토해요.</p>
            <p><strong>70% 이상</strong>: 진행·결정을 기록한 뒤 작업은 <code>message_worker(fresh_context=true)</code>, 기획은 <code>reset_my_context</code>로 다음 실행부터 새 문맥을 써요.</p>
          </section>
        </div>
      </details>
    </section>
  );
}
