import { useState } from 'react';
import { Button } from '../../../ui/Button';
import { Badge } from '../../../ui/Badge';
import { toast } from '../../../ui/toastStore';
import { downloadLink, moveArtifact } from '../../../api/client';
import { useBlobUrl } from '../../../features/viewer/hooks';
import type { ResearchArtifact } from '../types';

const ROLE: Record<string, string> = { audio_sample: '음성 샘플', benchmark_table: '측정 표', config_snapshot: '설정 스냅샷', report_markdown: '리포트', raw_log: '원본 로그', input_dataset: '입력 데이터' };

/** 음성은 자동 재생하지 않는다. 눌러야 내려받고, 받은 뒤 재생 막대가 나온다(청취 비교는 사람이 직접 한다). */
export function ArtifactAudio({ artifactId, label }: { artifactId: string; label: string }) {
  const [on, setOn] = useState(false);
  const blob = useBlobUrl(artifactId, 'original', on);
  return <div className="rs-audio">
    {!on && <Button size="sm" onClick={() => setOn(true)} aria-label={`${label} 음성 불러오기`}>▶ 음성 불러오기</Button>}
    {on && blob.isLoading && <span className="rs-muted">음성을 받는 중…</span>}
    {on && blob.error && <span className="rs-reason">음성을 불러오지 못했습니다. <Button size="xs" variant="ghost" onClick={() => void blob.refetch()}>다시 시도</Button></span>}
    {on && blob.url && <audio src={blob.url} controls preload="metadata" aria-label={label} />}
  </div>;
}

export function ArtifactList({ artifacts, onChanged }: { artifacts: ResearchArtifact[]; onChanged?: () => void }) {
  if (!artifacts.length) return <p className="rs-muted">연결된 결과물이 없습니다.</p>;
  async function open(id: string) {
    try { const l = await downloadLink(id); window.open(l.url, '_blank', 'noopener'); } catch { toast({ message: '파일을 열지 못했습니다.', tone: 'danger' }); }
  }
  async function keep(id: string) {
    try { await moveArtifact(id, 'files'); toast({ message: '파일 보관함에 보관했습니다.', tone: 'success' }); onChanged?.(); } catch { toast({ message: '보관함으로 옮기지 못했습니다.', tone: 'danger' }); }
  }
  return <ul className="rs-artifacts">{artifacts.map(a => <li key={a.id}>
    <div className="rs-artifacts__head"><strong>{a.label}</strong><Badge>{ROLE[a.role] ?? a.role}</Badge>{a.promoted_to_library && <Badge tone="success">보관함에 보관됨</Badge>}</div>
    {a.role === 'audio_sample' && <ArtifactAudio artifactId={a.artifact_id} label={a.label} />}
    <div className="rs-actions"><Button size="xs" onClick={() => void open(a.artifact_id)}>열기·내려받기</Button>{!a.promoted_to_library && <Button size="xs" variant="ghost" onClick={() => void keep(a.artifact_id)}>파일 보관함에 보관</Button>}</div>
  </li>)}</ul>;
}
