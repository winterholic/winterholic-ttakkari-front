import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GH_ACCOUNTS_KEY, GhApiError, ghAccounts } from "../../api/githubClient";
import { raDetailKey, startAppraisal } from "../../api/repoAppraisalClient";
import type { AppraisalMode } from "../../api/repoAppraisalTypes";
import { PageHeader } from "../../shell/PageHeader";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { getSavedAccount, saveAccount } from "../github/recent";
import { AccountPicker } from "../github/state/AccountPicker";
import { GhErrorState, GhSkeleton } from "../github/state/StateView";
import { describeAppraisalError } from "./errors";
import { pushRecentAppraisal } from "./recent";
import { RecentSection } from "./RecentSection";
import "./repo-appraisal.css";

const ACCOUNT_STALE = 30_000;
const MAX_INPUT = 2048;
const NO_ACCOUNT = new GhApiError({ status: 503, code: "no_account", message: "no account" });
const NO_GH = new GhApiError({ status: 503, code: "gh_cli_missing", message: "gh not found" });
const MODES: { id: AppraisalMode; label: string }[] = [
  { id: "quick", label: "빠른" },
  { id: "deep", label: "정밀" },
];

/** 저장소 평가 시작 화면. 계정·대상·모드를 정하고 평가를 시작한다. */
export function StartScreen() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const accountsQuery = useQuery({ queryKey: GH_ACCOUNTS_KEY, queryFn: ghAccounts, staleTime: ACCOUNT_STALE });
  const all = useMemo(() => accountsQuery.data?.accounts ?? [], [accountsQuery.data]);
  const usable = useMemo(() => all.filter((a) => a.state === "success"), [all]);
  const asParam = params.get("as");
  const account = asParam && usable.some((a) => a.login === asParam) ? asParam : null;

  // `as` 가 없을 때만 자동으로 채운다. 탐색 화면과 같은 규칙이다.
  useEffect(() => {
    if (!accountsQuery.data || account || asParam) return;
    const saved = getSavedAccount();
    const pick = saved && usable.some((a) => a.login === saved) ? saved : usable.length === 1 ? usable[0].login : null;
    if (pick) {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("as", pick);
        return next;
      }, { replace: true });
    }
  }, [accountsQuery.data, account, asParam, usable, setParams]);

  useEffect(() => {
    if (account) saveAccount(account);
  }, [account]);

  // `?target=` 은 실패 화면의 "다시 평가"가 채워 준다. 입력 후에는 상태가 주인이므로 동기화하지 않는다.
  const [target, setTarget] = useState(params.get("target") ?? "");
  const [mode, setMode] = useState<AppraisalMode>("quick");
  const [force, setForce] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () => startAppraisal({ target: target.trim(), account: account as string, mode, force }),
    onSuccess: ({ reused, appraisal }) => {
      // 시작 응답이 상세 모양 그대로라 캐시에 넣으면 상세에서 다시 묻지 않는다.
      qc.setQueryData(raDetailKey(appraisal.id), appraisal);
      pushRecentAppraisal({
        id: appraisal.id, owner: appraisal.owner, repo: appraisal.repo, mode: appraisal.mode,
        grade: appraisal.grade, weighted_score: appraisal.weighted_score, created_at: appraisal.created_at,
      });
      if (reused) toast({ message: "이미 계산된 결과가 있어 바로 보여줘요.", tone: "success" });
      navigate({ pathname: `/repo-appraisal/${appraisal.id}`, search: `?as=${encodeURIComponent(account as string)}` });
    },
    onError: (err) => setProblem(describeAppraisalError(err).message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!account || !target.trim() || start.isPending) return;
    if (target.trim().length > MAX_INPUT) {
      setProblem("주소가 너무 길어요.");
      return;
    }
    setProblem(null);
    start.mutate();
  }

  const pickAccount = (login: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("as", login);
      return next;
    }, { replace: true });
  };
  const clearAccount = () => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("as");
      return next;
    }, { replace: true });
  };

  let accountArea;
  if (accountsQuery.isPending) accountArea = <GhSkeleton kind="card" label="계정을 확인하는 중" />;
  else if (accountsQuery.isError) accountArea = <GhErrorState error={accountsQuery.error} onRetry={() => void accountsQuery.refetch()} />;
  else if (accountsQuery.data.gh_available === false) accountArea = <GhErrorState error={NO_GH} />;
  else if (all.length === 0) accountArea = <GhErrorState error={NO_ACCOUNT} />;
  else if (!account) accountArea = <AccountPicker accounts={all} requested={asParam} onPick={pickAccount} />;
  else {
    accountArea = (
      <p className="ra-account" role="status">
        <Icon name="user" />
        <span>계정 {account}의 권한으로 조회해요</span>
        <Button size="sm" variant="ghost" onClick={clearAccount}>바꾸기</Button>
      </p>
    );
  }

  return (
    <div className="tk-screen">
      <PageHeader title="저장소 평가" meta={account ? `계정 ${account}` : "GitHub 저장소 품질 점수"} />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--lg ra">
          <div className="ra-grid">
            <div className="ra-main">
              {accountArea}
              <section className="gh-section" aria-labelledby="ra-start-title">
                <h2 id="ra-start-title" className="gh-section__title">어떤 저장소를 평가할까요?</h2>
                <form className="gh-target" onSubmit={submit}>
                  <label className="tk-label" htmlFor="ra-target">저장소 주소</label>
                  <div className="gh-target__row">
                    <input
                      id="ra-target"
                      className="tk-input tk-input--mono"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      placeholder="owner/repo 또는 GitHub 주소"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={MAX_INPUT}
                      aria-invalid={problem ? true : undefined}
                      aria-describedby={problem ? "ra-target-error" : undefined}
                    />
                    <Button type="submit" variant="primary" busy={start.isPending} disabled={!account || !target.trim()}>평가</Button>
                  </div>
                  {problem && <p id="ra-target-error" className="tk-error" role="alert"><Icon name="warning" /> {problem}</p>}
                  <div className="gh-pills" role="group" aria-label="평가 모드">
                    {MODES.map((m) => (
                      <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</button>
                    ))}
                  </div>
                  <p className="gh-note">{mode === "quick" ? "빠른: 핵심만 가볍게 봐요." : "정밀: 표본을 넓혀 꼼꼼히 봐요. 시간이 더 걸려요."}</p>
                  <details className="ra-advanced">
                    <summary>다시 계산</summary>
                    <label className="ra-check">
                      <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                      <span>캐시 무시하고 다시 계산</span>
                    </label>
                    <p className="gh-note">같은 커밋·모드의 결과가 있어도 새로 계산해요.</p>
                  </details>
                </form>
              </section>
            </div>
            <RecentSection account={account} />
          </div>
        </div>
      </div>
    </div>
  );
}
