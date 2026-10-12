import { useId, useRef, useState } from "react";
import { Icon } from "../../ui/Icon";
import { readTextFile } from "./shared";

/**
 * 전사 텍스트 입력: 붙여넣기 또는 텍스트 파일 불러오기. 새 회의록과 상세(전사 전)가 같이 쓴다.
 * 어디서 온 텍스트인지(paste | file)는 서버에 같이 보낸다.
 */
export function TranscriptField({ value, onChange, onSource, rows = 10, disabled }: {
  value: string;
  onChange: (text: string) => void;
  onSource: (source: "paste" | "file") => void;
  rows?: number;
  disabled?: boolean;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      onChange(await readTextFile(file));
      onSource("file");
    } catch {
      setFileError("파일을 읽지 못했어요. 텍스트 파일(.txt, .md)인지 확인해 주세요.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="tk-field">
      <label className="tk-label" htmlFor={id}>전사 텍스트</label>
      <textarea
        id={id}
        className="tk-textarea"
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder="클로바노트 등에서 받은 전사를 붙여 넣으세요. 화자 구분이 있으면 그대로 두면 돼요."
        onChange={(e) => {
          onChange(e.target.value);
          onSource("paste");
        }}
      />
      <div className="mt-field-row">
        <input ref={fileRef} type="file" accept=".txt,.md,.text,text/plain,text/markdown" hidden onChange={(e) => void load(e.target.files?.[0])} />
        <button className="tk-button tk-button--sm" type="button" disabled={disabled} onClick={() => fileRef.current?.click()}>
          <Icon name="file-text" />텍스트 파일 불러오기
        </button>
        <span className="mt-count">{value.length.toLocaleString("ko-KR")}자</span>
      </div>
      {fileError && <p className="tk-error" role="alert">{fileError}</p>}
    </div>
  );
}
