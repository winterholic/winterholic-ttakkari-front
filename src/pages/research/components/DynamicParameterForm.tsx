import { useId, useState } from 'react';
import { Select } from '../../../ui/Select';
import { Badge } from '../../../ui/Badge';
import type { ParamSpec } from '../types';
import { Chip } from './parts';

export interface ParamState { values: Record<string, unknown>; sweeps: Record<string, unknown[]> }

export const emptyParamState: ParamState = { values: {}, sweeps: {} };

/** 스키마의 기본값으로 시작하는 값. 기본값이 없는 항목은 비워 두고 서버 기본값에 맡긴다. */
export function defaultValues(specs: ParamSpec[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of specs) if (s.default !== undefined && s.default !== null) out[s.key] = s.default;
  return out;
}

/** "0.1, 0.5, 1:3:1" → [0.1, 0.5, 1, 2, 3]. a:b:step 은 양끝을 포함한다. 최대 50개. */
export function parseSweepNumbers(text: string, integer: boolean): number[] {
  const out: number[] = [];
  for (const raw of text.split(/[,\s]+/).filter(Boolean)) {
    const range = raw.match(/^(-?\d*\.?\d+):(-?\d*\.?\d+):(\d*\.?\d+)$/);
    if (range) {
      const [a, b, step] = [Number(range[1]), Number(range[2]), Number(range[3])];
      if (step > 0 && b >= a) for (let v = a; v <= b + step * 1e-9 && out.length < 50; v += step) out.push(Number(v.toPrecision(12)));
      continue;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) out.push(integer ? Math.round(n) : n);
  }
  return [...new Set(out)].slice(0, 50);
}

/** 값 하나의 오류 문구. 비어 있고 필수가 아니면 오류가 아니다. */
export function paramError(spec: ParamSpec, value: unknown): string | null {
  const blank = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  if (blank) return spec.required ? '필수 항목입니다' : null;
  if (spec.type === 'number' || spec.type === 'integer') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '숫자를 입력하세요';
    if (spec.type === 'integer' && !Number.isInteger(n)) return '정수만 입력할 수 있습니다';
    if (spec.min !== null && spec.min !== undefined && n < spec.min) return `${spec.min} 이상이어야 합니다`;
    if (spec.max !== null && spec.max !== undefined && n > spec.max) return `${spec.max} 이하여야 합니다`;
  }
  if (spec.type === 'range') {
    const [lo, hi] = Array.isArray(value) ? value : [];
    if (lo === undefined || hi === undefined || lo === '' || hi === '') return '시작과 끝을 모두 입력하세요';
    if (Number(lo) > Number(hi)) return '시작이 끝보다 클 수 없습니다';
  }
  if (spec.type === 'text' && typeof value === 'string' && value.trim().startsWith('{')) {
    try { JSON.parse(value); } catch { return 'JSON 사전 형식이 올바르지 않습니다'; }
  }
  return null;
}

/** 폼 상태 → 서버 search_space. 탐색 후보가 있으면 배열, 없으면 고정값. */
export function buildSearchSpace(specs: ParamSpec[], state: ParamState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of specs) {
    const sweep = state.sweeps[s.key];
    if (sweep && sweep.length) { out[s.key] = sweep; continue; }
    const v = state.values[s.key];
    if (v === undefined || v === null || v === '') continue;
    if (s.type === 'text' && typeof v === 'string' && v.trim().startsWith('{')) { try { out[s.key] = JSON.parse(v); continue; } catch { continue; } }
    out[s.key] = s.type === 'integer' || s.type === 'number' ? Number(v) : v;
  }
  return out;
}

interface Props {
  specs: ParamSpec[]; state: ParamState; onChange: (next: ParamState) => void;
  sweepEnabled: boolean; supported?: string[]; owners?: Record<string, string>; idPrefix?: string;
}

