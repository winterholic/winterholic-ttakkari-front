import { useId } from "react";
import { ErrorState, ListSkeleton } from "../viewer/screenStates";
import { GoogleAccountCard } from "./GoogleAccountCard";
import { useGoogleAccounts } from "./queries";
import "./googleAccount.css";

/** 설정 화면의 Google 계정 항목. 여러 기능이 같은 계정 상태를 여기서 한 번에 본다(#google-accounts 로 바로 온다). */
export function GoogleAccountSection() {
  const id = useId();
  const q = useGoogleAccounts();
  return (
    <section id="google-accounts" className="tk-section" aria-labelledby={`${id}-title`}>
      <div className="tk-section__head">
        <h2 className="tk-section__title" id={`${id}-title`}>Google 계정</h2>
      </div>
      <p className="tk-fieldset__help">NotebookLM처럼 Google 로그인이 필요한 기능이 같은 로그인을 함께 써요. 여기서 한 번 로그인하면 기능마다 다시 하지 않아도 돼요.</p>
      {q.isPending && <ListSkeleton rows={2} label="Google 계정을 불러오는 중" />}
      {q.isError && <ErrorState error={q.error} what="Google 계정" onRetry={() => void q.refetch()} />}
      {q.data?.accounts.map((a) => <GoogleAccountCard key={a.account_id} account={a} />)}
      {q.data && q.data.accounts.length === 0 && <p className="ga-note">등록된 계정이 없어요.</p>}
    </section>
  );
}
