import { useState } from "react";
import { Art } from "../../ui/Art";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";

const SEEN_KEY = "tk-onboarded";

/** 첫 실행 여부. 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 본 것으로 쳐서 매번 띄우지 않는다. */
export function onboardingSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* 저장하지 못해도 이번 실행에서는 닫힌 채로 둔다 */
  }
}

// 디자인 시스템 docs/23 §4.2 의 세 컷. 한 화면에 한 장, 장식이라 글이 뜻을 말한다.
const STEPS = [
  { art: "onboarding-01-intro", title: "심부름은 제가 할게요", body: "폰에서 시키면 Mac Studio 가 일해요. 자리를 비워도 일은 계속돼요." },
  { art: "onboarding-02-task", title: "이렇게 시켜요", body: "말하듯 적으면 작업 카드가 만들어지고, 끝날 때까지 다른 화면을 봐도 돼요." },
  { art: "onboarding-03-result", title: "결과는 폰으로", body: "만든 파일과 요약이 결과물로 모여요. 원본 다운로드도 그대로 쓸 수 있어요." },
] as const;

/** 첫 실행 3장 소개. 건너뛰거나 끝내면 다시 뜨지 않고, 사용자 메뉴의 「소개 다시 보기」로 열 수 있다. */
export function Onboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const s = STEPS[step];
  const finish = () => {
    markSeen();
    setStep(0);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={finish}
      label="따까리 소개"
      id="onboarding"
      footer={
        <>
          {!last && <Button variant="ghost" onClick={finish}>건너뛰기</Button>}
          {step > 0 && <Button onClick={() => setStep(step - 1)}>이전</Button>}
          <Button variant="primary" onClick={() => (last ? finish() : setStep(step + 1))}>{last ? "시작하기" : "다음"}</Button>
        </>
      }
    >
      <div className="tk-empty">
        <Art name={s.art} size="lg" />
        <p className="tk-empty__title">{s.title}</p>
        <p>{s.body}</p>
        <p className="tk-caption tk-text-tertiary" role="status">{step + 1} / {STEPS.length}</p>
      </div>
    </Dialog>
  );
}