export function DynamicParameterForm({ specs, state, onChange, sweepEnabled, supported, owners, idPrefix = 'p' }: Props) {
  const basic = specs.filter(s => !s.advanced);
  const advanced = specs.filter(s => s.advanced);
  const set = (key: string, value: unknown) => onChange({ ...state, values: { ...state.values, [key]: value } });
  const setSweep = (key: string, list: unknown[] | null) => {
    const sweeps = { ...state.sweeps };
    if (list === null) delete sweeps[key]; else sweeps[key] = list;
    onChange({ ...state, sweeps });
  };
  const render = (s: ParamSpec) => <ParamField key={s.key} spec={s} id={`${idPrefix}-${s.key}`} value={state.values[s.key]} sweep={state.sweeps[s.key]}
    onValue={v => set(s.key, v)} onSweep={l => setSweep(s.key, l)} sweepEnabled={sweepEnabled && s.sweepable !== false}
    unsupported={!!supported && !supported.includes(s.key)} owner={owners?.[s.key]} />;
  if (!specs.length) return <p className="rs-muted">선택한 방법에 조정할 파라미터가 정의되어 있지 않습니다. 실험 입력만 정하면 됩니다.</p>;
  return <div className="rs-params">
    <div className="rs-params__grid">{basic.map(render)}</div>
    {advanced.length > 0 && <details className="rs-advanced"><summary>고급 파라미터 {advanced.length}개</summary><div className="rs-params__grid">{advanced.map(render)}</div></details>}
  </div>;
}

interface FieldProps {
  spec: ParamSpec; id: string; value: unknown; sweep?: unknown[]; onValue: (v: unknown) => void; onSweep: (l: unknown[] | null) => void;
  sweepEnabled: boolean; unsupported: boolean; owner?: string;
}

function ParamField({ spec, id, value, sweep, onValue, onSweep, sweepEnabled, unsupported, owner }: FieldProps) {
  const err = sweep ? null : paramError(spec, value);
  const helpId = `${id}-help`;
  const sweeping = !!sweep;
  const canSweep = sweepEnabled && ['number', 'integer', 'enum', 'boolean', 'model', 'dataset', 'environment', 'range', 'text'].includes(spec.type);
  const toggle = () => {
    if (sweeping) { onSweep(null); return; }
    if (spec.type === 'boolean') onSweep([true, false]);
    else if (spec.options?.length) onSweep(spec.options.slice(0, 2));
    else onSweep(value !== undefined && value !== '' ? [value] : []);
  };
  return <div className="rs-param" data-wide={spec.type === 'text' || spec.type === 'multi_enum' || sweeping ? 'true' : undefined}>
    <div className="rs-param__head">
      <label className="tk-label" htmlFor={id}>{spec.label}{spec.unit && <span className="rs-muted"> ({spec.unit})</span>}{spec.required && <span aria-hidden="true"> *</span>}</label>
      {canSweep && <button type="button" className="tk-chip rs-param__sweep" aria-pressed={sweeping} onClick={toggle}>값 여러 개 탐색</button>}
    </div>
    {sweeping ? <SweepInput spec={spec} id={id} sweep={sweep} onSweep={onSweep} /> : <ValueInput spec={spec} id={id} value={value} onValue={onValue} invalid={!!err} describedBy={helpId} />}
    <p className={err ? 'tk-error' : 'tk-help'} id={helpId}>
      {err ?? (spec.description || rangeHint(spec))}
      {unsupported && <> <Badge tone="warning">이 실행기는 사용하지 않음</Badge></>}
      {owner && <span className="rs-muted"> · {owner}</span>}
    </p>
  </div>;
}

const optionLabel = (spec: ParamSpec, o: string) => spec.option_labels?.[o] ?? o;

function rangeHint(s: ParamSpec) {
  if ((s.type === 'number' || s.type === 'integer') && (s.min != null || s.max != null)) return `${s.min ?? '−∞'} ~ ${s.max ?? '∞'}${s.unit ? ` ${s.unit}` : ''}`;
  return '';
}

