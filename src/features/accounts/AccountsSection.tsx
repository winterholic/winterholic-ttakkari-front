import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, clearAccountCooldown, createAccount, deleteAccount, listAccounts, patchAccount, reorderAccounts } from "../../api/client";
import type { AccountEngine, AccountOut } from "../../api/types";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { Menu } from "../../ui/Menu";
import { Select } from "../../ui/Select";
import { SortableList } from "../../ui/SortableList";
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
 * 설정 > 계정. 개인 목록이 전체 계정이고, 그 안의 일부가 「회사」 그룹이다.
 * 순서·켜기·임시 순서는 이 목록 하나가 정한다. 회사 업무 탭은 이 순서에서 회사 그룹만 걸러 쓴다(ADR 0006).
 */
export function AccountsSection() {
  const qc = useQueryClient();
  const id = useId();
  const q = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: listAccounts, refetchInterval: 30_000 });
  const [editing, setEditing] = useState<AccountOut | "new" | null>(null);
  const [removing, setRemoving] = useState<AccountOut | null>(null);
  const [overriding, setOverriding] = useState(false);
  const rows = q.data ?? [];
  const set = (next: AccountOut[]) => qc.setQueryData(ACCOUNTS_KEY, next);
  const replace = (a: AccountOut) => set(rows.map((x) => (x.id === a.id ? a : x)));

  const toggle = useMutation({ mutationFn: (a: AccountOut) => patchAccount(a.id, { enabled: !a.enabled }), onSuccess: replace });
  const clear = useMutation({ mutationFn: (a: AccountOut) => clearAccountCooldown(a.id), onSuccess: replace });
  const reorder = useMutation({
    mutationFn: (next: AccountOut[]) => reorderAccounts(next.map((a) => a.id)),
    onMutate: (next) => set(next),
    onSuccess: set,
    onError: () => void q.refetch(),
  });
  const tagWork = useMutation({
    mutationFn: (a: AccountOut) => patchAccount(a.id, { pool: a.pool === "work" ? "personal" : "work" }),
    onSuccess: (a) => {
      replace(a);
      toast({ message: a.pool === "work" ? `${a.name} 을(를) 회사 그룹에 넣었어요.` : `${a.name} 을(를) 회사 그룹에서 뺐어요.` });
    },
  });
  const moveBy = (from: number, to: number) => {
    const next = [...rows];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    reorder.mutate(next);
  };
  const remove = useMutation({
    mutationFn: (a: AccountOut) => deleteAccount(a.id),
    onSuccess: () => {
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    },
  });
  const rowError = toggle.error ?? clear.error ?? reorder.error ?? tagWork.error;
  const enabledCount = rows.filter((a) => a.enabled).length;
  const workCount = rows.filter((a) => a.pool === "work").length;
  const workEnabled = rows.filter((a) => a.pool === "work" && a.enabled).length;

  return (
    <section className="tk-section" id="accounts" aria-labelledby={`${id}-title`}>
      <div className="tk-section__head">
        <h2 className="tk-section__title" id={`${id}-title`}>계정</h2>
        <div className="tk-button-group">
          <button className="tk-button tk-button--sm" type="button" onClick={() => setOverriding(true)} disabled={rows.length < 2}>
            <Icon name="clock" />
            임시 순서
          </button>
          <button className="tk-button tk-button--sm" type="button" onClick={() => setEditing("new")}>
            <Icon name="plus" />
            계정 추가
          </button>
        </div>
      </div>
      <p className="tk-fieldset__help">
        손잡이를 끌어 순서를 바꾸고, 위에서부터 차례로 써요. 사용량 한도에 걸리면 그 계정은 잠시 쉬고 다음 계정으로 이어서 해요(Claude Code 가 다 막히면 Codex 까지).
      </p>
      <p className="tk-fieldset__help">
        「회사」 표시가 붙은 계정은 회사 그룹이에요. 채팅 탭은 회사 그룹까지 모든 계정을, 회사 업무 탭은 이 순서에서 회사 그룹 계정만 써요. 계정의 ⋮ 메뉴에서 회사 그룹에 넣거나 뺄 수 있어요.
      </p>
      <OverrideBanner accounts={rows} onEdit={() => setOverriding(true)} />
      {q.isSuccess && rows.length === 0 && <p className="tk-fieldset__help">계정이 없어요.</p>}
      {q.isPending && <ListSkeleton rows={2} label="계정을 불러오는 중" />}
      {q.isError && <ErrorState error={q.error} what="계정" onRetry={() => void q.refetch()} />}
      {q.isSuccess && rows.length > 0 && enabledCount === 0 && (
        <aside className="tk-callout tk-callout--warning" role="status">
          <Icon name="warning" className="tk-callout__icon" />
          <div className="tk-callout__body"><p>켜진 계정이 없어요. 하나 이상 켜야 지시를 실행할 수 있어요.</p></div>
        </aside>
      )}
      {q.isSuccess && workCount > 0 && workEnabled === 0 && enabledCount > 0 && (
        <aside className="tk-callout tk-callout--warning" role="status">
          <Icon name="warning" className="tk-callout__icon" />
          <div className="tk-callout__body"><p>회사 그룹에 켜진 계정이 없어요. 회사 업무 탭에서 지시하려면 하나 이상 켜 주세요.</p></div>
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
          label="계정 우선순위"
          onReorder={(next) => reorder.mutate(next)}
          render={(a, i, handle) => (
              <div className="tk-list__item account-row" aria-disabled={!a.enabled || undefined}>
                {handle}
                <span className="account-row__rank" aria-label={`${i + 1}순위`}>{i + 1}</span>
                <span className="tk-list__body">
                  <span className="tk-list__title">
                    {a.name}
                    {a.pool === "work" && <span className="tk-badge tk-badge--info account-group">회사</span>}
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
                      checked={a.enabled}
                      aria-label={`${a.name} 사용`}
                      disabled={toggle.isPending}
                      onChange={() => toggle.mutate(a)}
                    />
                  </label>
                  <Menu
                    label={`${a.name} 메뉴`}
                    triggerClassName="tk-icon-button tk-icon-button--sm"
                    items={[
                      { label: "위로", icon: "chevron-up", disabled: i === 0 || reorder.isPending, onSelect: () => moveBy(i, i - 1) },
                      { label: "아래로", icon: "chevron-down", disabled: i === rows.length - 1 || reorder.isPending, onSelect: () => moveBy(i, i + 1) },
                      ...(a.cooldown_seconds > 0 ? [{ label: "한도 대기 풀기", icon: "clock" as const, onSelect: () => clear.mutate(a) }] : []),
                      { label: "이름 바꾸기", icon: "key", separatorBefore: true, onSelect: () => setEditing(a) },
                      {
                        label: a.pool === "work" ? "회사 그룹에서 빼기" : "회사 그룹에 넣기",
                        icon: "briefcase",
                        onSelect: () => tagWork.mutate(a),
                      },
                      { label: "삭제", icon: "trash", danger: true, onSelect: () => setRemoving(a) },
                    ]}
                  >
                    <Icon name="more-vertical" />
                  </Menu>
                </span>
              </div>
          )}
        />
      )}
      {overriding && <OverrideDialog accounts={rows} onClose={() => setOverriding(false)} />}
      {editing && <AccountDialog account={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
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
        <p>따까리 목록에서만 빠져요. 그 계정의 로그인 정보는 Mac Studio 에 그대로 남아요.</p>
        {remove.error && <p className="tk-error" role="alert">{errMessage(remove.error)}</p>}
      </Dialog>
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
