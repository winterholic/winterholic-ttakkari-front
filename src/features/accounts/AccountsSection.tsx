import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, clearAccountCooldown, createAccount, deleteAccount, listAccounts, patchAccount, reorderAccounts } from "../../api/client";
import type { AccountEngine, AccountOut } from "../../api/types";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { Menu } from "../../ui/Menu";
import { Select } from "../../ui/Select";
import { errorText } from "../viewer/api";
import { ErrorState, ListSkeleton } from "../viewer/screenStates";

export const ACCOUNTS_KEY = ["accounts"] as const;

const ENGINE_LABEL: Record<AccountEngine, string> = { claude: "Claude Code", codex: "Codex" };
const ENGINE_OPTIONS = [
  { value: "claude" as const, label: "Claude Code" },
  { value: "codex" as const, label: "Codex" },
];
const DEFAULT_DIR: Record<AccountEngine, string> = { claude: "~/.claude", codex: "~/.codex" };
const LOGIN_CMD: Record<AccountEngine, (dir: string) => string> = {
  claude: (dir) => `CLAUDE_CONFIG_DIR=${dir} claude   # 열리면 /login`,
  codex: (dir) => `CODEX_HOME=${dir} codex login`,
};

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.errors?.map((x) => x.msg.replace(/^Value error, /, "")).join(" ") || e.message;
  return errorText(e).message;
}

function loginText(a: AccountOut): string {
  if (a.login === "ok") return a.login_label ? a.login_label : "로그인됨";
  if (a.login === "missing") return "계정 폴더 없음";
  return "로그인 확인 못 함";
}

function minutes(sec: number): string {
  return sec >= 60 ? `${Math.ceil(sec / 60)}분` : `${sec}초`;
}

