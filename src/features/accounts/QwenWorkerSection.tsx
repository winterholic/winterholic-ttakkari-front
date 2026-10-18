import { useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qwenWorkerStatus, setQwenWorker } from "../../api/client";

const KEY = ["qwen-worker"] as const;
const REASON: Record<string, string> = {
  disabled: "꺼짐",
  ready: "준비됨",
  worker_executable_missing: "작업자 실행 파일을 찾지 못했어요.",
  readiness_check_failed: "준비 검사를 실행하지 못했어요.",
  readiness_report_invalid: "준비 검사 응답을 읽지 못했어요.",
  readiness_contract_unverified: "격리·자원 감시·시험 작업 중 통과하지 못한 검사가 있어요.",
};

export function QwenWorkerSection() {
  const id = useId();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: qwenWorkerStatus });
  const save = useMutation({
    mutationFn: (enabled: boolean) => setQwenWorker(enabled),
    onSuccess: (next) => qc.setQueryData(KEY, next),
  });
  return (
    <section className="tk-section" id="qwen-worker" aria-labelledby={`${id}-title`}>
      <div className="tk-section__head">
        <h2 className="tk-section__title" id={`${id}-title`}>로컬 Qwen 작업자</h2>
      </div>
      <p className="tk-fieldset__help" id={`${id}-help`}>
        Mac의 Qwen Flash Next에 개인 파일 작업과 테스트를 맡겨요. 켜면 직접 지정하거나 개인 클라우드 한도가 모두 찼을 때 사용할 수 있어요.
      </p>
      {q.isPending && <p className="tk-fieldset__help" role="status">Qwen 설정을 확인하는 중이에요.</p>}
      {q.isError && <p className="tk-error" role="alert">Qwen 설정을 불러오지 못했어요.</p>}
      {q.data && <>
        <label className="tk-switch tk-switch--row">
          <input type="checkbox" role="switch" checked={q.data.enabled}
            disabled={q.data.config_locked || save.isPending}
            aria-describedby={`${id}-help ${id}-status`}
            onChange={(event) => save.mutate(event.target.checked)} />
          Qwen 작업자 사용
        </label>
        <p className="tk-fieldset__help" id={`${id}-status`} role="status" aria-live="polite">
          {save.isPending ? "준비 검사를 확인하고 저장하는 중이에요." : REASON[q.data.reason] ?? q.data.reason}
        </p>
        {q.data.config_locked && <p className="tk-fieldset__help">운영 설정에 고정되어 있어 앱에서 변경할 수 없어요.</p>}
      </>}
      {save.isError && <p className="tk-error" role="alert">{save.error.message}</p>}
      <button className="tk-button tk-button--sm" type="button" disabled={q.isFetching || save.isPending}
        onClick={() => { save.reset(); void q.refetch(); }}>다시 확인</button>
    </section>
  );
}
