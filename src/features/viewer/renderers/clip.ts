/** 뷰어가 한 번에 그리는 한도. 휴대폰에서 줄마다 요소가 생기므로 글자 수와 줄 수를 둘 다 막는다. */
export const MAX_CHARS = 500_000;
export const MAX_LINES = 8_000;

export interface Clip {
  /** 화면에 그릴 글. 줄 끝은 \n 하나로 맞췄고 마지막 개행 뒤 빈 줄은 뺐다. */
  value: string;
  lines: number;
  cut: "chars" | "lines" | null;
  /** 줄 수 한도로 잘렸을 때만 원본의 전체 줄 수. */
  totalLines?: number;
}

const normalize = (s: string): string => s.replace(/\r\n?/g, "\n");
const countLines = (s: string): number => {
  const body = s.endsWith("\n") ? s.slice(0, -1) : s;
  return s === "" ? 0 : body.split("\n").length;
};

/** 보여 줄 만큼만 앞에서 자른다. 복사·다운로드는 원문을 쓰므로 화면에만 적용한다. */
export function clipForView(text: string, maxChars = MAX_CHARS, maxLines = MAX_LINES): Clip {
  let value = normalize(text);
  let cut: Clip["cut"] = null;
  if (value.length > maxChars) {
    value = value.slice(0, maxChars);
    cut = "chars";
  }
  const lines = countLines(value);
  if (lines > maxLines) {
    // 글자 한도에 먼저 걸렸으면 전체 줄 수는 원본에서 센다.
    const totalLines = cut ? countLines(normalize(text)) : lines;
    value = value.split("\n").slice(0, maxLines).join("\n");
    return { value, lines: maxLines, cut: "lines", totalLines };
  }
  if (value.endsWith("\n")) value = value.slice(0, -1);
  return { value, lines, cut };
}
