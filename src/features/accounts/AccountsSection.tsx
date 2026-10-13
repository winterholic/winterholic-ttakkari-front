import { useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, clearAccountCooldown, createAccount, deleteAccount, listAccounts, patchAccount, reorderAccounts } from "../../api/client";
import type { AccountEngine, AccountOut, AccountPool } from "../../api/types";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { Select } from "../../ui/Select";
import { SortableList } from "../../ui/SortableList";
import { applyOrder, isOn, modeRows } from "./mode";
import { OverrideBanner, OverrideDialog } from "./OverrideDialog";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { ErrorState, ListSkeleton } from "../viewer/screenStates";

export const ACCOUNTS_KEY = ["accounts"] as const;

const ENGINE_LABEL: Record<AccountEngine, string> = { claude: "Claude Code", codex: "Codex" };
const ENGINE_OPTIONS = [
  { value: "claude" as const, label: "Claude Code" },
  { value: "codex" as const, label: "Codex" },
];

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.errors?.map((x) => x.msg.replace(/^Value error, /, "")).join(" ") || e.message;
  return errorText(e).message;
}

function loginText(a: AccountOut): string {
  if (a.login === "ok") return a.login_label ? a.login_label : "로그인됨";
  return "로그인 필요";
}

/** 로그인 안 된 계정에만 보인다. 브라우저 인증이라 Mac Studio 에서 한 번은 직접 해야 한다. */
function LoginHint({ engine, command }: { engine: AccountEngine; command: string }) {
  const copy = () =>
    void navigator.clipboard?.writeText(command).then(
      () => toast({ message: "명령을 복사했어요. Mac Studio 터미널에 붙여 넣으세요." }),
      () => toast({ message: "복사하지 못했어요. 길게 눌러 직접 복사해 주세요.", tone: "danger" }),
    );
  return (
    <span className="account-login">
      <span>{engine === "claude" ? "Mac Studio 터미널에서 이 명령을 실행하고, 열리면 /login 을 입력해 로그인해요." : "Mac Studio 터미널에서 이 명령을 실행해 로그인해요."}</span>
      <span className="account-login__row">
        <code className="tk-mono">{command}</code>
        <button className="tk-button tk-button--xs" type="button" onClick={copy}>
          <Icon name="copy" />
          복사
        </button>
      </span>
    </span>
  );
}

function minutes(sec: number): string {
  return sec >= 60 ? `${Math.ceil(sec / 60)}분` : `${sec}초`;
}

/**
 * 설정 > 계정. 개인 계정·회사 계정 두 섹션이다(ADR 0006).
 * 계정은 개인 계정에서만 추가·삭제하고, 그중 회사 모드에도 쓸 계정을 골라 회사 계정에 들인다.
 * 켜기·순서·임시 순서는 개인과 회사가 서로 독립이다(같은 계정을 개인에선 끄고 회사에선 켤 수 있다).
 */
export function AccountsSection() {
  return (
    <>
      <AccountModeSection pool="personal" />
      <AccountModeSection pool="work" />
    </>
  );
}

const MODE_TEXT: Record<AccountPool, { title: string; help: string[]; empty: string }> = {
  personal: {
    title: "개인 계정",
    help: [
      "채팅 탭에서 시킨 일이 써요. 계정을 추가하고 삭제하는 곳은 여기뿐이에요. 손잡이를 끌어 순서를 바꾸고, 위에서부터 차례로 써요. 사용량 한도에 걸리면 그 계정은 잠시 쉬고 다음 계정으로 이어서 해요(Claude Code 가 다 막히면 Codex 까지).",
      "회사 업무에도 쓸 계정은 ⋮ 메뉴의 「회사 계정에 넣기」로 골라요. 켜기·순서는 개인 계정과 회사 계정이 따로예요.",
    ],
    empty: "개인 계정이 없어요.",
  },
  work: {
    title: "회사 계정",
    help: [
      "회사 업무 탭에서 시킨 일만 써요(작업 세션·결과 보고까지). 개인 계정에서 고른 계정만 보이고, 켜기·순서·임시 순서는 개인 계정과 따로예요. 계정을 넣고 빼는 건 개인 계정의 ⋮ 메뉴에서 해요.",
    ],
    empty: "회사 계정이 없어요. 개인 계정의 ⋮ 메뉴에서 「회사 계정에 넣기」로 골라요.",
  },
};

