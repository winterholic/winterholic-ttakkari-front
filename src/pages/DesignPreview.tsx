import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getDesignSystemPreview } from "../api/client";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

/** A committed DS example gets scripts in an opaque origin; no app cookies, API, forms or popups. */
export function DesignPreview({ system, name, revision, item, source }: { system: string; name: string; revision: string; item?: string; source: () => void }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [section, setSection] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const query = useQuery({ queryKey: ["design-system-preview", system, item, revision, theme], queryFn: () => getDesignSystemPreview(system, { revision, item, theme }), staleTime: 60_000 });
  // The fragment is escaped as a JS string; no source is inserted into the parent DOM.
  const targetSection = section ?? query.data?.sections[0]?.id ?? "";
  const fragmentScript = targetSection ? `<script>addEventListener('load',()=>{const el=document.getElementById(${JSON.stringify(targetSection).replace(/</g, "\\u003c")});if(el)window.scrollTo(0,el.getBoundingClientRect().top+scrollY-56)});</script>` : "";
  const document = query.data ? query.data.html + fragmentScript : "";
  const canvas = (large: boolean) => <iframe key={`${system}:${item}:${theme}:${targetSection}:${attempt}:${large}`} title={`${name} 시각 미리보기${large ? " 확대" : ""}`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={document} className="ds-preview-frame" />;
  return <section className="ds-preview ds-stack" aria-label="시각 미리보기">
    <div className="ds-preview__intro"><h2 className="tk-heading-3">{name} 한눈에 보기</h2></div>
    <div className="ds-preview__toolbar">
      <div className="ds-segment" role="group" aria-label="미리보기 테마">
        <Button variant="ghost" aria-pressed={theme === "light"} onClick={() => setTheme("light")}>라이트</Button>
        <Button variant="ghost" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>다크</Button>
      </div>
      <Button variant="ghost" disabled={!query.data} onClick={() => setExpanded(true)}>크게 보기</Button>
      <Button variant="ghost" onClick={source}>원문 보기</Button>
    </div>
    {query.isPending && <div className="ds-preview__loading" role="status"><span className="tk-spinner" aria-hidden="true" />미리보기를 준비하는 중</div>}
    {query.isError && <div className="ds-error"><p className="tk-error" role="alert">{query.error instanceof Error ? query.error.message : "미리보기를 불러오지 못했어요."}</p><Button variant="ghost" onClick={() => void query.refetch()}>다시 시도</Button><p className="ds-note">원문 보기에서 내용을 먼저 확인할 수 있어요.</p></div>}
    {query.data && <>
      {query.data.sections.length > 0 && <label className="ds-jump"><span className="ds-note">바로 이동</span><select className="tk-select" aria-label="미리보기 구간 이동" value={targetSection} onChange={(e) => setSection(e.target.value)}><option value="">처음부터 보기</option>{query.data.sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>}
      <div className="ds-preview__canvas">{!expanded && canvas(false)}</div>
      <div className="ds-tools ds-preview__foot"><p className="ds-note">미리보기 안에서 스크롤해 더 볼 수 있어요.</p><Button variant="ghost" size="sm" onClick={() => setAttempt((v) => v + 1)}>처음 상태로</Button></div>
      {query.data.warnings.length > 0 && <details className="ds-disclosure"><summary>일부 자산을 표시하지 못했어요 ({query.data.warnings.length})</summary><ul>{query.data.warnings.map((w) => <li key={w}>{w}</li>)}</ul></details>}
    </>}
    {expanded && <Dialog open title="미리보기 크게 보기" onClose={() => setExpanded(false)} size="lg"><div className="ds-preview-expanded">{canvas(true)}</div></Dialog>}
  </section>;
}