function ValueInput({ spec, id, value, onValue, invalid, describedBy }: { spec: ParamSpec; id: string; value: unknown; onValue: (v: unknown) => void; invalid: boolean; describedBy: string }) {
  const options = spec.options ?? [];
  switch (spec.type) {
    case 'number':
    case 'integer':
      return <input id={id} className="tk-input" type="number" inputMode="decimal" value={value === undefined || value === null ? '' : String(value)} min={spec.min ?? undefined} max={spec.max ?? undefined}
        step={spec.step ?? (spec.type === 'integer' ? 1 : 'any')} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        onChange={e => onValue(e.target.value === '' ? undefined : Number(e.target.value))} />;
    case 'range': {
      const [lo, hi] = Array.isArray(value) ? (value as unknown[]) : [undefined, undefined];
      const cell = (i: 0 | 1, label: string) => <input className="tk-input" type="number" inputMode="decimal" step={spec.step ?? 'any'} aria-label={`${spec.label} ${label}`} aria-invalid={invalid || undefined}
        value={(i === 0 ? lo : hi) === undefined || (i === 0 ? lo : hi) === null ? '' : String(i === 0 ? lo : hi)}
        onChange={e => { const next = [lo, hi]; next[i] = e.target.value === '' ? undefined : Number(e.target.value); onValue(next); }} />;
      return <div className="rs-range" id={id} role="group" aria-label={spec.label} aria-describedby={describedBy}>{cell(0, '시작')}<span aria-hidden="true">~</span>{cell(1, '끝')}</div>;
    }
    case 'boolean':
      return <label className="tk-switch tk-switch--row rs-switch"><input id={id} type="checkbox" role="switch" checked={value === true} onChange={e => onValue(e.target.checked)} aria-describedby={describedBy} />{value === true ? '켬' : '끔'}</label>;
    case 'multi_enum': {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      return <div className="tk-chips tk-chips--wrap" id={id} role="group" aria-label={spec.label}>{options.map(o => <Chip key={o} pressed={picked.includes(o)} onClick={() => onValue(picked.includes(o) ? picked.filter(x => x !== o) : [...picked, o])}>{optionLabel(spec, o)}</Chip>)}</div>;
    }
    case 'enum':
    case 'model':
    case 'dataset':
    case 'environment':
      if (options.length) {
        const cur = value === undefined || value === null || value === '' ? '' : String(value);
        const opts = [{ value: '', label: spec.required ? '선택하세요' : '서버 기본값' }, ...options.map(o => ({ value: o, label: optionLabel(spec, o) }))];
        return <Select id={id} value={cur} options={opts} onChange={v => onValue(v === '' ? undefined : v)} invalid={invalid} describedBy={describedBy} />;
      }
      return <input id={id} className="tk-input" type="text" value={value === undefined || value === null ? '' : String(value)} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        placeholder={spec.type === 'dataset' ? '데이터셋·코퍼스 이름' : spec.type === 'model' ? '모델 별칭' : '값'} onChange={e => onValue(e.target.value || undefined)} />;
    case 'file':
      return <input id={id} className="tk-input tk-input--mono" type="text" value={value === undefined || value === null ? '' : String(value)} aria-describedby={describedBy}
        placeholder="파일 보관함 파일 ID" onChange={e => onValue(e.target.value || undefined)} />;
    default:
      return <textarea id={id} className="tk-textarea tk-input--mono" rows={3} value={value === undefined || value === null ? '' : String(value)} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        placeholder="문자열 또는 JSON 사전 {&quot;API&quot;: &quot;에이피아이&quot;}" onChange={e => onValue(e.target.value || undefined)} />;
  }
}

function SweepInput({ spec, id, sweep, onSweep }: { spec: ParamSpec; id: string; sweep: unknown[] | undefined; onSweep: (l: unknown[] | null) => void }) {
  const textId = useId();
  const [draft, setDraft] = useState(() => (sweep ?? []).join(', '));
  const list = sweep ?? [];
  const options = spec.type === 'boolean' ? ['true', 'false'] : spec.options ?? [];
  if (spec.type === 'number' || spec.type === 'integer' || !options.length) {
    const numeric = spec.type === 'number' || spec.type === 'integer';
    return <div className="rs-sweep">
      <input id={id} className="tk-input" type="text" inputMode={numeric ? 'decimal' : 'text'} value={draft} aria-describedby={`${textId}-n`}
        placeholder={numeric ? '예: 0.1, 0.5, 1:3:1' : '값을 쉼표로 구분'}
        onChange={e => { setDraft(e.target.value); onSweep(numeric ? parseSweepNumbers(e.target.value, spec.type === 'integer') : e.target.value.split(',').map(x => x.trim()).filter(Boolean)); }} />
      <p className="tk-help" id={`${textId}-n`}>{list.length}개 후보{numeric ? ' · 시작:끝:간격 형식으로 구간을 한 번에 입력할 수 있습니다' : ''}</p>
    </div>;
  }
  const isPicked = (o: string) => list.some(x => String(x) === o);
  const conv = (o: string) => (spec.type === 'boolean' ? o === 'true' : o);
  return <div className="tk-chips tk-chips--wrap" id={id} role="group" aria-label={`${spec.label} 탐색 후보`}>
    {options.map(o => <Chip key={o} pressed={isPicked(o)} onClick={() => onSweep(isPicked(o) ? list.filter(x => String(x) !== o) : [...list, conv(o)])}>{optionLabel(spec, o)}</Chip>)}
  </div>;
}
