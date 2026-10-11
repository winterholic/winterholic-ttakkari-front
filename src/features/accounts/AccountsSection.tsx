import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, clearAccountCooldown, createAccount, deleteAccount, listAccounts, patchAccount, reorderAccounts } from "../../api/client";
import type { AccountEngine, AccountOut, AccountPool } from "../../api/types";
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

/** 설정 > 계정. 개인·회사 두 묶음. 회사 업무 탭에서 만든 대화만 회사 계정을 쓴다. */
export function AccountsSection() {
  return (
    <>
      <AccountPoolSection pool="personal" />
      <AccountPoolSection pool="work" />
    </>
  );
}

const POOL_TEXT: Record<AccountPool, { title: string; help: string; empty: string }> = {
  personal: {
    title: "개인 계정",
    help: "채팅 탭에서 시킨 일이 써요. 손잡이를 끌어 순서를 바꾸고, 위에서부터 차례로 써요. 사용량 한도에 걸리면 그 계정은 잠시 쉬고 다음 계정으로 이어서 해요(Claude Code 가 다 막히면 Codex 까지).",
    empty: "개인 계정이 없어요.",
  },
  work: {
    title: "회사 계정",
    help: "회사 업무 탭에서 시킨 일만 써요(작업 세션·결과 보고까지). 순서·켜기·임시 순서가 개인 계정과 따로예요. 계정은 개인 계정의 ⋮ 메뉴에서 옮겨 와요.",
    empty: "회사 계정이 없어요. 개인 계정의 ⋮ 메뉴에서 「회사 계정으로 옮기기」로 들여요.",
  },
};

/** 한 묶음(개인·회사)의 계정 목록. 위에서부터 차례로 쓰고, 사용량 한도면 다음 계정으로 넘어간다(ADR 0006). */
function AccountPoolSection({ pool }: { pool: AccountPool }) {
  const qc = useQueryClient();
  const id = useId();
  const q = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: listAccounts, refetchInterval: 30_000 });
  const [editing, setEditing] = useState<AccountOut | "new" | null>(null);
  const [removing, setRemoving] = useState<AccountOut | null>(null);
  const [overriding, setOverriding] = useState(false);
  const all = q.data ?? [];
  const setAll = (rows: AccountOut[]) => qc.setQueryData(ACCOUNTS_KEY, rows);
  // 다른 묶음 계정은 그대로 두고 이 묶음만 바꾼다(캐시는 두 묶음이 함께 쓴다).
  const set = (rows: AccountOut[]) => setAll([...all.filter((a) => a.pool !== pool), ...rows]);
  const replace = (a: AccountOut) => setAll(all.map((x) => (x.id === a.id ? a : x)));

  const toggle = useMutation({ mutationFn: (a: AccountOut) => patchAccount(a.id, { enabled: !a.enabled }), onSuccess: replace });
  const clear = useMutation({ mutationFn: (a: AccountOut) => clearAccountCooldown(a.id), onSuccess: replace });
  const reorder = useMutation({
    mutationFn: (next: AccountOut[]) => reorderAccounts(next.map((a) => a.id), pool),
    onMutate: (next) => set(next),
    onSuccess: set,
    onError: () => void q.refetch(),
  });
  const movePool = useMutation({
    mutationFn: (a: AccountOut) => patchAccount(a.id, { pool: pool === "work" ? "personal" : "work" }),
    onSuccess: (a) => {
      replace(a);
      toast({ message: `${a.name} 을(를) ${a.pool === "work" ? "회사" : "개인"} 계정으로 옮겼어요.` });
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
  const rowError = toggle.error ?? clear.error ?? reorder.error ?? movePool.error;
  const rows = all.filter((a) => a.pool === pool);
  const enabledCount = rows.filter((a) => a.enabled).length;

  return (
    <section className="tk-section" id={pool === "work" ? "work-accounts" : "accounts"} aria-labelledby={`${id}-title`}>
      <div className="tk-section__head">
        <h2 className="tk-section__title" id={`${id}-title`}>{POOL_TEXT[pool].title}</h2>
        <div className="tk-button-group">
          <button className="tk-button tk-button--sm" type="button" onClick={() => setOverriding(true)} disabled={rows.length < 2}>
            <Icon name="clock" />
            임시 순서
          </button>
          {/* 회사 계정은 개인 계정 메뉴의 「회사 계정으로 옮기기」로만 들인다(사용자 결정 10-12). */}
          {pool === "personal" && (
            <button className="tk-button tk-button--sm" type="button" onClick={() => setEditing("new")}>
              <Icon name="plus" />
              계정 추가
            </button>
          )}
        </div>
      </div>
      <p className="tk-fieldset__help">{POOL_TEXT[pool].help}</p>
      <OverrideBanner accounts={rows} pool={pool} onEdit={() => setOverriding(true)} />
      {q.isSuccess && rows.length === 0 && <p className="tk-fieldset__help">{POOL_TEXT[pool].empty}</p>}
      {q.isPending && <ListSkeleton rows={2} label="계정을 불러오는 중" />}
      {q.isError && <ErrorState error={q.error} what="계정" onRetry={() => void q.refetch()} />}
      {q.isSuccess && rows.length > 0 && enabledCount === 0 && (
        <aside className="tk-callout tk-callout--warning" role="status">
          <Icon name="warning" className="tk-callout__icon" />
          <div className="tk-callout__body"><p>켜진 계정이 없어요. 하나 이상 켜야 지시를 실행할 수 있어요.</p></div>
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
                  <span className="tk-list__title">{a.name}</span>
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
                        label: pool === "work" ? "개인 계정으로 옮기기" : "회사 계정으로 옮기기",
                        icon: "briefcase",
                        onSelect: () => movePool.mutate(a),
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
      {overriding && <OverrideDialog accounts={rows} pool={pool} onClose={() => setOverriding(false)} />}
      {editing && <AccountDialog account={editing === "new" ? null : editing} pool={pool} onClose={() => setEditing(null)} />}
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

function AccountDialog({ account, pool, onClose }: { account: AccountOut | null; pool: AccountPool; onClose: () => void }) {
  const qc = useQueryClient();
  const id = useId();
  const [name, setName] = useState(account?.name ?? "");
  const [engine, setEngine] = useState<AccountEngine>(account?.engine ?? "claude");
  const save = useMutation({
    mutationFn: () =>
      account
        ? patchAccount(account.id, { name: name.trim() })
        : createAccount({ name: name.trim(), engine, pool }),
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
      title={account ? "이름 바꾸기" : pool === "work" ? "회사 계정 추가" : "계정 추가"}
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
