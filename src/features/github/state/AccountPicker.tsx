import type { GhAccount } from "../../../api/githubTypes";
import { Badge } from "../../../ui/Badge";
import { Icon } from "../../../ui/Icon";

export interface AccountPickerProps {
  accounts: GhAccount[];
  /** URL 의 `as` 가 가리켰지만 쓸 수 없던 값. 있으면 이유를 알린다. */
  requested?: string | null;
  onPick: (login: string) => void;
}

/** gh 에 로그인된 계정 중 하나를 고른다. 토큰은 서버에만 있고 여기서는 이름·scope·상태만 보인다. */
export function AccountPicker({ accounts, requested, onPick }: AccountPickerProps) {
  const broken = accounts.some((a) => a.state !== "success");
  const requestedAccount = requested ? accounts.find((a) => a.login === requested) : undefined;
  return (
    <section className="gh-section" aria-labelledby="gh-pick-title">
      <h2 id="gh-pick-title" className="gh-section__title">GitHub 계정 선택</h2>
      {requested && (
        <p className="tk-banner tk-banner--warning" role="status">
          <Icon name="warning" />
          <span className="tk-banner__text">
            {requestedAccount ? requested + " 계정은 지금 쓸 수 없어요. 다른 계정을 골라 주세요." : requested + " 계정을 찾을 수 없어요. 아래 계정 중에서 골라 주세요."}
          </span>
        </p>
      )}
      <p className="gh-note">조회는 고른 계정의 권한으로만 이뤄져요. 계정마다 볼 수 있는 비공개 저장소가 달라요.</p>
      <ul className="tk-list tk-list--inset">
        {accounts.map((a) => {
          const ok = a.state === "success";
          return (
            <li key={a.login}>
              <button type="button" className="tk-list__item" disabled={!ok} aria-disabled={!ok} onClick={() => onPick(a.login)}>
                <span className="tk-list__body">
                  <span className="tk-list__title tk-list__title--wrap">{a.login}</span>
                  <span className="tk-list__meta">
                    {a.active && <Badge tone="info">gh 활성 계정</Badge>}
                    {!ok && <Badge tone="warning">사용 불가</Badge>}
                    {a.scopes.length > 0 && <span title={a.scopes.join(", ")}>권한 {a.scopes.join(", ")}</span>}
                  </span>
                </span>
                {ok && <span className="tk-list__end"><Icon name="chevron-right" /></span>}
              </button>
            </li>
          );
        })}
      </ul>
      {broken && <p className="gh-note">사용 불가 계정은 Mac Studio 에서 gh auth login 으로 다시 로그인하면 쓸 수 있어요.</p>}
    </section>
  );
}
