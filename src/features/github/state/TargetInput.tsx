import { useId, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ghResolve } from "../../../api/githubClient";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import { useGh } from "../GithubContext";
import { ghPath, routeForResolved } from "../links";
import { getRecent, pushRecent } from "../recent";
import { describeGhError } from "./errors";

const MAX_INPUT = 2048;

/**
 * `owner/repo` 나 github.com 주소를 넣어 연다. 주소는 서버가 해석하고(`/resolve`), 이동 경로는 해석 결과 필드로만 만든다.
 * 사용자가 넣은 원본 URL 은 이동에도 저장에도 쓰지 않는다.
 */
export function TargetInput() {
  const { account } = useGh();
  const navigate = useNavigate();
  const inputId = useId();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const recent = getRecent(account);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    if (q.length > MAX_INPUT) {
      setProblem("주소가 너무 길어요.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const r = await ghResolve(q);
      if (r.repo) pushRecent({ account, owner: r.owner, repo: r.repo });
      navigate(routeForResolved(account, r));
    } catch (err) {
      setProblem(describeGhError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gh-section" aria-labelledby={inputId + "-title"}>
      <h2 id={inputId + "-title"} className="gh-section__title">저장소 열기</h2>
      <form className="gh-target" onSubmit={(e) => void submit(e)}>
        <label className="tk-label" htmlFor={inputId}>저장소 주소</label>
        <div className="gh-target__row">
          <input
            id={inputId}
            className="tk-input tk-input--mono"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="owner/repo 또는 https://github.com/…"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={MAX_INPUT}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? inputId + "-error" : undefined}
          />
          <Button type="submit" variant="primary" busy={busy}>열기</Button>
        </div>
        {problem && <p id={inputId + "-error"} className="tk-error" role="alert"><Icon name="warning" /> {problem}</p>}
      </form>
      {recent.length > 0 && (
        <div className="gh-recent">
          <p className="gh-note">최근에 연 저장소</p>
          <ul className="gh-chips">
            {recent.map((t) => (
              <li key={t.owner + "/" + t.repo}>
                <Link className="tk-chip" to={ghPath(account, { owner: t.owner, repo: t.repo })}><span>{t.owner + "/" + t.repo}</span></Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
