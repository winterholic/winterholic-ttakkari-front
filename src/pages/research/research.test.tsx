import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DynamicParameterForm, buildSearchSpace, emptyParamState, paramError, parseSweepNumbers, type ParamState } from './components/DynamicParameterForm';
import { ValidatePanel } from './components/ValidatePanel';
import { DeltaBarChart } from './charts/DeltaBarChart';
import { RepeatDistributionPlot } from './charts/RepeatDistributionPlot';
import { ParetoScatterPlot } from './charts/ParetoScatterPlot';
import { MetricComparisonBar } from './charts/MetricComparisonBar';
import { SweepLineChart } from './charts/SweepLineChart';
import { calls, cfgs, defaultHandler, experiment, mount, runs, runMeasurements, setup, study, validateOk } from './testkit';
import { promotionNotice } from './format';
import { deriveSeries, narrate, paretoFor, stats } from './series';
import type { ExperimentDetail, ParamSpec } from './types';
import { researchRequest } from '../../api/client';
import { getMethod, listMethods } from './api';
import { effectiveBudget, initialDesign, mergeSpecs, metricChoices, unmeasurableMetrics } from './designerModel';
import type { MethodDetail } from './types';

vi.mock('../../shell/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('../../api/client', () => ({ researchRequest: vi.fn(), contentBlob: vi.fn(), downloadLink: vi.fn(), moveArtifact: vi.fn(), apiUrl: (p: string) => p }));

beforeAll(() => {
  // jsdom 은 <dialog> 의 모달 동작을 만들지 않는다
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
});
afterEach(cleanup);

describe('방법론 라이브러리', () => {
  it('실행 상태 배지와 불가 사유를 카드에 보이고, 축 필터를 서버 질의로 보낸다', async () => {
    setup();
    mount('/research?view=library');
    expect(await screen.findByText('BM25 검색')).toBeTruthy();
    // 실행 상태가 카드 겉면에서 읽힌다(등록됐다고 실행 가능으로 표시하지 않는다)
    expect(screen.getByText('즉시 실행 가능')).toBeTruthy();
    expect(screen.getByText('현재 환경 불가')).toBeTruthy();
    expect(screen.getAllByText('CUDA 전용 기법이라 이 장비에서 실행할 수 없습니다').length).toBeGreaterThan(0);
    expect(screen.getByText('가설 단계')).toBeTruthy();
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('방법 3개 중 3개 표시');
    expect(screen.getByRole('tab', { name: '방법론' }).getAttribute('aria-selected')).toBe('true');

    // 모바일 폭: 필터는 드로어에 있고 facet 건수가 같이 보인다
    fireEvent.click(screen.getByRole('button', { name: /필터 열기/ }));
    const llm = await screen.findByRole('checkbox', { name: /LLM/ });
    expect(within(llm.closest('label') as HTMLElement).getByText('2')).toBeTruthy();
    fireEvent.click(llm);
    await waitFor(() => expect(calls.some(c => c.includes('/methods?') && c.includes('target=llm'))).toBe(true));
    await waitFor(() => expect(screen.queryByText('BM25 검색')).toBeNull());
    expect(screen.getByText('KV 캐시 4비트 양자화')).toBeTruthy();
  });

  it('검색어는 입력이 멈춘 뒤 한 번만 질의한다', async () => {
    setup();
    mount('/research?view=library');
    await screen.findByText('BM25 검색');
    const box = screen.getByRole('searchbox', { name: '방법론 검색' });
    fireEvent.change(box, { target: { value: 'B' } });
    fireEvent.change(box, { target: { value: 'BM' } });
    await waitFor(() => expect(calls.filter(c => c.includes('q=BM')).length).toBeGreaterThan(0));
    expect(calls.some(c => c.includes('q=B&') || c.endsWith('q=B'))).toBe(false);
  });

  it('상세에서 문헌 근거와 따까리 실측을 나누어 보여 주고 관계를 풀어 보인다', async () => {
    setup();
    mount('/research?view=library&method=bm25');
    const dialog = await screen.findByRole('dialog', { name: /BM25 검색/ });
    expect(within(dialog).getByText('이 방법으로 실험 설계')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('tab', { name: '근거' }));
    expect(within(dialog).getByText(/문헌에서 보고된 근거/)).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: /따까리 실측/ })).toBeTruthy();
    expect(within(dialog).getByText(/Okapi at TREC-3/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('tab', { name: /관계/ }));
    expect(within(dialog).getByText('해시 임베딩 검색')).toBeTruthy();
    expect(within(dialog).getByText('조합 가능')).toBeTruthy();
  });
});

