import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../../ui/Button';
import { listMethods } from '../api';
import { rk } from '../hooks';
import type { MethodDetail } from '../types';
import { ExecutionStatusBadge } from './ExecutionStatusBadge';

interface Props { selected: MethodDetail[]; loading?: boolean; onAdd: (slug: string) => void; onRemove: (id: string) => void; onPrimary: (id: string) => void }

/** 방법 복수 선택. 첫 번째가 주 방법이고, 나머지는 비교·조합 대상이다. */
export function MethodPicker({ selected, loading, onAdd, onRemove, onPrimary }: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: [...rk(), 'picker', text], queryFn: () => listMethods({ q: text }, 0, 8), enabled: open, staleTime: 30_000 });
  const ids = new Set(selected.map(m => m.id));
  return <div className="rs-picker">
    <ul className="rs-picker__selected" aria-label="선택한 방법">
      {selected.map((m, i) => <li key={m.id}>
        <div><strong>{m.name_ko || m.name}</strong> <span className="rs-tag">{i === 0 ? '주 방법' : '비교·조합'}</span> <ExecutionStatusBadge status={m.execution_status} reason={m.unavailable_reason} /></div>
        {m.unavailable_reason && <p className="rs-reason">{m.unavailable_reason}</p>}
        <div className="rs-actions">{i > 0 && <Button size="xs" variant="ghost" onClick={() => onPrimary(m.id)}>주 방법으로</Button>}<Button size="xs" variant="ghost" onClick={() => onRemove(m.id)} aria-label={`${m.name_ko || m.name} 빼기`}>빼기</Button></div>
      </li>)}
      {loading && <li className="rs-muted">방법을 불러오는 중…</li>}
      {!selected.length && !loading && <li className="rs-muted">아직 고른 방법이 없습니다. 아래에서 찾거나 방법론 탭에서 ‘이 방법으로 실험 설계’를 누르세요.</li>}
    </ul>
    <div className="tk-field"><label className="tk-label" htmlFor="picker-q">방법 추가</label>
      <input id="picker-q" className="tk-input" type="search" placeholder="이름으로 검색해 추가" value={text} onFocus={() => setOpen(true)} onChange={e => { setText(e.target.value); setOpen(true); }} /></div>
    {open && <ul className="rs-picker__results" aria-label="검색 결과">
      {q.isPending && <li className="rs-muted">찾는 중…</li>}
      {q.data?.items.map(m => <li key={m.id}>
        <div><strong>{m.name_ko || m.name}</strong> <ExecutionStatusBadge status={m.execution_status} /><p className="rs-muted">{m.summary}</p></div>
        <Button size="sm" disabled={ids.has(m.id)} onClick={() => onAdd(m.slug)}>{ids.has(m.id) ? '선택됨' : '추가'}</Button></li>)}
      {q.data && !q.data.items.length && <li className="rs-muted">검색 결과가 없습니다.</li>}
    </ul>}
  </div>;
}
