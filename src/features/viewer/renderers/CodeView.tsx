import { Fragment, useMemo, useState } from "react";
import { Icon } from "../../../ui/Icon";
import { useIsDesktop } from "../hooks";
import { HIGHLIGHT_MAX_CHARS, languageFor, tokenizeLines } from "./highlight";

// Monaco 는 쓰지 않는다. 숨은 textarea(14px)·찾기 입력(13px)에 포커스가 가면 iOS 가 화면을 확대하고,
// 찾기 위젯이 폭을 넘고 아이콘 폰트가 없어 깨졌다. 읽기 전용 뷰어라 <pre> 와 가벼운 강조로 충분하다.
const MAX_CHARS = 500_000;

export interface CodeViewProps {
  text: string;
  filename: string;
  /** 툴바 찾기(findInDom)가 표시를 칠할 루트. */
  codeRef?: React.Ref<HTMLElement>;
}

export default function CodeView({ text, filename, codeRef }: CodeViewProps) {
  const desktop = useIsDesktop();
  // 휴대폰에서는 처음부터 줄을 바꿔 가로로 밀지 않아도 읽게 한다. 끄면 코드 영역 안에서만 가로 스크롤한다.
  const [wrap, setWrap] = useState(!desktop);
  const [copied, setCopied] = useState(false);
  const truncated = text.length > MAX_CHARS;
  const value = truncated ? text.slice(0, MAX_CHARS) : text;
  const lang = languageFor(filename);
  const lines = useMemo(() => tokenizeLines(value, filename), [value, filename]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 클립보드 권한이 없으면 조용히 둔다. 선택 후 복사는 그대로 가능하다.
    }
  };

  return (
    <figure className="tk-code tk-code--viewer" data-wrap={wrap || undefined}>
      <figcaption className="tk-code__header">
        <span className="tk-code__lang">{lang}</span>
        <span className="tk-code__title">{filename}</span>
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
      {truncated && <p className="tk-viewer__notice tk-viewer__notice--warning"><Icon name="warning" /><span>큰 파일이라 처음 500,000자만 보여 드려요. 전체는 원본을 받아 보세요.</span></p>}
      {!truncated && value.length > HIGHLIGHT_MAX_CHARS && <p className="tk-viewer__notice"><Icon name="info" /><span>큰 파일이라 구문 색은 끄고 보여 드려요.</span></p>}
      <pre className="tk-code__pre" data-line-numbers tabIndex={0} aria-label={`${filename} 코드`}>
        <code ref={codeRef}>
          {lines.map((line, i) => (
            <Fragment key={i}>
              {i > 0 && "\n"}
              <span className="tk-code__line">
                {line.map((t, j) => (t.cls ? <span key={j} className={`token ${t.cls}`}>{t.text}</span> : t.text))}
              </span>
            </Fragment>
          ))}
        </code>
      </pre>
    </figure>
  );
}
