import { useMemo, useState } from "react";
import { read, utils } from "xlsx";
import { Icon } from "../../../ui/Icon";

export const MAX_ROWS = 1000;

export interface ParsedSheet {
  name: string;
  rows: (string | number | boolean | null)[][];
  totalRows: number;
  cols: number;
}

export function parseWorkbook(buf: ArrayBuffer, filename = ""): ParsedSheet[] {
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  // CSV 는 바이트로 읽으면 UTF-8 한글이 깨지는 코드페이지 추정이 끼어들어 문자열로 먼저 디코딩한다.
  const wb =
    ext === "csv" || ext === "tsv"
      ? read(new TextDecoder("utf-8").decode(buf), { type: "string", FS: ext === "tsv" ? "\t" : undefined, sheetRows: MAX_ROWS + 1000 })
      : read(buf, { type: "array", sheetRows: MAX_ROWS + 1000 });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const all = utils.sheet_to_json<(string | number | boolean | null)[]>(ws, { header: 1, blankrows: false, defval: null });
    const cols = all.reduce((m, r) => Math.max(m, r.length), 0);
    return { name, rows: all.slice(0, MAX_ROWS), totalRows: all.length, cols };
  });
}

const colName = (i: number): string => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

export default function SheetView({ buffer, filename, onDownload }: { buffer: ArrayBuffer; filename: string; onDownload?: () => void }) {
  const parsed = useMemo(() => {
    try {
      return { sheets: parseWorkbook(buffer, filename), error: null as string | null };
    } catch (e) {
      return { sheets: [] as ParsedSheet[], error: e instanceof Error ? e.message : String(e) };
    }
  }, [buffer, filename]);
  const [active, setActive] = useState(0);
  if (parsed.error || parsed.sheets.length === 0) {
    return (
      <div className="tk-viewer__state" data-state="failed" role="status">
        <p className="tk-viewer__state-title">표를 읽지 못했어요</p>
        <p>파일 형식이 깨졌거나 지원하지 않는 서식이에요. 원본을 받아 열어 보세요.</p>
        {parsed.error && <p><code>{parsed.error}</code></p>}
      </div>
    );
  }
  const sheet = parsed.sheets[Math.min(active, parsed.sheets.length - 1)];
  const partial = sheet.totalRows > MAX_ROWS;
  return (
    <div className="tk-cells-view">
      {partial && (
        <div className="tk-viewer__notice tk-viewer__notice--warning" role="status">
          <Icon name="warning" />
          <p>
            처음 {MAX_ROWS.toLocaleString()}행만 보여드려요. 이 시트는 그보다 길어요.{" "}
            {onDownload && <button className="tk-link" type="button" onClick={onDownload}>원본 받기</button>}
          </p>
        </div>
      )}
      <div className="tk-viewer__body" tabIndex={0} role="region" aria-label={`시트 ${sheet.name}`}>
        <table className="tk-cells">
          <thead>
            <tr>
              <th scope="col"><span className="tk-sr-only">행</span></th>
              {Array.from({ length: sheet.cols }, (_, c) => <th key={c} scope="col">{colName(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r} className={r === 0 ? "tk-cells__header" : undefined}>
                <th scope="row">{r + 1}</th>
                {Array.from({ length: sheet.cols }, (_, c) => {
                  const v = row[c];
                  const type = v === null || v === undefined || v === "" ? "empty" : typeof v === "number" ? "number" : undefined;
                  return <td key={c} data-type={type}>{v === null || v === undefined ? "" : String(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {parsed.sheets.length > 1 && (
        <div className="tk-cells__tabs" role="tablist" aria-label={`${filename} 시트`}>
          {parsed.sheets.map((s, i) => (
            <button key={s.name} role="tab" type="button" aria-selected={i === active} onClick={() => setActive(i)}>{s.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}
