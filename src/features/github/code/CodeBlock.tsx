import { useMemo, useState } from "react";
import { Button } from "../../../ui/Button";

export const CODE_PAGE_LINES = 400;

/** 본문 문자열을 줄로 나눈다. CRLF 를 풀고, 끝 줄바꿈이 만든 빈 마지막 줄은 버린다. */
export function toLines(text: string): string[] {
  const lines = text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export interface CodeBlockProps {
  text: string;
  wrap: boolean;
  /** 접근 가능한 이름(영역). */
  label?: string;
}

/**
 * 줄번호 거터가 고정된 코드 보기. 가로 스크롤이 기본이고 줄바꿈은 토글이다(디자인 시스템 tk-diff 표 구조를 쓴다).
 * 큰 파일은 400줄씩만 그리고 "다음 400줄"로 이어 붙인다. 모바일에서 수천 행을 한 번에 그리지 않는다.
 */
export function CodeBlock({ text, wrap, label = "코드" }: CodeBlockProps) {
  const lines = useMemo(() => toLines(text), [text]);
  const [shown, setShown] = useState(CODE_PAGE_LINES);
  const visible = Math.min(shown, lines.length);
  const remaining = lines.length - visible;
  return (
    <div className="gh-codewrap">
      <section className="tk-diff gh-codebox" data-wrap={wrap || undefined}>
        <div className="tk-diff__body" tabIndex={0} role="region" aria-label={label}>
          <table className="tk-diff__table">
            <tbody>
              {lines.slice(0, visible).map((line, i) => (
                <tr key={i}>
                  <td className="tk-diff__no">{i + 1}</td>
                  <td className="tk-diff__code">{line}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="gh-note">{lines.length.toLocaleString("ko-KR")}줄 중 {visible.toLocaleString("ko-KR")}줄 표시</p>
      {remaining > 0 && (
        <Button variant="ghost" block onClick={() => setShown(visible + CODE_PAGE_LINES)}>
          다음 {Math.min(CODE_PAGE_LINES, remaining)}줄 더 보기
        </Button>
      )}
    </div>
  );
}