describe('동적 파라미터 폼', () => {
  const specs: ParamSpec[] = [
    { key: 'k1', label: 'k1', type: 'number', default: 1.2, min: 0.1, max: 3, sweepable: true },
    { key: 'n', label: '개수', type: 'integer', default: 5, min: 1, max: 50 },
    { key: 'win', label: '구간', type: 'range', default: [1, 4] },
    { key: 'mode', label: '검색 방식', type: 'enum', default: 'bm25', options: ['bm25', 'dense'] },
    { key: 'flash', label: 'Flash', type: 'boolean', default: false, sweepable: true },
    { key: 'tags', label: '태그', type: 'multi_enum', options: ['a', 'b'] },
    { key: 'model', label: '모델', type: 'model', options: ['qwen-4b'] },
    { key: 'ds', label: '데이터셋', type: 'dataset' },
    { key: 'f', label: '파일', type: 'file' },
    { key: 'env', label: '환경', type: 'environment', options: ['cpu', 'robust'] },
    { key: 'dict', label: '발음사전', type: 'text' },
    { key: 'adv', label: '고급 값', type: 'number', advanced: true },
  ];
  function Harness({ onState, sweep = true }: { onState: (s: ParamState) => void; sweep?: boolean }) {
    const [state, setState] = useState<ParamState>({ values: { k1: 1.2, n: 5, win: [1, 4], mode: 'bm25', flash: false }, sweeps: {} });
    return <DynamicParameterForm specs={specs} state={state} sweepEnabled={sweep} onChange={s => { setState(s); onState(s); }} />;
  }

  it('11종 타입마다 알맞은 입력을 만들고 고급 항목은 접어 둔다', () => {
    render(<Harness onState={() => {}} />);
    expect(screen.getByLabelText('k1')).toHaveProperty('type', 'number');
    expect(screen.getByLabelText('k1').getAttribute('max')).toBe('3');
    expect(screen.getByLabelText('개수').getAttribute('step')).toBe('1');
    expect(screen.getByLabelText('구간 시작')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /검색 방식/ })).toBeTruthy();
    expect(screen.getByRole('switch')).toBeTruthy();
    expect(screen.getByRole('group', { name: '태그' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /모델/ })).toBeTruthy();
    expect(screen.getByLabelText('데이터셋')).toHaveProperty('type', 'text');
    expect(screen.getByPlaceholderText('파일 보관함 파일 ID')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /환경/ })).toBeTruthy();
    expect(screen.getByLabelText('발음사전').tagName).toBe('TEXTAREA');
    const adv = screen.getByText('고급 파라미터 1개').closest('details') as HTMLDetailsElement;
    expect(adv.open).toBe(false);
    expect(within(adv).getByLabelText('고급 값')).toBeTruthy();
  });

  it('값 여러 개 탐색을 켜면 후보 목록이 되고 search_space 에 배열로 들어간다', () => {
    let last: ParamState = emptyParamState;
    render(<Harness onState={s => { last = s; }} />);
    fireEvent.click(screen.getAllByRole('button', { name: '값 여러 개 탐색' })[0]);
    fireEvent.change(screen.getByPlaceholderText(/예: 0.1, 0.5/), { target: { value: '0.5, 1:2:0.5' } });
    expect(last.sweeps.k1).toEqual([0.5, 1, 1.5, 2]);
    // 불리언은 켜면 [true, false] 로 시작한다(Ablation·Grid)
    const flash = screen.getByText('Flash').closest('.rs-param') as HTMLElement;
    fireEvent.click(within(flash).getByRole('button', { name: '값 여러 개 탐색' }));
    expect(last.sweeps.flash).toEqual([true, false]);
    const space = buildSearchSpace(specs, last);
    expect(space.k1).toEqual([0.5, 1, 1.5, 2]);
    expect(space.flash).toEqual([true, false]);
    expect(space.mode).toBe('bm25');
    expect(space.win).toEqual([1, 4]);
  });

  it('범위를 벗어난 값은 그 자리에서 오류를 말한다', () => {
    render(<Harness onState={() => {}} />);
    fireEvent.change(screen.getByLabelText('k1'), { target: { value: '9' } });
    expect(screen.getByText('3 이하여야 합니다')).toBeTruthy();
    expect(paramError(specs[1], 2.5)).toBe('정수만 입력할 수 있습니다');
    expect(paramError(specs[10], '{broken')).toBe('JSON 사전 형식이 올바르지 않습니다');
    expect(parseSweepNumbers('1, 2, 2, 5:7:1', true)).toEqual([1, 2, 5, 6, 7]);
  });
});