/** 한 모드(개인·회사)의 계정 목록. 위에서부터 차례로 쓰고, 사용량 한도면 다음 계정으로 넘어간다(ADR 0006). */
function AccountModeSection({ pool }: { pool: AccountPool }) {
  const qc = useQueryClient();
  const id = useId();
  const personal = pool === "personal";
  const q = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: listAccounts, refetchInterval: 30_000 });
  const [editing, setEditing] = useState<AccountOut | "new" | null>(null);
  const [removing, setRemoving] = useState<AccountOut | null>(null);
  // 계정 ⋮ 는 드롭다운이 아니라 가운데 모달로 연다.
  const [acting, setActing] = useState<string | null>(null);
  const [overriding, setOverriding] = useState(false);
  const all = q.data ?? [];
  const rows = modeRows(all, pool);
  // 캐시는 두 섹션이 함께 쓴다. 이 섹션은 자기 모드의 값만 바꾼다.
  const setAll = (next: AccountOut[]) => qc.setQueryData(ACCOUNTS_KEY, next);
  const replace = (a: AccountOut) => setAll(all.map((x) => (x.id === a.id ? a : x)));

  const toggle = useMutation({
    mutationFn: (a: AccountOut) => patchAccount(a.id, personal ? { enabled: !a.enabled } : { work_enabled: !a.work_enabled }),
    onSuccess: replace,
  });
  const clear = useMutation({ mutationFn: (a: AccountOut) => clearAccountCooldown(a.id), onSuccess: replace });
  const reorderLock = useRef(false);
  const reorder = useMutation({
    mutationFn: async (next: AccountOut[]) => {
      const ids = next.map((a) => a.id);
      try {
        return await reorderAccounts(ids, pool);
      } catch (e) {
        // 다른 탭에서 삭제·제외된 계정이 stale 목록에 남으면 최신 목록에 사용자 순서를 합쳐 재시도한다.
        if (!(e instanceof ApiError) || e.status !== 400 || !e.message.includes("모든 계정 id")) throw e;
        const latest = modeRows(await listAccounts(), pool);
        const latestIds = new Set(latest.map((a) => a.id));
        const merged = [...new Set(ids.filter((id) => latestIds.has(id)))];
        for (const a of latest) if (!merged.includes(a.id)) merged.push(a.id);
        return reorderAccounts(merged, pool);
      }
    },
    onMutate: async (next) => {
      // 30초 폴링이 저장 중에 끝나면 옛 순서로 덮으므로 진행 중인 목록 요청을 먼저 취소한다.
      await qc.cancelQueries({ queryKey: ACCOUNTS_KEY });
      setAll(applyOrder(qc.getQueryData<AccountOut[]>(ACCOUNTS_KEY) ?? all, next, pool));
    },
    onSuccess: (saved) => setAll(applyOrder(qc.getQueryData<AccountOut[]>(ACCOUNTS_KEY) ?? all, saved, pool)),
    onError: () => void q.refetch(),
    onSettled: () => {
      reorderLock.current = false;
    },
  });
  const saveOrder = (next: AccountOut[]) => {
    if (reorderLock.current) return;
    reorderLock.current = true;
    reorder.mutate(next);
  };
  const tagWork = useMutation({
    mutationFn: (a: AccountOut) => patchAccount(a.id, { pool: a.pool === "work" ? "personal" : "work" }),
    onSuccess: (a) => {
      replace(a);
      toast({ message: a.pool === "work" ? `${a.name} 을(를) 회사 계정에 넣었어요.` : `${a.name} 을(를) 회사 계정에서 뺐어요.` });
    },
  });
  const moveBy = (from: number, to: number) => {
    const next = [...rows];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    saveOrder(next);
  };
  const remove = useMutation({
    mutationFn: (a: AccountOut) => deleteAccount(a.id),
    onSuccess: () => {
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    },
  });
  const rowError = toggle.error ?? clear.error ?? reorder.error ?? tagWork.error;
  const enabledCount = rows.filter((a) => isOn(a, pool)).length;
  const text = MODE_TEXT[pool];

  return (
    <section className="tk-section" id={personal ? "accounts" : "work-accounts"} aria-labelledby={`${id}-title`}>
      <div className="tk-section__head">
        <h2 className="tk-section__title" id={`${id}-title`}>{text.title}</h2>
        <div className="tk-button-group">
          <button className="tk-button tk-button--sm" type="button" onClick={() => setOverriding(true)} disabled={rows.length < 2}>
            <Icon name="clock" />
            임시 순서
          </button>
          {/* 계정 추가·삭제는 개인 계정에서만 한다. 회사 계정은 그중 고른 계정이다(사용자 결정 10-13). */}
          {personal && (
            <button className="tk-button tk-button--sm" type="button" onClick={() => setEditing("new")}>
              <Icon name="plus" />
              계정 추가
            </button>
          )}
        </div>
      </div>
      {text.help.map((h) => (
        <p key={h} className="tk-fieldset__help account-help">{h}</p>
      ))}
      <OverrideBanner accounts={rows} pool={pool} onEdit={() => setOverriding(true)} />
      {q.isSuccess && rows.length === 0 && <p className="tk-fieldset__help">{text.empty}</p>}
      {q.isPending && <ListSkeleton rows={2} label="계정을 불러오는 중" />}
      {q.isError && <ErrorState error={q.error} what="계정" onRetry={() => void q.refetch()} />}
      {q.isSuccess && rows.length > 0 && enabledCount === 0 && (
        <aside className="tk-callout tk-callout--warning" role="status">
          <Icon name="warning" className="tk-callout__icon" />
          <div className="tk-callout__body"><p>켜진 {personal ? "개인" : "회사"} 계정이 없어요. 하나 이상 켜야 {personal ? "채팅" : "회사 업무"} 탭에서 지시를 실행할 수 있어요.</p></div>
        </aside>
      )}
      {rowError && (
        <p className="tk-error" role="alert">
          {errMessage(rowError)}
        </p>
      )}
      {q.isSuccess && (
        <SortableList
          items={rows}
          label={`${text.title} 우선순위`}
          disabled={reorder.isPending}
          onReorder={saveOrder}
          render={(a, i, handle) => (
              <div className="tk-list__item account-row" aria-disabled={!isOn(a, pool) || undefined}>
                {handle}
                <span className="account-row__rank" aria-label={`${i + 1}순위`}>{i + 1}</span>
                <span className="tk-list__body">
                  <span className="tk-list__title">
                    {a.name}
                    {personal && a.pool === "work" && <span className="tk-badge tk-badge--info account-group">회사</span>}
                  </span>
                  <span className="tk-list__meta">
                    <span>{ENGINE_LABEL[a.engine]}</span>
                    <span className={a.login === "ok" ? undefined : "account-row__warn"}>{loginText(a)}</span>
                    {a.cooldown_seconds > 0 && <span className="tk-badge tk-badge--warning">한도 대기 {minutes(a.cooldown_seconds)}</span>}
                  </span>
                  {a.login !== "ok" && a.login_command && <LoginHint engine={a.engine} command={a.login_command} />}
                </span>
                <span className="tk-list__end">
                  <label className="tk-switch">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={isOn(a, pool)}
                      aria-label={`${a.name} ${personal ? "" : "회사 "}사용`}
                      disabled={toggle.isPending}
                      onChange={() => toggle.mutate(a)}
                    />
                  </label>
                  <button
                    className="tk-icon-button tk-icon-button--sm"
                    type="button"
                    aria-label={`${a.name} 메뉴`}
                    aria-haspopup="dialog"
                    onClick={() => setActing(a.id)}
                  >
                    <Icon name="more-vertical" />
                  </button>
                </span>
              </div>
          )}
        />
      )}
      {(() => {
        const a = rows.find((x) => x.id === acting);
        const i = a ? rows.indexOf(a) : -1;
        const done = (fn: () => void) => () => {
          setActing(null);
          fn();
        };
        return (
          <Dialog open={!!a} onClose={() => setActing(null)} size="sm" title={a ? `${a.name} 관리` : "계정 관리"} id={`account-actions-${pool}`}>
            {a && (
              <div className="account-actions">
                <button className="tk-button tk-button--block" type="button" disabled={i === 0 || reorder.isPending} onClick={() => { setActing(null); moveBy(i, i - 1); }}>
                  <Icon name="chevron-up" />
                  위로
                </button>
                <button className="tk-button tk-button--block" type="button" disabled={i === rows.length - 1 || reorder.isPending} onClick={() => { setActing(null); moveBy(i, i + 1); }}>
                  <Icon name="chevron-down" />
                  아래로
                </button>
                {a.cooldown_seconds > 0 && (
                  <button className="tk-button tk-button--block" type="button" onClick={done(() => clear.mutate(a))}>
                    <Icon name="clock" />
                    한도 대기 풀기
                  </button>
                )}
                {personal && (
                  <>
                    <button className="tk-button tk-button--block" type="button" onClick={done(() => tagWork.mutate(a))}>
                      <Icon name="briefcase" />
                      {a.pool === "work" ? "회사 계정에서 빼기" : "회사 계정에 넣기"}
                    </button>
                    <button className="tk-button tk-button--block" type="button" onClick={done(() => setEditing(a))}>
                      <Icon name="key" />
                      이름 바꾸기
                    </button>
                    <button className="tk-button tk-button--block tk-button--danger" type="button" onClick={done(() => setRemoving(a))}>
                      <Icon name="trash" />
                      삭제
                    </button>
                  </>
                )}
              </div>
            )}
          </Dialog>
        );
      })()}
      {overriding && <OverrideDialog accounts={rows} pool={pool} onClose={() => setOverriding(false)} />}
      {personal && editing && <AccountDialog account={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {personal && (
        <Dialog
          open={!!removing}
          onClose={() => setRemoving(null)}
          size="sm"
          title="계정을 삭제할까요?"
          id="account-remove"
          footer={
            <>
              <button className="tk-button" type="button" onClick={() => setRemoving(null)}>
                취소
              </button>
              <button className="tk-button tk-button--danger" type="button" aria-busy={remove.isPending || undefined} onClick={() => removing && remove.mutate(removing)}>
                계정 삭제
              </button>
            </>
          }
        >
          <p>따까리 목록에서만 빠져요{removing?.pool === "work" ? "(회사 계정에서도 사라져요)" : ""}. 그 계정의 로그인 정보는 Mac Studio 에 그대로 남아요.</p>
          {remove.error && <p className="tk-error" role="alert">{errMessage(remove.error)}</p>}
        </Dialog>
      )}
    </section>
  );
}

function AccountDialog({ account, onClose }: { account: AccountOut | null; onClose: () => void }) {
  const qc = useQueryClient();
  const id = useId();
  const [name, setName] = useState(account?.name ?? "");
  const [engine, setEngine] = useState<AccountEngine>(account?.engine ?? "claude");
  const save = useMutation({
    mutationFn: () =>
      account
        ? patchAccount(account.id, { name: name.trim() })
        : createAccount({ name: name.trim(), engine }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ACCOUNTS_KEY });
      onClose();
    },
  });
  const ready = name.trim() !== "";
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      modal
      title={account ? "이름 바꾸기" : "계정 추가"}
      id="account-edit"
      footer={
        <>
          <button className="tk-button" type="button" onClick={onClose}>
            취소
          </button>
          <button
            className="tk-button tk-button--primary"
            type="submit"
            form={`${id}-form`}
            aria-disabled={!ready || undefined}
            aria-busy={save.isPending || undefined}
          >
            {account ? "저장" : "추가"}
          </button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !save.isPending) save.mutate();
        }}
      >
        <div className="tk-field">
          <label className="tk-label" htmlFor={`${id}-name`}>이름</label>
          <input id={`${id}-name`} className="tk-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="예: 개인 Max, 회사 Team" />
        </div>
        <div className="tk-field">
          <label className="tk-label" id={`${id}-engine-label`} htmlFor={`${id}-engine`}>엔진</label>
          {account ? (
            <input id={`${id}-engine`} className="tk-input" value={ENGINE_LABEL[account.engine]} readOnly />
          ) : (
            <Select id={`${id}-engine`} labelledBy={`${id}-engine-label`} value={engine} options={ENGINE_OPTIONS} onChange={setEngine} />
          )}
        </div>
        <p className="tk-help">
          <span>{account ? "이름만 바꿔요. 로그인과 대화는 그대로 이어져요." : "같은 엔진의 두 번째 계정부터는 따까리가 로그인 보관함을 따로 만들어요. 추가한 뒤 목록에 나오는 명령으로 한 번만 로그인하면 돼요."}</span>
        </p>
        {save.error && (
          <p className="tk-error" role="alert">
            {errMessage(save.error)}
          </p>
        )}
      </form>
    </Dialog>
  );
}
