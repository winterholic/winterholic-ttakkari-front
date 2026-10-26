import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button, IconButton } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';
import { Icon } from '../../../ui/Icon';
import { useMediaQuery } from '../../../shell/useMediaQuery';
import { errorText, listMethods } from '../api';
import { MethodCard } from '../components/MethodCard';
import { CatalogReview } from '../components/CatalogReview';
import { MethodDetailDialog } from '../components/MethodDetailDialog';
import { activeCount, FILTER_KEYS, MethodFilters, readQuery, URL_KEY, type FilterKey } from '../components/MethodFilters';
import { MethodFormModal } from '../components/MethodFormModal';
import { Callout, Empty } from '../components/parts';
import type { ResearchCtx } from '../context';
import { useTaxonomy, rk } from '../hooks';
import { AXIS_LABEL, EXECUTION, LIFECYCLE } from '../labels';

/** 방법론 라이브러리: 텍스트 검색 + 축별 다중 필터 + facet 건수. 50개씩 서버에서 받아 "더 보기"로 늘린다(수백 개에서도 첫 화면이 빠르다). */
export function MethodLibraryView({ ctx }: { ctx: ResearchCtx }) {
  const { taxonomy, label } = useTaxonomy();
  const query = useMemo(() => readQuery(ctx.params), [ctx.params]);
  const wide = useMediaQuery('(min-width: 72rem)');
  const [drawer, setDrawer] = useState(false);
  // 입력 중인 글자(draft)는 바로 보이고, 멈춘 뒤에만 URL 질의로 보낸다. draft 가 없으면 URL 값을 그대로 쓴다.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? query.q ?? '';
  const [creating, setCreating] = useState(ctx.params.get('method') === 'new');

  const go = ctx.go;
  useEffect(() => {
    if (draft === null) return;
    const t = window.setTimeout(() => { go({ q: draft || null }, { replace: true }); setDraft(null); }, 250);
    return () => window.clearTimeout(t);
  }, [draft, go]);

  const result = useInfiniteQuery({
    queryKey: [...rk(), 'methods', query],
    queryFn: ({ pageParam }) => listMethods(query, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => { const loaded = all.reduce((n, p) => n + p.items.length, 0); return loaded < last.total ? loaded : undefined; },
    placeholderData: prev => prev,
  });
  const pages = result.data?.pages ?? [];
  const items = pages.flatMap(p => p.items);
  const total = pages[0]?.total ?? 0;
  const facets = pages[0]?.facets ?? {};
  const n = activeCount(query);
  const multi = FILTER_KEYS.some(k => ((query[k] as string[] | undefined) ?? []).length > 1);

  const toggle = (key: FilterKey, code: string) => {
    const cur = (query[key] as string[] | undefined) ?? [];
    const next = cur.includes(code) ? cur.filter(c => c !== code) : [...cur, code];
    ctx.go({ [URL_KEY[key]]: next.length ? next.join(',') : null }, { replace: true });
  };
  const clear = () => ctx.go(Object.fromEntries([...FILTER_KEYS.map(k => [URL_KEY[k], null] as const), ['q', null] as const]), { replace: true });
  const optionLabel = (key: FilterKey, code: string) => key === 'execution_status' ? EXECUTION[code as keyof typeof EXECUTION]?.label ?? code : key === 'lifecycle_status' ? LIFECYCLE[code as keyof typeof LIFECYCLE]?.label ?? code : label(key, code);
  const panel = <MethodFilters query={query} facets={facets} taxonomy={taxonomy} labelOf={label} onToggle={toggle} onClear={clear} />;
  const slug = ctx.methodSlug && ctx.methodSlug !== 'new' ? ctx.methodSlug : null;

  return <div className="rs-lib">
    {wide && <aside className="rs-lib__aside" aria-label="필터">{panel}</aside>}
    <div className="rs-lib__main">
      <div className="tk-filterbar rs-lib__bar" role="search">
        <div className="tk-filterbar__row">
          <span className="tk-input-wrap"><Icon name="search" />
            <input className="tk-input" type="search" aria-label="방법론 검색" placeholder="이름·요약·태그로 검색 (예: KV 캐시, 정규화, rerank)" value={text} onChange={e => setDraft(e.target.value)} /></span>
          {!wide && <Button onClick={() => setDrawer(true)} aria-label={`필터 열기${n ? `, ${n}개 선택됨` : ''}`}><Icon name="filter" />필터{n > 0 ? ` ${n}` : ''}</Button>}
          <Button variant="primary" onClick={() => setCreating(true)}><Icon name="plus" />새 방법·가설</Button>
        </div>
        {n > 0 && <div className="tk-chips tk-chips--wrap rs-lib__active" role="group" aria-label="적용된 필터">
          {FILTER_KEYS.flatMap(key => ((query[key] as string[] | undefined) ?? []).map(code => <button key={`${key}-${code}`} type="button" className="tk-chip" aria-pressed="true" onClick={() => toggle(key, code)} title="누르면 해제합니다">
            {AXIS_LABEL[key as keyof typeof AXIS_LABEL] ?? '수명'}: {optionLabel(key, code)} ✕</button>))}
          <button type="button" className="tk-chip" onClick={clear}>모두 해제</button>
        </div>}
        <p className="tk-filterbar__count" role="status">{result.isPending ? '불러오는 중…' : `방법 ${total.toLocaleString('ko-KR')}개 중 ${items.length.toLocaleString('ko-KR')}개 표시`}{result.isFetching && !result.isPending ? ' · 갱신 중' : ''}</p>
      </div>

      <CatalogReview studyId={ctx.studyId} query={query.q ?? ''} onMethod={s => ctx.go({ method: s })}
        onFailure={(study, experiment, run) => ctx.go({ view: 'analysis', study, experiment, run, method: null })} />
      {result.error && <Callout kind="caution">{errorText(result.error)} <Button size="sm" onClick={() => void result.refetch()}>다시 불러오기</Button></Callout>}
      {result.isPending && <div className="rs-cards" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <div key={i} className="tk-skeleton tk-skeleton--block rs-skeleton rs-skeleton--card" />)}</div>}
      {!result.isPending && !result.error && !items.length && <Empty title={n || query.q ? '조건에 맞는 방법이 없습니다' : '등록된 방법이 없습니다'}
        action={n || query.q ? <Button onClick={clear}>필터 모두 해제</Button> : <Button variant="primary" onClick={() => setCreating(true)}>첫 방법·가설 등록</Button>}>
        {n || query.q ? (multi ? '한 축에서 여러 값을 고른 결과가 비었습니다. 서버가 한 축의 여러 값 선택(OR)을 지원하지 않는 버전이면 이렇게 보일 수 있으니, 축마다 값을 하나만 골라 보세요. ' : '') + '필터를 줄이거나 검색어를 바꿔 보세요. 없는 아이디어는 새 가설로 등록할 수 있습니다.' : '카탈로그가 비어 있습니다. 서버의 카탈로그 동기화를 확인하거나 직접 등록하세요.'}</Empty>}
      <div className="rs-cards">{items.map(m => <MethodCard key={m.id} method={m} labelOf={label} selected={slug === m.slug} onOpen={() => ctx.go({ method: m.slug })} />)}</div>
      {result.hasNextPage && <div className="rs-more"><Button onClick={() => void result.fetchNextPage()} busy={result.isFetchingNextPage}>더 보기 ({(total - items.length).toLocaleString('ko-KR')}개 남음)</Button></div>}
    </div>

    {!wide && drawer && <Dialog kind="drawer" id="lib-filters" label="방법론 필터" open onClose={() => setDrawer(false)}>
      <div className="tk-drawer__header"><strong className="rs-drawer-title">필터 · {total.toLocaleString('ko-KR')}개</strong><IconButton aria-label="닫기" onClick={() => setDrawer(false)}><Icon name="x" /></IconButton></div>
      <div className="tk-drawer__body rs-drawer-body"><MethodFilters query={query} facets={facets} taxonomy={taxonomy} labelOf={label} onToggle={toggle} onClear={clear} hideTitle /></div>
      <div className="rs-drawer-foot"><Button variant="primary" block onClick={() => setDrawer(false)}>{total.toLocaleString('ko-KR')}개 방법 보기</Button></div>
    </Dialog>}
    {slug && <MethodDetailDialog slug={slug} onClose={() => ctx.go({ method: null })} onOpenMethod={s => ctx.go({ method: s })}
      onDesign={s => ctx.go({ view: 'designer', method: s })} onOpenExperiment={(studyId, id) => ctx.go({ view: 'analysis', method: null, experiment: id, ...(studyId ? { study: studyId } : {}) })} />}
    {creating && <MethodFormModal open studyId={ctx.studyId} onClose={() => { setCreating(false); if (ctx.params.get('method') === 'new') ctx.go({ method: null }, { replace: true }); }}
      onDesign={m => { setCreating(false); ctx.go({ view: 'designer', method: m.slug }); }} />}
  </div>;
}
