import { Button, IconButton } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { DEFAULT_SETTINGS } from './settings';
import type { CmdKey, CursorSize, PointerMode, RemoteSettings } from './settings';

interface Props {
  settings: RemoteSettings;
  onChange: (patch: Partial<RemoteSettings>) => void;
  onClose: () => void;
  canFullscreen: boolean;
  onFullscreen: () => void;
  macClipboard: string;
  onCopyMacClipboard: () => void;
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return <div className="remote-setting" role="group" aria-label={label}>
    <span className="remote-setting__label">{label}</span>
    <div className="remote-segmented">{options.map(([v, text]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>)}</div>
  </div>;
}
function Range({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return <label className="remote-setting">
    <span className="remote-setting__label">{label}<output>{format(value)}</output></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
  </label>;
}
function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="remote-setting remote-setting--toggle">
    <span className="remote-setting__label">{label}{hint && <small>{hint}</small>}</span>
    <input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} />
  </label>;
}

export function SettingsSheet({ settings, onChange, onClose, canFullscreen, onFullscreen, macClipboard, onCopyMacClipboard }: Props) {
  return <div className="remote-sheet" role="dialog" aria-label="원격 화면 설정">
    <div className="remote-sheet__header"><strong>설정</strong><IconButton aria-label="설정 닫기" onClick={onClose}><Icon name="x" /></IconButton></div>
    <div className="remote-sheet__body">
      <Segmented<PointerMode> label="손가락 조작 방식" value={settings.mode} options={[['trackpad', '트랙패드'], ['touch', '직접 터치']]} onChange={mode => onChange({ mode })} />
      <p className="remote-sheet__hint">{settings.mode === 'trackpad' ? '화면을 끌면 커서가 상대적으로 움직이고, 탭하면 커서 위치를 클릭합니다.' : '탭한 곳을 바로 클릭하고, 한 손가락으로 끌면 화면이 이동합니다. 길게 누르면 드래그합니다.'}</p>
      <Segmented<CursorSize> label="커서 크기" value={settings.cursorSize} options={[['s', '작게'], ['m', '보통'], ['l', '크게']]} onChange={cursorSize => onChange({ cursorSize })} />
      <Range label="커서 감도" value={settings.sensitivity} min={.5} max={3} step={.1} format={v => `${v.toFixed(1)}배`} onChange={sensitivity => onChange({ sensitivity })} />
      <Range label="스크롤 속도" value={settings.scrollSpeed} min={.5} max={2.5} step={.1} format={v => `${v.toFixed(1)}배`} onChange={scrollSpeed => onChange({ scrollSpeed })} />
      <Toggle label="스크롤 방향 반대로" hint="두 손가락을 내릴 때 Mac 화면이 반대로 움직이면 켜세요." checked={settings.scrollReverse} onChange={scrollReverse => onChange({ scrollReverse })} />
      <h3>게임패드</h3>
      <Toggle label="게임패드 표시" hint="조이스틱·클릭·스크롤 버튼을 화면 위에 띄웁니다." checked={settings.pad} onChange={pad => onChange({ pad })} />
      <Toggle label="왼손잡이 배치" hint="조이스틱을 오른쪽, 버튼을 왼쪽에 둡니다." checked={settings.padLeftHanded} onChange={padLeftHanded => onChange({ padLeftHanded })} />
      <Range label="패드 투명도" value={settings.padOpacity} min={.25} max={1} step={.05} format={v => `${Math.round(v * 100)}%`} onChange={padOpacity => onChange({ padOpacity })} />
      <Range label="패드 크기" value={settings.padScale} min={.8} max={1.3} step={.05} format={v => `${Math.round(v * 100)}%`} onChange={padScale => onChange({ padScale })} />
      <h3>화면과 키보드</h3>
      <Toggle label="도구 자동 숨김" hint="가만히 있으면 위쪽 도구 줄을 숨깁니다." checked={settings.autoHide} onChange={autoHide => onChange({ autoHide })} />
      <label className="remote-setting">
        <span className="remote-setting__label">⌘ 키 호환<small>⌘ 단축키가 Mac에서 먹지 않으면 다른 값을 고르세요.</small></span>
        <select value={settings.cmdKey} onChange={e => onChange({ cmdKey: e.target.value as CmdKey })}>
          <option value="meta">Meta (기본)</option><option value="super">Super</option><option value="alt">Alt 와 맞바꿈</option>
        </select>
      </label>
      {canFullscreen ? <Button onClick={onFullscreen}>전체 화면 전환</Button> : <p className="remote-sheet__hint">아이폰 Safari는 전체 화면 API가 없습니다. 공유 버튼에서 홈 화면에 추가하면 주소창 없이 쓸 수 있습니다.</p>}
      {macClipboard && <details><summary>Mac에서 복사한 글</summary><textarea readOnly value={macClipboard} aria-label="Mac에서 복사한 글" /><Button onClick={onCopyMacClipboard}>이 기기에 복사</Button></details>}
      <details>
        <summary>조작 방법</summary>
        <ul className="remote-sheet__howto">
          <li>한 손가락 끌기: 커서 이동 (빠를수록 멀리 갑니다)</li>
          <li>탭: 클릭 · 두 번 빠르게 탭: 더블클릭</li>
          <li>두 손가락 탭: 우클릭</li>
          <li>두 손가락 위아래·좌우 끌기: 스크롤</li>
          <li>두 손가락 벌리기·모으기: 확대·축소 (확대하면 커서를 따라 화면이 움직입니다)</li>
          <li>길게 누른 채 끌기, 또는 탭 직후 바로 눌러 끌기: 드래그</li>
          <li>게임패드의 L을 누른 채 조이스틱을 밀면 드래그, 드래그 잠금은 버튼을 뗀 채 유지합니다</li>
          <li>⌘ ⌥ ⌃ ⇧ 키: 한 번 탭하면 다음 키·클릭에만, 두 번 탭하면 고정, 세 번 탭하면 해제</li>
        </ul>
      </details>
      <Button onClick={() => onChange({ ...DEFAULT_SETTINGS })}>설정 초기화</Button>
    </div>
  </div>;
}
