import { memo, useCallback, useMemo, useState } from "react";
import { Icon } from "../../../ui/Icon";
import { useIsDesktop } from "../hooks";
import { clipForView } from "./clip";
import { HIGHLIGHT_MAX_CHARS, languageFor, tokenizeLines } from "./highlight";
import type { Token } from "./highlight";

// Monaco 는 쓰지 않는다. 숨은 textarea(14px)·찾기 입력(13px)에 포커스가 가면 iOS 가 화면을 확대하고,
// 찾기 위젯이 폭을 넘고 아이콘 폰트가 없어 깨졌다. 읽기 전용 뷰어라 줄마다 한 행으로 그리면 충분하다.
//
// 행 구조는 EZ Work FSW 의 EzChatCodeView 에서 가져왔다. 줄 번호를 CSS counter 가 아니라 줄마다 있는
// 칸으로 두어(왼쪽에 고정, 가로로 밀어도 따라온다) 줄 바꿈을 켜도 번호가 첫 줄 옆에 남고, 번호를 누르면
// 그 줄이 표시된 채로 남는다. 번호는 글자가 아니라 ::before 로 그려 복사·찾기에 섞이지 않는다.

export interface CodeViewProps {
  text: string;
  filename: string;
  /** 툴바 찾기(findInDom)가 표시를 칠할 루트. */
  codeRef?: React.Ref<HTMLElement>;
}

const Row = memo(function Row({ n, tokens, marked, onMark }: { n: number; tokens: Token[]; marked: boolean; onMark: (n: number) => void }) {
  return (
    <div className="tk-code__row" data-marked={marked || undefined}>
      {/* 키보드 탭 정지점이 줄 수만큼 생기지 않게 tabIndex 를 뺀다. 표시는 눈으로 짚는 보조 기능이다. */}
      <button className="tk-code__no" type="button" tabIndex={-1} data-ln={n} aria-label={`${n}번 줄 표시`} aria-pressed={marked} onClick={() => onMark(n)} />
      <span className="tk-code__text">
        {tokens.map((t, j) => (t.cls ? <span key={j} className={`token ${t.cls}`}>{t.text}</span> : t.text))}
      </span>
    </div>
  );
});

function safeTokenize(text: string, filename: string): Token[][] {
  try {
    return tokenizeLines(text, filename);
  } catch {
    // 강조는 덤이다. 정규식이 어떤 입력에서 던져도 글은 그대로 보여 준다.
    return text.split("\n").map((l) => (l ? [{ text: l }] : []));
  }
}

export default function CodeView({ text, filename, codeRef }: CodeViewProps) {
  const desktop = useIsDesktop();
  // 휴대폰에서는 처음부터 줄을 바꿔 가로로 밀지 않아도 읽게 한다. 끄면 코드 영역 안에서만 가로 스크롤한다.
  const [wrap, setWrap] = useState(!desktop);
  const [copied, setCopied] = useState(false);
  const [marked, setMarked] = useState<number | null>(null);
  const clip = useMemo(() => clipForView(text), [text]);
  const lang = languageFor(filename);
  const lines = useMemo(() => (clip.lines === 0 ? [] : safeTokenize(clip.value, filename)), [clip, filename]);
  const onMark = useCallback((n: number) => setMarked((cur) => (cur === n ? null : n)), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 클립보드 권한이 없으면 조용히 둔다. 선택 후 복사는 그대로 가능하다.
    }
  };

  // 번호 칸 폭은 자릿수로 정한다. 고정하면 1000줄이 넘는 파일에서 번호가 잘린다.
  const gutter = `${Math.max(2, String(lines.length).length)}ch`;

  return (
    <figure className="tk-code tk-code--viewer" data-wrap={wrap || undefined}>
      <figcaption className="tk-code__header">
        <span className="tk-code__lang">{lang}</span>
        <span className="tk-code__title">{clip.lines.toLocaleString("ko-KR")}줄</span>
        <button className="tk-icon-button tk-icon-button--sm" type="button" aria-pressed={wrap} aria-label="줄 바꿈" title="줄 바꿈" onClick={() => setWrap((w) => !w)}>
          <Icon name="wrap" />
        </button>
        <button className="tk-copy" type="button" data-copied={copied || undefined} onClick={copy}>
          <Icon name="copy" className="tk-copy__idle" />
          <Icon name="check" className="tk-copy__done" />
          <span className="tk-copy__idle">복사</span>
          <span className="tk-copy__done" role="status">복사됨</span>
        </button>
      </figcaption>
      {clip.cut === "chars" && <p className="tk-viewer__notice tk-viewer__notice--warning"><Icon name="warning" /><span>큰 파일이라 앞부분만 보여 드려요. 전체는 원본을 받아 보세요.</span></p>}
      {clip.cut === "lines" && <p className="tk-viewer__notice tk-viewer__notice--warning"><Icon name="warning" /><span>큰 파일이라 앞의 {clip.lines.toLocaleString("ko-KR")}줄만 보여 드려요{clip.totalLines ? ` (전체 ${clip.totalLines.toLocaleString("ko-KR")}줄)` : ""}. 전체는 원본을 받아 보세요.</span></p>}
      {!clip.cut && lang !== "plaintext" && clip.value.length > HIGHLIGHT_MAX_CHARS && <p className="tk-viewer__notice"><Icon name="info" /><span>큰 파일이라 구문 색은 끄고 보여 드려요.</span></p>}
      {clip.lines === 0 ? (
        <p className="tk-viewer__notice"><Icon name="info" /><span>비어 있는 파일이에요.</span></p>
      ) : (
        <pre className="tk-code__pre" tabIndex={0} aria-label={`${filename} 코드`}>
          <code ref={codeRef} style={{ "--tk-_no-w": gutter } as React.CSSProperties}>
            {lines.map((tokens, i) => (
              <Row key={i} n={i + 1} tokens={tokens} marked={marked === i + 1} onMark={onMark} />
            ))}
          </code>
        </pre>
      )}
    </figure>
  );
}