/** 설정 > 계정. 위에서부터 차례로 쓰고, 사용량 한도면 다음 계정으로 넘어간다(ADR 0006). */
export function AccountsSection() {
  const qc = useQueryClient();
  const id = useId();
  const q = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: listAccounts, refetchInterval: 30_000 });
  const [editing, setEditing] = useState<AccountOut | "new" | null>(null);
  const [removing, setRemoving] = useState<AccountOut | null>(null);
  const set = (rows: AccountOut[]) => qc.setQueryData(ACCOUNTS_KEY, rows);
  const replace = (a: AccountOut) => set((q.data ?? []).map((x) => (x.id === a.id ? a : x)));

  const toggle = useMutation({ mutationFn: (a: AccountOut) => patchAccount(a.id, { enabled: !a.enabled }), onSuccess: replace });
  const clear = useMutation({ mutationFn: (a: AccountOut) => clearAccountCooldown(a.id), onSuccess: replace });
  const move = useMutation({
    mutationFn: ({ from, to }: { from: number; to: number }) => {
      const ids = (q.data ?? []).map((a) => a.id);
      const [x] = ids.splice(from, 1);
      ids.splice(to, 0, x);
      return reorderAccounts(ids);
    },
    onSuccess: set,
  });
  const remove = useMutation({
    mutationFn: (a: AccountOut) => deleteAccount(a.id),
    onSuccess: () => {
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    },
  });
  const rowError = toggle.error ?? clear.error ?? move.error;
  const rows = q.data ?? [];
  const enabledCount = rows.filter((a) => a.enabled).length;

  return (
    <section className="tk-section" id="accounts" aria-labelledby={`${id}-title`}>
      <div className="tk-section__head">
        <h2 className="tk-section__title" id={`${id}-title`}>계정</h2>
        <button className="tk-button tk-button--sm" type="button" onClick={() => setEditing("new")}>
          <Icon name="plus" />
          계정 추가
        </button>
      </div>
      <p className="tk-fieldset__help">
        위에서부터 차례로 써요. 사용량 한도에 걸리면 그 계정은 잠시 쉬고 다음 계정으로 이어서 해요. 오케스트레이터와 작업 세션은 Claude Code 계정이 다 막히면 Codex 까지 넘어가요.
      </p>
      {q.isPending && <ListSkeleton rows={2} label="계정을 불러오는 중" />}
      {q.isError && <ErrorState error={q.error} what="계정" onRetry={() => void q.refetch()} />}
      {q.isSuccess && enabledCount === 0 && (
        <p className="tk-banner tk-banner--warning" role="status">
          <Icon name="warning" />
          <span className="tk-banner__text">켜진 계정이 없어요. 하나 이상 켜야 지시를 실행할 수 있어요.</span>
        </p>
      )}
      {rowError && (
        <p className="tk-error" role="alert">
          {errMessage(rowError)}
        </p>
      )}
      {q.isSuccess && (
        <ol className="tk-list" aria-label="계정 우선순위">
          {rows.map((a, i) => (
            <li key={a.id}>
              <div className="tk-list__item account-row" aria-disabled={!a.enabled || undefined}>
                <span className="account-row__rank" aria-label={`${i + 1}순위`}>{i + 1}</span>
                <span className="tk-list__body">
                  <span className="tk-list__title">{a.name}</span>
                  <span className="tk-list__meta">
                    <span>{ENGINE_LABEL[a.engine]}</span>
                    <span className={a.login === "ok" ? undefined : "account-row__warn"}>{loginText(a)}</span>
                    {a.config_dir && <span className="tk-mono">{a.config_dir}</span>}
                    {a.cooldown_seconds > 0 && <span className="tk-badge tk-badge--warning">한도 대기 {minutes(a.cooldown_seconds)}</span>}
                  </span>
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
                      { label: "위로", icon: "chevron-up", disabled: i === 0 || move.isPending, onSelect: () => move.mutate({ from: i, to: i - 1 }) },
                      { label: "아래로", icon: "chevron-down", disabled: i === rows.length - 1 || move.isPending, onSelect: () => move.mutate({ from: i, to: i + 1 }) },
                      ...(a.cooldown_seconds > 0 ? [{ label: "한도 대기 풀기", icon: "clock" as const, onSelect: () => clear.mutate(a) }] : []),
                      { label: "이름·폴더 바꾸기", icon: "key", separatorBefore: true, onSelect: () => setEditing(a) },
                      { label: "삭제", icon: "trash", danger: true, onSelect: () => setRemoving(a) },
                    ]}
                  >
                    <Icon name="more-vertical" />
                  </Menu>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
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
        <p>따까리 목록에서만 빠져요. 계정 폴더와 로그인 정보는 그대로 남아요.</p>
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
  const [dir, setDir] = useState(account?.config_dir ?? "");
  const save = useMutation({
    mutationFn: () =>
      account
        ? patchAccount(account.id, { name: name.trim(), config_dir: dir.trim() || null })
        : createAccount({ name: name.trim(), engine, config_dir: dir.trim() || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ACCOUNTS_KEY });
      onClose();
    },
  });
  const ready = name.trim() !== "";
  const shownDir = dir.trim() || DEFAULT_DIR[engine];
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      modal
      title={account ? "계정 고치기" : "계정 추가"}
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
        <div className="tk-field">
          <label className="tk-label" htmlFor={`${id}-dir`}>
            계정 폴더 <span className="tk-label__optional">선택</span>
          </label>
          <input
            id={`${id}-dir`}
            className="tk-input tk-input--mono"
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            placeholder={`비우면 기본 위치(${DEFAULT_DIR[engine]})`}
            aria-describedby={`${id}-dir-help`}
          />
          <p className="tk-help" id={`${id}-dir-help`}>
            <span>계정마다 폴더가 달라야 해요. 처음 쓰는 폴더면 Mac Studio 터미널에서 한 번 로그인해 주세요.</span>
          </p>
          <code className="account-form__cmd">{LOGIN_CMD[engine](shownDir)}</code>
        </div>
        {save.error && (
          <p className="tk-error" role="alert">
            {errMessage(save.error)}
          </p>
        )}
      </form>
    </Dialog>
  );
}
