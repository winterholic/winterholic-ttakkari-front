import type { AdapterId } from '../types';

interface Props { adapterId: AdapterId | string; inputs: Record<string, unknown>; onChange: (next: Record<string, unknown>) => void }

const num = (v: string) => (v === '' ? undefined : Number(v));

/** 실행기가 받는 입력(프롬프트·평가셋·문장). 방법 파라미터와 달리 한 실험 안에서 모든 설정이 같은 입력을 쓴다. */
export function AdapterInputs({ adapterId, inputs, onChange }: Props) {
  const set = (k: string, v: unknown) => onChange({ ...inputs, [k]: v });
  if (adapterId === 'llm_inference') return <div className="rs-form">
    <div className="tk-field"><label className="tk-label" htmlFor="in-prompt">벤치마크 프롬프트</label>
      <textarea id="in-prompt" className="tk-textarea" rows={5} maxLength={8000} value={String(inputs.prompt ?? '')} onChange={e => set('prompt', e.target.value)} placeholder="모든 설정이 같은 프롬프트로 측정됩니다. 최대 8,000자." />
      <p className="tk-help">{String(inputs.prompt ?? '').length.toLocaleString('ko-KR')} / 8,000자</p></div>
    <div className="rs-form__grid">
      <div className="tk-field"><label className="tk-label" htmlFor="in-np">생성 토큰 수</label><input id="in-np" className="tk-input" type="number" min={1} max={512} value={String(inputs.n_predict ?? '')} placeholder="128" onChange={e => set('n_predict', num(e.target.value))} /><p className="tk-help">1~512, 기본 128</p></div>
      <div className="tk-field"><label className="tk-label" htmlFor="in-temp">temperature</label><input id="in-temp" className="tk-input" type="number" min={0} max={2} step={0.1} value={String(inputs.temperature ?? '')} placeholder="0" onChange={e => set('temperature', num(e.target.value))} /><p className="tk-help">0~2, 기본 0 (결정적)</p></div>
      <div className="tk-field"><label className="tk-label" htmlFor="in-rep">설정당 내부 반복</label><input id="in-rep" className="tk-input" type="number" min={1} max={5} value={String(inputs.repetitions ?? '')} placeholder="2" onChange={e => set('repetitions', num(e.target.value))} /><p className="tk-help">1~5, 중앙값으로 보고됩니다</p></div>
    </div></div>;
  if (adapterId === 'retrieval_eval') return <div className="rs-form">
    <div className="tk-field"><label className="tk-label" htmlFor="in-preset">평가셋 프리셋 <span className="tk-label__optional">선택</span></label><input id="in-preset" className="tk-input tk-input--mono" value={String(inputs.preset_id ?? '')} onChange={e => set('preset_id', e.target.value)} placeholder="비우면 서버의 내장 한국어 기술문서 평가셋" />
      <p className="tk-help">코퍼스 500문서·질의 50개 이하. 직접 입력은 고급 탭(JSON)에서 corpus·queries 로 넣을 수 있습니다.</p></div></div>;
  if (adapterId === 'tts_synthesis') return <div className="rs-form">
    <div className="tk-field"><label className="tk-label" htmlFor="in-tpreset">평가 문장 프리셋</label><input id="in-tpreset" className="tk-input tk-input--mono" value={String(inputs.preset_id ?? 'ko_mixed_pronunciation_v1')} onChange={e => set('preset_id', e.target.value)} />
      <p className="tk-help">숫자·영문 약어·단위가 섞인 내장 한국어 문장셋입니다.</p></div>
    <div className="tk-field"><label className="tk-label" htmlFor="in-texts">직접 입력한 문장 <span className="tk-label__optional">선택 · 한 줄에 하나, 최대 20문장</span></label>
      <textarea id="in-texts" className="tk-textarea" rows={4} value={Array.isArray(inputs.texts) ? (inputs.texts as string[]).join('\n') : ''} onChange={e => set('texts', e.target.value ? e.target.value.split('\n').filter(Boolean).slice(0, 20) : undefined)} placeholder="입력하면 프리셋 대신 이 문장으로 비교합니다" /></div></div>;
  return <p className="rs-muted">외부 결과 등록은 실행 입력이 없습니다. 실험을 만든 뒤 모니터 화면에서 측정값을 입력하세요.</p>;
}
