import { useRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import "./fileButton.css";

export interface FileButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** 고른 파일. 호출 뒤 input 값은 비워져 같은 파일을 다시 고를 수 있다 */
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  /** 버튼을 감싸는 상자(.tk-file-slot)에 더할 클래스 */
  slotClassName?: string;
}

/**
 * 파일 선택 input 을 투명하게 버튼 위에 같은 크기로 겹쳐 버튼과 같은 상자를 쓴다.
 * 모바일 OS 선택 UI가 input 좌표를 기준으로 배치되는 경우에도 버튼 위치와 일치시키려는 구성이다.
 * 파일을 고르는 곳은 이 컴포넌트를 쓴다(input[type=file] 에 hidden 금지: docs/22).
 */
export function FileButton({ onFiles, accept, multiple, slotClassName, type = "button", ...rest }: FileButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className={["tk-file-slot", slotClassName].filter(Boolean).join(" ")}>
      <button {...rest} type={type} onClick={() => input.current?.click()} />
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        tabIndex={-1}
        aria-hidden="true"
        disabled={rest.disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </span>
  );
}
