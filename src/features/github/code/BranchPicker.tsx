import { useId, useState } from "react";
import type { FormEvent } from "react";
import { ghBranches } from "../../../api/githubClient";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Dialog } from "../../../ui/Dialog";
import { Icon } from "../../../ui/Icon";
import { useGhInfinite } from "../data";
import { useGh } from "../GithubContext";
import { InfiniteView } from "../state/StateView";

// ref 규칙은 서버 검증과 같은 방향이지만 프론트는 명백히 깨진 값만 거른다(최종 검증은 서버).
const BAD_REF = /[~^:?*[\\\s]|\.\./;
const hasControl = (s: string): boolean => [...s].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f);
export const isPlausibleRef = (s: string): boolean => s.length > 0 && s.length <= 255 && !s.startsWith("-") && !BAD_REF.test(s) && !hasControl(s);

export interface BranchPickerProps {
  owner: string;
  repo: string;
  /** 지금 보는 ref. 없으면 기본 브랜치. */
  current?: string;
  defaultBranch: string;
  onPick: (ref: string) => void;
}

/** 브랜치 목록에서 고르거나, 목록에 없는 태그·커밋을 직접 입력한다. 열 때만 목록을 불러온다. */
export function BranchPicker({ owner, repo, current, defaultBranch, onPick }: BranchPickerProps) {
  const { account } = useGh();
  const [open, setOpen] = useState(false);
  const label = current ?? defaultBranch;
  return (
    <>
      <button type="button" className="tk-button tk-button--ghost tk-button--sm gh-refbutton" aria-label={"브랜치·태그 바꾸기, 지금 " + label} aria-haspopup="dialog" onClick={() => setOpen(true)} title={label}>
        <Icon name="git-branch" /><span>{label}</span><Icon name="chevron-down" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="브랜치·태그">
        {open && <BranchList owner={owner} repo={repo} account={account} current={label} defaultBranch={defaultBranch} onPick={(r) => { setOpen(false); onPick(r); }} />}
      </Dialog>
    </>
  );
}

function BranchList({ owner, repo, account, current, defaultBranch, onPick }: { owner: string; repo: string; account: string; current: string; defaultBranch: string; onPick: (ref: string) => void }) {
  const id = useId();
  const [filter, setFilter] = useState("");
  const [direct, setDirect] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const query = useGhInfinite(account, ["branches", owner, repo], (page) => ghBranches(account, owner, repo, { page }));
  const needle = filter.trim().toLowerCase();

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = direct.trim();
    if (!isPlausibleRef(v)) {
      setProblem("쓸 수 없는 이름이에요. 공백·특수문자 없이 브랜치, 태그, 커밋 SHA 를 넣어 주세요.");
      return;
    }
    onPick(v);
  }

  return (
    <div className="gh-branchlist">
      <label className="tk-label" htmlFor={id + "-filter"}>브랜치 찾기</label>
      <input id={id + "-filter"} className="tk-input" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="이름으로 거르기" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <InfiniteView query={query} label="브랜치를 불러오는 중" empty={{ icon: "git-branch", title: "브랜치가 없어요" }}>
        {(items) => {
          const shown = items.filter((b) => b.name.toLowerCase().includes(needle));
          return shown.length === 0 ? (
            <p className="gh-note">불러온 브랜치 중에 맞는 이름이 없어요. 더 보기로 이어 불러오거나 아래에 직접 입력해 보세요.</p>
          ) : (
            <ul className="tk-list tk-list--inset" aria-label="브랜치 목록">
              {shown.map((b) => (
                <li key={b.name}>
                  <button type="button" className="tk-list__item" aria-current={b.name === current ? "true" : undefined} onClick={() => onPick(b.name)}>
                    <span className="tk-list__body">
                      <span className="tk-list__title tk-list__title--wrap">{b.name}</span>
                      <span className="tk-list__meta">
                        {b.name === defaultBranch && <Badge tone="info">기본</Badge>}
                        {b.protected && <Badge>보호됨</Badge>}
                      </span>
                    </span>
                    {b.name === current && <span className="tk-list__end"><Icon name="check" /></span>}
                  </button>
                </li>
              ))}
            </ul>
          );
        }}
      </InfiniteView>
      <form className="gh-target" onSubmit={submit}>
        <label className="tk-label" htmlFor={id + "-direct"}>태그·커밋 직접 입력</label>
        <div className="gh-target__row">
          <input id={id + "-direct"} className="tk-input tk-input--mono" value={direct} onChange={(e) => setDirect(e.target.value)} placeholder="v1.2.0 또는 커밋 SHA" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={255} aria-invalid={problem ? true : undefined} />
          <Button type="submit" variant="primary">이동</Button>
        </div>
        {problem && <p className="tk-error" role="alert">{problem}</p>}
      </form>
    </div>
  );
}