describe('실험 설계실', () => {
  it('선택한 방법에서 폼을 만들고 검증 결과(설정 수·경고)를 보여 준다', async () => {
    setup();
    mount('/research?view=designer&study=s1&method=bm25');
    expect(await screen.findByLabelText('k1')).toBeTruthy();
    expect(screen.getByLabelText('b')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('조합 효과는 단순 합과 다를 수 있습니다')).toBeTruthy(), { timeout: 3000 });
    expect(screen.getByText('실행 가능')).toBeTruthy();
    const sent = vi.mocked((await import('../../api/client')).researchRequest).mock.calls.filter(c => c[0] === '/experiments/validate');
    expect(sent.length).toBe(1); // 방법을 불러오는 동안 오래된 입력으로 검증하지 않는다
    const body = JSON.stringify(sent[0][1]);
    // 서버 모델은 알 수 없는 필드를 거부하므로 검증 요청에 secondary_metrics 를 싣지 않는다
    expect(body).not.toContain('secondary_metrics');
    expect(body).toContain('"adapter_id":"retrieval_eval"');
  });

  it('예산 초과는 서버 검증 오류로 보여 주고 생성 버튼을 막는다', async () => {
    setup((path, body) => (path === '/experiments/validate'
      ? { valid: false, errors: ['Grid 탐색 공간 조합 수(30)가 최대 허용 예산(20)을 초과합니다.'], warnings: [], expanded_configurations: [], resource_estimate: { total_runs: 30, estimated_total_seconds: 90, estimated_memory_mb: 512 } }
      : defaultHandler(path, body)));
    mount('/research?view=designer&study=s1&method=bm25');
    await screen.findByLabelText('k1');
    expect(await screen.findByText(/조합 수\(30\)가 최대 허용 예산\(20\)을 초과/, undefined, { timeout: 3000 })).toBeTruthy();
    expect((screen.getByRole('button', { name: '실험만 만들기' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('llm_inference 실행기를 쓰는 방법론은 공통 파라미터로 model을 채택한다', () => {
    const { specs, owners } = mergeSpecs([], 'llm_inference');
    const modelSpec = specs.find(s => s.key === 'model');
    expect(modelSpec).toBeTruthy();
    expect(modelSpec?.default).toBe('qwen3.5-4b-q4_k_m');
    expect(owners.model).toBe('실행기 공통');
  });
});

describe('ValidatePanel', () => {
  it('확장될 설정 수가 예산을 넘으면 초과량을, 자원 예상이 한도를 넘으면 그 항목을 표시한다', () => {
    render(<ValidatePanel result={{ ...validateOk, expanded_configurations: Array.from({ length: 25 }, (_, i) => ({ label: '설정 ' + i, role: 'candidate', parameters: { k1: i } })), resource_estimate: { estimated_seconds: 900, estimated_memory_mb: 9000, total_runs: 25 }, warnings: ['설정이 많습니다'] }}
      pending={false} budget={{ max_runs: 20, max_total_seconds: 300, max_memory_mb: 4096 }} stale={false} localErrors={[]} />);
    expect(screen.getByText(/예산 초과 5/)).toBeTruthy();
    expect(screen.getByText(/시간 예산/)).toBeTruthy();
    expect(screen.getByText(/메모리 예산 초과/)).toBeTruthy();
    expect(screen.getByText('설정이 많습니다')).toBeTruthy();
    expect(screen.getByText(/달라지는 값: k1/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /나머지 13개 보기/ })).toBeTruthy();
  });
});

describe('비교 차트', () => {
  const items = [
    { configuration_id: 'c2', label: '#2 (k1=1.8)', metric_key: 'recall_at_k', metric_label: 'Recall@k', abs_delta: 0.125, rel_delta_pct: 25, direction: 'higher_is_better' as const },
    { configuration_id: 'c3', label: '#3 (k1=2.4)', metric_key: 'recall_at_k', metric_label: 'Recall@k', abs_delta: -0.05, rel_delta_pct: -10, direction: 'higher_is_better' as const },
    { configuration_id: 'c4', label: '#4', metric_key: 'recall_at_k', metric_label: 'Recall@k', abs_delta: null, rel_delta_pct: null, direction: 'higher_is_better' as const },
  ];
  it('Baseline 대비 개선·퇴보·비교 불가를 색이 아닌 기호와 글자로도 말한다', () => {
    render(<DeltaBarChart items={items} metricLabel="Recall@k" direction="higher_is_better" baselineLabel="Baseline" />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('aria-label')).toContain('개선');
    expect(img.getAttribute('aria-label')).toContain('퇴보');
    expect(screen.getByText('▲ +25.0%')).toBeTruthy();
    expect(screen.getByText('▼ −10.0%')).toBeTruthy();
    expect(screen.getAllByText('비교 불가').length).toBeGreaterThan(0);
    expect(screen.getByText('데이터 표로 보기')).toBeTruthy();
  });

  it('낮을수록 좋은 지표는 값이 줄면 개선으로 판정한다', () => {
    render(<DeltaBarChart items={[{ ...items[1], metric_label: '지연', metric_key: 'lat', rel_delta_pct: -30 }]} metricLabel="지연" direction="lower_is_better" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('개선');
  });

  it('반복이 1회뿐이면 변동성 미상으로 표시한다', () => {
    render(<RepeatDistributionPlot metricLabel="Recall@k" direction="higher_is_better" items={[
      { configuration_id: 'c1', label: 'A', metric_key: 'recall_at_k', metric_label: 'Recall@k', n: 1, mean: 0.5, median: 0.5, std: null, min: 0.5, max: 0.5, values: [0.5] },
      { configuration_id: 'c2', label: 'B', metric_key: 'recall_at_k', metric_label: 'Recall@k', n: 4, mean: 0.6, median: 0.61, std: 0.02, min: 0.57, max: 0.63, values: [0.57, 0.6, 0.62, 0.63] },
    ]} />);
    expect(screen.getByText(/변동성 미상 \(n=1\)/)).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('n=4');
  });

  it('Pareto 는 두 축에서 밀리지 않는 점을 최적으로 표시하고 점을 누르면 값을 읽어 준다', () => {
    const detail = { experiment, configurations: cfgs, runs, measurements: [...runMeasurements.r1, ...runMeasurements.r2], artifacts: [] } as unknown as ExperimentDetail;
    const p = paretoFor(detail, 'query_latency_ms_mean', 'recall_at_k');
    expect(p?.points.map(x => x.is_pareto_optimal)).toEqual([true, true]); // 빠르고 덜 정확 vs 느리고 더 정확: 서로 밀리지 않는다
    render(<ParetoScatterPlot series={p!} />);
    fireEvent.click(screen.getByRole('button', { name: /#2 \(k1=1.8\)/ }));
    expect(screen.getByRole('status').textContent).toContain('파레토 최적');
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('파레토 최적 2개');
  });

  it('지표별 막대와 Sweep 선이 그려진다', () => {
    render(<><MetricComparisonBar baselineId="c1" group={{ metric_key: 'recall_at_k', metric_label: 'Recall@k', direction: 'higher_is_better', values: [{ configuration_id: 'c1', label: 'Baseline', value: 0.5, n: 1 }, { configuration_id: 'c2', label: '#2', value: 0.625, n: 1 }, { configuration_id: 'c3', label: '#3', value: null, n: 0 }] }} />
      <SweepLineChart series={{ parameter: 'bm25_k1', metric_key: 'recall_at_k', metric_label: 'Recall@k', points: [{ x: 1.2, y: 0.5, n: 1 }, { x: 1.8, y: 0.62, n: 1 }, { x: 2.4, y: null, n: 0 }] }} /></>);
    const imgs = screen.getAllByRole('img');
    expect(imgs[0].getAttribute('aria-label')).toContain('Baseline');
    expect(screen.getByText('측정 없음')).toBeTruthy();
    expect(imgs[1].getAttribute('aria-label')).toContain('bm25_k1');
  });
});

describe('시리즈 계산', () => {
  it('성공한 실행만 평균에 넣고 표준편차는 n<2 면 알 수 없다고 둔다', () => {
    expect(stats([1, 3]).std).toBeCloseTo(1.414, 3);
    expect(stats([2]).std).toBeNull();
    const detail = { experiment, configurations: cfgs, runs, measurements: [...runMeasurements.r1, ...runMeasurements.r2, { ...runMeasurements.r1[0], run_id: 'r3', configuration_id: 'c3', value: 0.99 }], artifacts: [] } as unknown as ExperimentDetail;
    const s = deriveSeries(detail, 'c1');
    const d = s.delta_bars.find(x => x.configuration_id === 'c2' && x.metric_key === 'recall_at_k');
    expect(d?.rel_delta_pct).toBeCloseTo(25, 5);
    // 실패한 실행(r3)의 측정은 쓰지 않는다
    expect(s.delta_bars.find(x => x.configuration_id === 'c3' && x.metric_key === 'recall_at_k')?.rel_delta_pct).toBeNull();
    // 값이 셋 이상 다른 숫자 파라미터만 Sweep 선이 된다. 실패한 설정(c3)은 점이 비어 있다
    expect(s.sweep_lines.find(l => l.parameter === 'bm25_k1' && l.metric_key === 'recall_at_k')?.points.map(p => p.y)).toEqual([0.5, 0.625, null]);
    expect(s.config_diff_table?.changed_keys).toEqual(['bm25_k1']);
  });
});

describe('연구 요약 문장', () => {
  it('Ablation 은 퇴보가 아니라 요소별 기여로 요약한다', () => {
    const cs = [{ ...cfgs[0], role: 'baseline' }, { ...cfgs[1], role: 'ablation_drop', ablation_factor: 'convert_numbers' }];
    const rs = [runs[0], runs[1]];
    const ms = [{ ...runMeasurements.r1[2], metric_key: 'cer', metric_label: 'CER', value: 0.06 }, { ...runMeasurements.r2[2], metric_key: 'cer', metric_label: 'CER', value: 0.19 }];
    const detail = { experiment: { ...experiment, strategy: 'ablation', primary_metric: 'cer' }, configurations: cs, runs: rs, measurements: ms, artifacts: [] } as unknown as ExperimentDetail;
    const n = narrate(detail);
    expect(n.text).toContain('convert_numbers');
    expect(n.text).toContain('가장 크게 나빠졌습니다');
    expect(n.improved).toBeNull();
  });
});

describe('결과 분석 화면', () => {
  it('실험 상세에 측정값이 없어도 실행별 측정으로 비교를 그리고, 간접 지표와 실패 실행을 숨기지 않는다', async () => {
    setup();
    mount('/research?view=analysis&study=s1&experiment=e1');
    expect(await screen.findByText('설정별 결과')).toBeTruthy();
    expect((await screen.findAllByText(/▲ \+25\.0% 개선/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Recall@k — Baseline \(k1=1\.2\) 대비 변화/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/변동성 미상/).length).toBeGreaterThan(0);
    // 실패한 실행은 목록에 원인과 함께 남는다
    const failed = screen.getByRole('region', { name: /실패·취소한 실행/ });
    expect(failed.textContent).toContain('메모리 한도를 넘었습니다');
    // 간접 지표 선택 시 경고
    fireEvent.click(screen.getByRole('button', { name: 'STT 재인식 CER' }));
    expect(await screen.findByText('간접 지표입니다')).toBeTruthy();
    // 채택은 목표·지표·제약이 있어야 한다
    expect((screen.getByRole('button', { name: '이 설정 채택' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('연구 기록', () => {
  it('실험을 한 문단으로 요약하고 타임라인을 사건 문장으로 보여 준다', async () => {
    setup();
    mount('/research?view=records&study=' + study.id);
    expect(await screen.findByText('시도한 방법과 결과')).toBeTruthy();
    expect(await screen.findByText(/설정 3개, 실행 3회 중 성공 2회·실패\/취소 1회/)).toBeTruthy();
    expect(screen.getByText('연구를 시작했습니다')).toBeTruthy();
    expect(screen.getAllByText('k1 을 올리면 개선').length).toBeGreaterThan(0);
  });
});

describe('결과 분석 compare-series 계약 정합 (반증 테스트)', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  function withDelta(value: number, options: { baselineId?: string; experimentId?: string; idPrefix?: string; paretoX?: string; paretoY?: string } = {}) {
    const mapId = (id: string) => options.idPrefix ? `${options.idPrefix}-${id}` : id;
    const baselineId = options.baselineId ?? mapId('c1');
    const treatmentId = baselineId === mapId('c1') ? mapId('c2') : mapId('c1');
    const treatmentLabel = treatmentId.endsWith('-c1') || treatmentId === 'c1' ? 'Baseline (k1=1.2)' : '#2 (k1=1.8)';
    const delta = fakeServerCompare.delta_bars[0];
    const sameParetoAxis = options.paretoX && options.paretoX === options.paretoY;
    const reason = 'Pareto 분석은 서로 다른 두 지표를 축으로 선택해야 합니다.';
    return {
      ...fakeServerCompare,
      experiment_id: options.experimentId ?? 'e1',
      baseline_configuration_id: baselineId,
      delta_bars: [{ ...delta, configuration_id: treatmentId, config_id: treatmentId, label: treatmentLabel, rel_delta_pct: value, abs_delta: treatmentId.endsWith('-c1') || treatmentId === 'c1' ? -0.277 : 0.388 }],
      metric_bars: fakeServerCompare.metric_bars.map(g => ({ ...g, values: g.values.map(v => ({ ...v, configuration_id: mapId(v.configuration_id) })) })),
      repeat_distributions: fakeServerCompare.repeat_distributions.map(d => ({ ...d, configuration_id: mapId(d.configuration_id) })),
      pareto: sameParetoAxis
        ? { ...fakeServerCompare.pareto, status: 'unavailable', unavailable_reason: reason, x_metric: options.paretoX, y_metric: options.paretoY, points: [] }
        : { ...fakeServerCompare.pareto, x_metric: options.paretoX ?? fakeServerCompare.pareto.x_metric, y_metric: options.paretoY ?? fakeServerCompare.pareto.y_metric, points: fakeServerCompare.pareto.points.map(p => ({ ...p, configuration_id: mapId(p.configuration_id) })) },
      pareto_points: sameParetoAxis ? [] : fakeServerCompare.pareto_points.map(p => ({ ...p, configuration_id: mapId(p.configuration_id) })),
      pareto_status: sameParetoAxis ? 'unavailable' : 'available',
      pareto_unavailable_reason: sameParetoAxis ? reason : null,
      config_diff_table: { ...fakeServerCompare.config_diff_table, rows: fakeServerCompare.config_diff_table.rows.map(r => ({ ...r, configuration_id: mapId(r.configuration_id) })) },
    };
  }

  function secondExperimentDetail() {
    const mapId = (id: string) => `e2-${id}`;
    return {
      ...experiment,
      id: 'e2',
      title: '두 번째 실험',
      baseline_configuration_id: mapId('c1'),
      configurations: cfgs.map(c => ({ ...c, id: mapId(c.id), experiment_id: 'e2' })),
      runs: runs.map(r => ({ ...r, id: mapId(r.id), experiment_id: 'e2', configuration_id: mapId(r.configuration_id) })),
      measurements: Object.values(runMeasurements).flat().map(m => ({ ...m, run_id: mapId(m.run_id), configuration_id: mapId(m.configuration_id) })),
      latest_analysis: null,
      artifacts: [],
    };
  }

  const fakeServerCompare = {
    experiment_id: 'e1',
    primary_metric: 'recall_at_k',
    baseline_configuration_id: 'c1',
    metrics: [
      { metric_key: 'recall_at_k', metric_label: 'Recall@k', unit: '', direction: 'higher_is_better', is_proxy: false },
      { metric_key: 'query_latency_ms_mean', metric_label: '질의 지연 평균', unit: 'ms', direction: 'lower_is_better', is_proxy: false },
    ],
    delta_bars: [
      {
        configuration_id: 'c2',
        config_id: 'c2',
        label: '#2 (k1=1.8)',
        metric_key: 'recall_at_k',
        metric_label: 'Recall@k',
        unit: '',
        abs_delta: 0.388,
        rel_delta_pct: 77.7, // 로컬 재계산(+25.0%)과 일부러 다른 값!
        direction: 'higher_is_better',
        is_proxy: false,
        is_baseline: false,
      },
    ],
    metric_bars: [
      {
        metric_key: 'recall_at_k',
        metric_label: 'Recall@k',
        unit: '',
        direction: 'higher_is_better',
        is_proxy: false,
        values: [
          { configuration_id: 'c1', label: 'Baseline (k1=1.2)', value: 0.5, n: 1 },
          { configuration_id: 'c2', label: '#2 (k1=1.8)', value: 0.777, n: 1 },
        ],
      },
    ],
    repeat_distributions: [
      {
        configuration_id: 'c1',
        label: 'Baseline (k1=1.2)',
        metric_key: 'recall_at_k',
        metric_label: 'Recall@k',
        n: 1,
        mean: 0.5,
        median: 0.5,
        std: null,
        min: 0.5,
        max: 0.5,
        values: [0.5],
        is_proxy: false,
      },
      {
        configuration_id: 'c2',
        label: '#2 (k1=1.8)',
        metric_key: 'recall_at_k',
        metric_label: 'Recall@k',
        n: 1,
        mean: 0.777,
        median: 0.777,
        std: null,
        min: 0.777,
        max: 0.777,
        values: [0.777],
        is_proxy: false,
      },
    ],
    pareto: {
      status: 'available',
      unavailable_reason: null,
      x_metric: 'query_latency_ms_mean',
      y_metric: 'recall_at_k',
      x_label: '질의 지연 평균',
      y_label: 'Recall@k',
      x_unit: 'ms',
      y_unit: '',
      x_direction: 'lower_is_better',
      y_direction: 'higher_is_better',
      points: [
        { configuration_id: 'c2', label: '#2 (k1=1.8)', x: 999, y: 888, is_pareto_optimal: true },
      ],
    },
    pareto_points: [
      { configuration_id: 'c2', label: '#2 (k1=1.8)', x: 999, y: 888, is_pareto_optimal: true },
    ],
    pareto_status: 'available',
    pareto_unavailable_reason: null,
    sweep_lines: [],
    ablation_impacts: [],
    config_diff_table: {
      keys: ['bm25_k1'],
      changed_keys: ['bm25_k1'],
      rows: [
        { configuration_id: 'c1', label: 'Baseline', role: 'baseline', values: { bm25_k1: 1.2 } },
        { configuration_id: 'c2', label: '#2', role: 'candidate', values: { bm25_k1: 1.8 } },
      ],
    },
  };

  it('서버 compare-series 의 값(delta/metric/pareto)이 detail 로컬 계산보다 우선하여 화면을 지배한다', async () => {
    setup((path, body) => {
      if (path.includes('/compare-series')) return fakeServerCompare;
      return defaultHandler(path, body);
    });
    mount('/research?view=analysis&study=s1&experiment=e1');
    // DeltaBarChart 에 서버의 rel_delta_pct(+77.7%) 가 렌더링되어야 함
    expect((await screen.findAllByText(/▲ \+77\.7%/)).length).toBeGreaterThan(0);
    // DeltaBarChart aria-label 에 서버 응답이 반영됨
    expect(screen.getByRole('img', { name: /77\.7% 개선/ })).toBeTruthy();
    // compare-series API 호출 확인
    expect(calls.some(c => c.includes('/experiments/e1/compare-series'))).toBe(true);
    // Pareto 산점도 요약에 서버가 준 1개 점 반영 확인
    expect(screen.getByRole('img', { name: /산점도.*점 1개/ })).toBeTruthy();
  });

  it('서로 공통 측정이 없는 두 설정이면 서버의 구체적 unavailable 사유를 그대로 표시한다', async () => {
    const reasonText = '두 지표(latency, quality)가 모두 측정된 설정이 없어 Pareto 분석을 생성할 수 없습니다.';
    setup((path, body) => {
      if (path.includes('/compare-series')) {
        return {
          ...fakeServerCompare,
          pareto: { status: 'unavailable', unavailable_reason: reasonText, points: [] },
          pareto_points: [],
          pareto_status: 'unavailable',
          pareto_unavailable_reason: reasonText,
        };
      }
      return defaultHandler(path, body);
    });
    mount('/research?view=analysis&study=s1&experiment=e1');
    expect(await screen.findByText(reasonText)).toBeTruthy();
    // 로컬 기본 안내문으로 덮어쓰지 않았음을 확인
    expect(screen.queryByText('두 축을 서로 다른 지표로 고르고, 두 지표가 모두 측정된 설정이 있어야 그릴 수 있습니다.')).toBeNull();
  });

  it('단일 지표인 경우에도 서버의 pareto_unavailable_reason 원문을 표시한다', async () => {
    const singleReason = '다목적 Pareto 분석에는 서로 다른 2개 이상의 지표가 필요합니다 (현재 유효 지표: 1개). 단일 지표 순위는 위의 비교 차트를 참고하세요.';
    setup((path, body) => {
      if (path.includes('/compare-series')) {
        return {
          ...fakeServerCompare,
          pareto: { status: 'unavailable', unavailable_reason: singleReason, points: [] },
          pareto_points: [],
          pareto_status: 'unavailable',
          pareto_unavailable_reason: singleReason,
        };
      }
      return defaultHandler(path, body);
    });
    mount('/research?view=analysis&study=s1&experiment=e1');
    expect(await screen.findByText(singleReason)).toBeTruthy();
  });

  it('가로축/세로축 변경 시 쿼리 파라미터가 갱신되어 전송된다', async () => {
    setup((path, body) => {
      if (path.includes('/compare-series')) return fakeServerCompare;
      return defaultHandler(path, body);
    });
    mount('/research?view=analysis&study=s1&experiment=e1');
    await screen.findAllByText(/▲ \+77\.7%/);

    const pxTrigger = screen.getByRole('combobox', { name: '가로축' });
    fireEvent.click(pxTrigger);
    const opt = screen.getByRole('option', { name: 'Recall@k' });
    fireEvent.click(opt);
    await waitFor(() => {
      expect(calls.some(c => c.includes('pareto_x_metric=recall_at_k'))).toBe(true);
    });
  });

  it('Baseline 변경 시 baseline_config_id 쿼리 파라미터가 전송된다', async () => {
    setup((path, body) => {
      if (path.includes('/compare-series')) return fakeServerCompare;
      return defaultHandler(path, body);
    });
    mount('/research?view=analysis&study=s1&experiment=e1');
    await screen.findAllByText(/▲ \+77\.7%/);

    const baseTrigger = screen.getByRole('combobox', { name: 'Baseline (기준 설정)' });
    fireEvent.click(baseTrigger);
    const opt = screen.getByRole('option', { name: '#2 (k1=1.8)' });
    fireEvent.click(opt);
    await waitFor(() => {
      expect(calls.some(c => c.includes('baseline_config_id=c2'))).toBe(true);
    });
  });

  it('서버 응답이 빈 객체이거나 구형 형태면 로컬 deriveSeries 로 fallback 한다', async () => {
    setup((path, body) => {
      if (path.includes('/compare-series')) return {}; // old-shape / null normalization
      return defaultHandler(path, body);
    });
    mount('/research?view=analysis&study=s1&experiment=e1');
    // normalizeSeries({}) 는 null 이므로 로컬 deriveSeries 결과인 +25.0% 가 나와야 함
    expect((await screen.findAllByText(/▲ \+25\.0% 개선/)).length).toBeGreaterThan(0);
  });

  it('compare-series HTTP 실패 시 오류를 조용히 은폐하지 않고 오류 안내를 표시한다', async () => {
    setup((path, body) => {
      if (path.includes('/compare-series')) throw new Error('500 서버 내부 오류');
      return defaultHandler(path, body);
    });
    mount('/research?view=analysis&study=s1&experiment=e1');
    expect(await screen.findByText(/500 서버 내부 오류/)).toBeTruthy();
    expect(screen.getByText('비교 데이터 다시 불러오기')).toBeTruthy();
  });

  it('실제 compare 응답 전에는 로컬 비교 차트와 결과 수치를 보여 주지 않고 성공 후 서버 결과를 표시한다', async () => {
    const response = deferred<unknown>();
    setup((path, body) => path.includes('/compare-series') ? response.promise : defaultHandler(path, body));
    mount('/research?view=analysis&study=s1&experiment=e1');

    await screen.findByRole('heading', { name: 'BM25 k1 스윕' });
    expect(screen.queryByRole('heading', { name: 'Baseline 대비 변화' })).toBeNull();
    expect(screen.queryByText(/▲ \+25\.0%/)).toBeNull();
    expect(screen.queryByRole('heading', { name: '설정별 결과' })).toBeNull();

    response.resolve(fakeServerCompare);
    expect((await screen.findAllByText(/▲ \+77\.7%/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: /산점도.*점 1개/ })).toBeTruthy();
  });

  it('baseline key가 바뀌면 이전 서버 시리즈를 새 조건 결과처럼 유지하지 않는다', async () => {
    const next = deferred<unknown>();
    let compareCount = 0;
    setup((path, body) => {
      if (path.includes('/compare-series')) return ++compareCount === 1 ? fakeServerCompare : next.promise;
      return defaultHandler(path, body);
    });
    mount('/research?view=analysis&study=s1&experiment=e1');
    expect((await screen.findAllByText(/▲ \+77\.7%/)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('combobox', { name: 'Baseline (기준 설정)' }));
    fireEvent.click(screen.getByRole('option', { name: '#2 (k1=1.8)' }));
    await waitFor(() => expect(calls.some(c => c.includes('baseline_config_id=c2'))).toBe(true));
    await waitFor(() => expect(compareCount).toBeGreaterThan(1));
    expect(screen.queryByText(/\+77\.7%/)).toBeNull();
    expect(screen.queryByRole('img', { name: /산점도/ })).toBeNull();

    next.resolve(withDelta(-35.6, { baselineId: 'c2' }));
    expect((await screen.findAllByText(/▼ −35\.6%|▼ -35\.6%/)).length).toBeGreaterThan(0);
  });

  it('축과 실험 key가 바뀔 때마다 이전 비교를 숨기고 각 새 응답을 기다린다', async () => {
    const axisResponse = deferred<unknown>();
    const experimentDetail = deferred<unknown>();
    const experimentSeries = deferred<unknown>();
    setup((path, body) => {
      if (path === '/studies/s1/resume') return { ...(defaultHandler(path, body) as object), experiments: [experiment, { ...experiment, id: 'e2', title: '두 번째 실험' }] };
      if (path === '/experiments/e2') return experimentDetail.promise;
      if (path.includes('/compare-series')) {
        if (path.startsWith('/experiments/e2/')) return experimentSeries.promise;
        if (path.includes('pareto_x_metric=recall_at_k')) return axisResponse.promise;
        return fakeServerCompare;
      }
      return defaultHandler(path, body);
    });
    mount('/research?view=analysis&study=s1&experiment=e1');
    expect((await screen.findAllByText(/▲ \+77\.7%/)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('combobox', { name: '가로축' }));
    fireEvent.click(screen.getByRole('option', { name: 'Recall@k' }));
    await waitFor(() => expect(calls.some(c => c.includes('pareto_x_metric=recall_at_k'))).toBe(true));
    expect(screen.queryByText(/\+77\.7%/)).toBeNull();
    expect(screen.queryByRole('img', { name: /산점도/ })).toBeNull();
    axisResponse.resolve(withDelta(51.1, { paretoX: 'recall_at_k', paretoY: 'recall_at_k' }));
    expect((await screen.findAllByText(/▲ \+51\.1%/)).length).toBeGreaterThan(0);
    expect(screen.getByText('Pareto 분석은 서로 다른 두 지표를 축으로 선택해야 합니다.')).toBeTruthy();

    fireEvent.click(screen.getByRole('combobox', { name: '분석할 실험' }));
    fireEvent.click(screen.getByRole('option', { name: '두 번째 실험' }));
    experimentDetail.resolve(secondExperimentDetail());
    await waitFor(() => expect(calls.some(c => c.includes('/experiments/e2/compare-series'))).toBe(true));
    expect(screen.queryByText(/\+51\.1%/)).toBeNull();
    expect(screen.queryByRole('img', { name: /산점도/ })).toBeNull();

    experimentSeries.resolve(withDelta(62.2, { experimentId: 'e2', idPrefix: 'e2', paretoX: 'recall_at_k', paretoY: 'recall_at_k' }));
    expect((await screen.findAllByText(/▲ \+62\.2%/)).length).toBeGreaterThan(0);
    await screen.findByRole('heading', { name: '두 번째 실험' });
  });

  it('최초 compare 실패여도 detail의 실패 원인·결과물·최선 결과 채택을 조회할 수 있다', async () => {
    const reason = '실험기 연결이 끊겼습니다';
    setup((path, body) => {
      if (path.includes('/compare-series')) throw new Error(reason);
      if (path === '/experiments/e1') return {
        ...(defaultHandler(path, body) as object),
        artifacts: [{ id: 'a1', experiment_id: 'e1', run_id: 'r1', artifact_id: 'file1', role: 'benchmark_table', label: '원본 측정 표' }],
      };
      return defaultHandler(path, body);
    });
    mount('/research?view=analysis&study=s1&experiment=e1');

    expect(await screen.findByText(reason)).toBeTruthy();
    expect(screen.getByText(/메모리 한도를 넘었습니다/)).toBeTruthy();
    expect(screen.getByText('원본 측정 표')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '최선 결과 채택' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '이 설정 채택' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '설정별 결과' })).toBeNull();
  });

  it('동일 key 재조회 실패에는 캐시된 비교를 이전 결과로 표시하고 재시도를 제공한다', async () => {
    let compareCount = 0;
    setup((path, body) => {
      if (path.includes('/compare-series')) {
        if (++compareCount === 1) return fakeServerCompare;
        throw new Error('갱신 서버 오류');
      }
      return defaultHandler(path, body);
    });
    mount('/research?view=analysis&study=s1&experiment=e1');
    expect((await screen.findAllByText(/▲ \+77\.7%/)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '분석 스냅샷 갱신' }));
    expect(await screen.findByText(/이전 비교 결과/)).toBeTruthy();
    expect(screen.getByText(/갱신 서버 오류/)).toBeTruthy();
    expect(screen.getAllByText(/▲ \+77\.7%/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '비교 데이터 다시 불러오기' })).toBeTruthy();
  });

  it('설정별 결과 표의 delta 는 서버 값을 쓰고 서버에 없는 칸은 —, 로컬 계산 값은 같은 화면에 없다', async () => {
    setup((path, body) => path.includes('/compare-series') ? fakeServerCompare : defaultHandler(path, body));
    mount('/research?view=analysis&study=s1&experiment=e1');
    const region = await screen.findByRole('region', { name: /설정별 결과 표/ });
    await waitFor(() => expect(within(region).getByText(/\+77\.7%/)).toBeTruthy());
    expect(within(region).queryByText(/\+25\.0%/)).toBeNull();
    // 서버 delta_bars 에 없는 지표(지연)는 로컬 +50.0% 대신 —
    expect(within(region).queryByText(/\+50\.0%/)).toBeNull();
    const row = within(region).getByRole('row', { name: /#2 \(k1=1\.8\)/ });
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText(/\+25\.0%/)).toBeNull();
  });

  it('분석 mutation 한 번에 compare-series 는 한 번만 다시 요청한다', async () => {
    let compareCount = 0;
    setup((path, body) => {
      if (path.includes('/compare-series')) return ++compareCount === 1 ? fakeServerCompare : withDelta(42.4);
      return defaultHandler(path, body);
    });
    mount('/research?view=analysis&study=s1&experiment=e1');
    expect(await screen.findAllByText(/▲ \+77\.7%/)).not.toHaveLength(0);
    expect(compareCount).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: '분석 스냅샷 갱신' }));
    expect((await screen.findAllByText(/▲ \+42\.4%/)).length).toBeGreaterThan(0);
    await new Promise(r => setTimeout(r, 100));
    expect(calls.filter(c => c.includes('/compare-series')).length).toBe(2);
  });

  it('분석 mutation 성공 뒤 같은 비교 key를 다시 조회해 갱신된 서버 값을 표시한다', async () => {
    let compareCount = 0;
    setup((path, body) => {
      if (path.includes('/compare-series')) return ++compareCount === 1 ? fakeServerCompare : withDelta(42.4);
      return defaultHandler(path, body);
    });
    mount('/research?view=analysis&study=s1&experiment=e1');
    expect((await screen.findAllByText(/▲ \+77\.7%/)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '분석 스냅샷 갱신' }));
    expect((await screen.findAllByText(/▲ \+42\.4%/)).length).toBeGreaterThan(0);
    expect(calls.some(c => c.startsWith('POST /experiments/e1/analyze'))).toBe(true);
    expect(compareCount).toBeGreaterThan(1);
  });
});

describe('채택 후 방법 승격 결과 안내', () => {
  it('promotionNotice 는 승격 성공·건너뜀(사유별)·미요청을 구분한다', () => {
    expect(promotionNotice({ requested: true, status: 'promoted', method_id: 'm1', lifecycle_status: 'validated' })).toEqual({ kind: 'tip', text: '방법을 카탈로그에서 승격했습니다 (검증됨).' });
    expect(promotionNotice({ requested: true, status: 'skipped', reason: 'system_seed_method' })?.text).toContain('기본 카탈로그 방법이라 승격은 건너뛰었습니다.');
    expect(promotionNotice({ requested: true, status: 'skipped', reason: 'result_not_adopted' })?.text).toContain('기각');
    expect(promotionNotice({ requested: true, status: 'skipped', reason: 'experiment_has_no_method' })?.text).toContain('연결된 방법이 없어');
    expect(promotionNotice({ requested: true, status: 'skipped', reason: 'new_reason' })?.text).toContain('(new_reason)');
    expect(promotionNotice({ requested: false, status: 'not_requested' })).toBeNull();
    expect(promotionNotice(undefined)).toBeNull();
  });

  async function adopt(promotion: unknown, promote: boolean) {
    setup((path, body) => path.includes('/best-results') ? { id: 'b1', status: 'adopted', ...(promotion === undefined ? {} : { method_promotion: promotion }) } : defaultHandler(path, body));
    mount('/research?view=analysis&study=s1&experiment=e1');
    fireEvent.change(await screen.findByLabelText('목표'), { target: { value: 'Recall@5 개선' } });
    fireEvent.change(screen.getByLabelText('제약·조건'), { target: { value: '이 장비에서만' } });
    fireEvent.change(screen.getByLabelText('판단 근거'), { target: { value: 'Recall 이 올랐다' } });
    if (promote) fireEvent.click(screen.getByLabelText(/방법을 카탈로그에서 승격/));
    fireEvent.click(screen.getByRole('button', { name: '이 설정 채택' }));
    fireEvent.click(await screen.findByRole('button', { name: '기록' }));
    await waitFor(() => expect(calls.some(c => c.startsWith('POST /studies/s1/best-results'))).toBe(true));
  }

  it('system seed 방법 승격 요청은 채택 저장 뒤 "기본 카탈로그 방법이라 승격은 건너뜀"을 보여 준다', async () => {
    await adopt({ requested: true, status: 'skipped', reason: 'system_seed_method' }, true);
    const note = await screen.findByText(/기본 카탈로그 방법이라 승격은 건너뛰었습니다/);
    expect(note.textContent).toContain('채택 결과는 저장됐습니다');
  });

  it('승격 성공 응답은 승격됐다고 보여 준다', async () => {
    await adopt({ requested: true, status: 'promoted', method_id: 'm1', lifecycle_status: 'validated' }, true);
    expect(await screen.findByText(/방법을 카탈로그에서 승격했습니다 \(검증됨\)/)).toBeTruthy();
  });

  it('승격을 요청하지 않으면 승격 안내를 띄우지 않는다', async () => {
    await adopt({ requested: false, status: 'not_requested' }, false);
    await waitFor(() => expect(screen.queryByRole('button', { name: '기록' })).toBeNull());
    expect(screen.queryByText(/승격/, { selector: '[role="status"]' })).toBeNull();
  });
});

describe('카탈로그 시드 선택지 형식', () => {
  const seedParam = { key: 'cache_type_k', label: '--cache-type-k', type: 'enum', default: 'f16',
    options: [{ value: 'f16', label: 'f16 (FP16 기본 정밀도)' }, { value: 'q8_0', label: 'q8_0 (8비트 양자화)' }], sweepable: true };
  const rawMethod = { id: 'm9', slug: 'kv_cache_quantization', name: 'KV Cache Quantization', name_ko: 'KV 캐시 양자화', parameters: [seedParam], relations: [] };

  it('시드가 {value,label} 객체로 준 선택지를 getMethod 가 값 문자열과 라벨 표로 풀어 준다', async () => {
    vi.mocked(researchRequest).mockResolvedValueOnce(rawMethod);
    const d = await getMethod('kv_cache_quantization');
    expect(d.parameters[0].options).toEqual(['f16', 'q8_0']);
    expect(d.parameters[0].option_labels).toEqual({ f16: 'f16 (FP16 기본 정밀도)', q8_0: 'q8_0 (8비트 양자화)' });
  });

  it('목록 응답의 방법도 같은 모양으로 푼다', async () => {
    vi.mocked(researchRequest).mockResolvedValueOnce({ items: [rawMethod], total: 1, facets: {} });
    const r = await listMethods({});
    expect(r.items[0].parameters[0].options).toEqual(['f16', 'q8_0']);
  });

  it('문자열 선택지는 그대로 두고 라벨 표를 만들지 않는다', async () => {
    vi.mocked(researchRequest).mockResolvedValueOnce({ ...rawMethod, parameters: [{ ...seedParam, options: ['f16', 'q8_0'] }] });
    const d = await getMethod('kv_cache_quantization');
    expect(d.parameters[0].options).toEqual(['f16', 'q8_0']);
    expect(d.parameters[0].option_labels).toBeUndefined();
  });

  it('폼은 선택지 라벨을 보이고 값은 코드로 보낸다', () => {
    const spec: ParamSpec = { key: 'cache_type_k', label: 'K 캐시', type: 'enum', default: 'f16', options: ['f16', 'q8_0'], option_labels: { f16: 'f16 (FP16 기본 정밀도)', q8_0: 'q8_0 (8비트 양자화)' }, sweepable: true };
    const seen: ParamState[] = [];
    function H() {
      const [state, setState] = useState<ParamState>({ values: { cache_type_k: 'f16' }, sweeps: {} });
      return <DynamicParameterForm specs={[spec]} state={state} sweepEnabled onChange={s => { setState(s); seen.push(s); }} />;
    }
    render(<H />);
    expect(screen.getAllByText('f16 (FP16 기본 정밀도)').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '값 여러 개 탐색' }));
    expect(seen.at(-1)?.sweeps.cache_type_k).toEqual(['f16', 'q8_0']);
    fireEvent.click(screen.getByRole('button', { name: 'q8_0 (8비트 양자화)' }));
    expect(seen.at(-1)?.sweeps.cache_type_k).toEqual(['f16']);
  });
});

describe('설계실 지표 선택지와 예산 기본값', () => {
  const kv = { id: 'm2', slug: 'kv_cache_quantization', name: 'KV', name_ko: 'KV 캐시 양자화', metrics: ['peak_memory_mb', 'tokens_per_sec', 'accuracy'], parameters: [], relations: [] } as unknown as MethodDetail;

  it('LLM 실행기가 실제로 내는 지표만 고르게 하고, 카탈로그 권장 지표 중 못 재는 것은 따로 알려 준다', () => {
    const choices = metricChoices([kv], 'llm_inference');
    expect(choices).toEqual(['decode_tps', 'prefill_tps', 'approx_prefill_ms', 'wall_seconds', 'swap_peak_growth_mb']);
    expect(unmeasurableMetrics([kv], 'llm_inference')).toEqual(['peak_memory_mb', 'tokens_per_sec', 'accuracy']);
  });

  it('실행기 기본 지표를 맨 앞에 두고, 방법이 권장한 지표 중 잴 수 있는 것을 그 뒤에 둔다', () => {
    const m = { ...kv, metrics: ['swap_peak_growth_mb', 'decode_tps'] } as MethodDetail;
    expect(metricChoices([m], 'llm_inference').slice(0, 2)).toEqual(['decode_tps', 'swap_peak_growth_mb']);
    expect(unmeasurableMetrics([m], 'llm_inference')).toEqual([]);
  });

  it('외부 결과 등록은 방법이 권장한 지표를 그대로 보여 준다', () => {
    expect(metricChoices([kv], 'external_report')).toEqual(['peak_memory_mb', 'tokens_per_sec', 'accuracy']);
    expect(unmeasurableMetrics([kv], 'external_report')).toEqual([]);
  });

  it('LLM 실행기는 하드 상한 12 를 넘는 기본 실행 수로 시작하지 않는다', () => {
    expect(effectiveBudget({ ...initialDesign, adapterId: 'llm_inference' }).max_runs).toBe(12);
    expect(effectiveBudget({ ...initialDesign, adapterId: 'retrieval_eval' }).max_runs).toBe(20);
  });

  it('사용자가 직접 넣은 실행 수는 상한을 넘어도 그대로 두어 서버 검증이 말하게 한다', () => {
    expect(effectiveBudget({ ...initialDesign, adapterId: 'llm_inference', budget: { ...initialDesign.budget, max_runs: 30 }, maxRunsTouched: true }).max_runs).toBe(30);
  });
});
