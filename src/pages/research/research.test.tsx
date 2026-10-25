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
import { deriveSeries, narrate, paretoFor, stats } from './series';
import type { ExperimentDetail, ParamSpec } from './types';

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
    expect(await screen.findByText(/▲ \+25\.0% 개선/)).toBeTruthy();
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
