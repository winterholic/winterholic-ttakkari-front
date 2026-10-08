import { useEffect, useRef, useState } from "react";
import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/features/find/register";
import "monaco-editor/languages/definitions/register.all";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import themes from "../../../vendor/ttakkari/monaco-theme.json";
import { Icon } from "../../../ui/Icon";
import { useAppTheme } from "../hooks";
import { extOf } from "../kinds";

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = { getWorker: () => new EditorWorker() };

monaco.editor.defineTheme("tk-ink-light", themes["tk-ink-light"] as monaco.editor.IStandaloneThemeData);
monaco.editor.defineTheme("tk-ink-dark", themes["tk-ink-dark"] as monaco.editor.IStandaloneThemeData);

// json 은 전용 언어 서비스(워커)를 끌어오지 않으려고 javascript 문법 색으로 보여 준다.
const EXT_ALIAS: Record<string, string> = { json: "javascript", jsonc: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", sh: "shell", zsh: "shell", bash: "shell", yml: "yaml", toml: "ini", md: "markdown", txt: "plaintext", log: "plaintext", csv: "plaintext", tsx: "typescript", htm: "html", h: "cpp", hpp: "cpp", cc: "cpp", rs: "rust", rb: "ruby", kt: "kotlin" };

export function languageFor(filename: string): string {
  const ext = extOf(filename);
  if (EXT_ALIAS[ext]) return EXT_ALIAS[ext];
  const found = monaco.languages.getLanguages().find((l) => l.extensions?.includes(`.${ext}`));
  return found?.id ?? "plaintext";
}

const MAX_CHARS = 1_000_000;

export interface CodeViewProps {
  text: string;
  filename: string;
  /** 값이 바뀔 때마다 Monaco 찾기 위젯을 연다(툴바 찾기 버튼). */
  findSignal: number;
}

export default function CodeView({ text, filename, findSignal }: CodeViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const theme = useAppTheme();
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const truncated = text.length > MAX_CHARS;
  const value = truncated ? text.slice(0, MAX_CHARS) : text;
  const lang = languageFor(filename);

  useEffect(() => {
    if (!host.current) return;
    const ed = monaco.editor.create(host.current, {
      value,
      language: lang,
      theme: theme === "dark" ? "tk-ink-dark" : "tk-ink-light",
      readOnly: true,
      domReadOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--tk-font-family-mono").trim() || "monospace",
      fontSize: 14,
      lineNumbers: "on",
      renderLineHighlight: "none",
      wordWrap: "off",
      ariaLabel: `${filename} 코드`,
    });
    editor.current = ed;
    return () => {
      ed.getModel()?.dispose();
      ed.dispose();
      editor.current = null;
    };
    // 테마·줄 바꿈은 아래 effect 가 인스턴스를 유지한 채 바꾼다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, lang, filename]);

  useEffect(() => {
    monaco.editor.setTheme(theme === "dark" ? "tk-ink-dark" : "tk-ink-light");
  }, [theme]);
  useEffect(() => {
    editor.current?.updateOptions({ wordWrap: wrap ? "on" : "off" });
  }, [wrap]);
  useEffect(() => {
    if (findSignal > 0) {
      editor.current?.focus();
      void editor.current?.getAction("actions.find")?.run();
    }
  }, [findSignal]);

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
    <figure className="tk-code tk-code--viewer">
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
      {truncated && <p className="tk-viewer__notice tk-viewer__notice--warning"><Icon name="warning" /><span>큰 파일이라 처음 1,000,000자만 보여 드려요. 전체는 원본을 받아 보세요.</span></p>}
      <div className="tk-code__monaco" ref={host} />
    </figure>
  );
}
