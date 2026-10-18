import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { connectRemoteMac, listRemoteMacs, registerRemoteMac } from '../api/client';
import type { RemoteMac, RemotePermit } from '../api/client';
import { RemoteSession } from '../features/remote-desktop/RemoteSession';
import { PageHeader } from '../shell/PageHeader';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import './remote-desktop.css';

export function RemoteDesktopPage() {
  const query = useQuery({ queryKey: ['remote-macs'], queryFn: listRemoteMacs });
  const qc = useQueryClient();
  const [selected, setSelected] = useState<RemoteMac | null>(null);
  const [session, setSession] = useState<RemotePermit | null>(null);
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [macPassword, setMacPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState(false);
  async function connect(e: FormEvent) {
    e.preventDefault();
    if (!selected || busy) return;
    setBusy(true); setError('');
    try { setSession(await connectRemoteMac(selected.id, { password })); setPassword(''); }
    catch (e) { setError(e instanceof Error ? e.message : '접속 허가를 받지 못했습니다.'); }
    finally { setBusy(false); }
  }
  function leave() { setSession(null); setPassword(''); setMacPassword(''); }
  return <div className="tk-screen remote-page">
    <PageHeader title="원격 데스크톱" />
    <div className="tk-screen__body"><div className="tk-container tk-container--md remote-home">
      <p>Mac 화면을 열고, 손가락을 트랙패드처럼 움직여 조작하세요.</p>
      {query.isPending && <p role="status">등록된 Mac을 불러오는 중…</p>}
      {query.error && <p role="alert">{query.error.message} <Button onClick={() => void query.refetch()}>다시 시도</Button></p>}
      <div className="remote-devices">
        {query.data?.devices.map(d => <article className="remote-device" key={d.id}>
          <Icon name="server" /><div><strong>{d.name}</strong><p>{d.host === '127.0.0.1' ? '따까리가 실행되는 Mac' : '등록된 원격 Mac'}</p></div>
          <Button aria-label={`${d.name}에 접속`} onClick={() => { setSelected(d); setError(''); }} variant="primary">접속</Button>
        </article>)}
        {query.data?.devices.length === 0 && <p>등록된 Mac이 없습니다. Mac 추가에서 연결할 기기를 등록하세요.</p>}
      </div>
      <Button onClick={() => setAdd(!add)} aria-expanded={add}>Mac 추가</Button>
      {add && <AddMac onSaved={() => { setAdd(false); void qc.invalidateQueries({ queryKey: ['remote-macs'] }); }} />}
      {selected && !session && <form className="remote-connect" onSubmit={e => void connect(e)}>
        <h2>{selected.name}에 접속</h2>
        <label>따까리 비밀번호<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <p>원격 제어를 따로 허가합니다. 다음 두 칸에는 접속할 Mac의 계정을 입력하세요.</p>
        <label>Mac 계정 이름<input autoCapitalize="none" autoCorrect="off" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} placeholder="Mac 로그인 계정" /></label>
        <label>Mac 로그인 비밀번호<input type="password" autoComplete="off" required value={macPassword} onChange={e => setMacPassword(e.target.value)} /></label>
        <small>Mac 계정 이름을 비우면 VNC 전용 비밀번호로 인증합니다. 비밀번호는 저장하지 않습니다.</small>
        {error && <p role="alert">{error}</p>}
        <div className="remote-actions"><Button type="submit" busy={busy} variant="primary">화면 열기</Button><Button onClick={() => { setSelected(null); setPassword(''); setMacPassword(''); }}>취소</Button></div>
      </form>}
      <details className="remote-help"><summary>처음 연결하기</summary>
        <ol>
          <li>Mac의 시스템 설정 → 일반 → 공유 → 화면 공유를 켜고, 접속할 계정만 허용하세요. 원격 관리가 켜져 있다면 Apple 안내에 따라 둘 중 하나를 선택하세요.</li>
          <li>Mac Studio는 기본 목록에서 접속합니다. MacBook은 같은 LAN의 IP 또는 Tailscale의 100.x IP로 추가하세요.</li>
          <li>외부에서는 Mac과 따까리 서버 사이의 Tailscale 연결이 필요합니다. 아이폰에서 따까리를 여는 HTTPS 연결은 기존과 같습니다.</li>
        </ol>
        <p>화면 공유·보안 권한·방화벽은 자동으로 바꾸지 않습니다. 잠든 Mac을 깨우거나 전원이 꺼진 Mac을 켜지는 못합니다. 화면이 잠겨 있으면 Mac 로그인 화면에서 잠금을 해제하세요.</p>
        <p>한글은 키보드 도구에서 조합을 마친 뒤 전송합니다. Mac의 VNC 서버에 따라 Unicode 입력 지원이 달라 실제 Mac·아이폰 확인이 필요합니다.</p>
        <a href="https://support.apple.com/ko-kr/guide/mac-help/mh11848/mac" target="_blank" rel="noreferrer">Apple 화면 공유 설정 안내</a>
      </details>
    </div></div>
    {session && selected && <RemoteSession device={selected} initialPermit={session} credentials={{ username, password: macPassword }} onExit={leave} />}
  </div>;
}

function AddMac({ onSaved }: { onSaved: () => void }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try {
      await registerRemoteMac({ id: String(data.get('id')), name: String(data.get('name')), host: String(data.get('host')), port: Number(data.get('port')) }, String(data.get('password')));
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Mac을 등록하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <form className="remote-connect" onSubmit={e => void submit(e)}>
    <h2>Mac 추가</h2>
    <label>기기 이름<input name="name" placeholder="MacBook" required maxLength={60} /></label>
    <label>기기 ID<input name="id" placeholder="macbook" pattern="[a-z0-9][a-z0-9-]{0,39}" autoCapitalize="none" required /></label>
    <label>LAN 또는 Tailscale IP<input name="host" placeholder="100.x.x.x" autoCapitalize="none" required /></label>
    <label>화면 공유 포트<input name="port" type="number" defaultValue={5900} min={5900} max={5999} required /></label>
    <label>따까리 비밀번호<input name="password" type="password" autoComplete="current-password" required /></label>
    {error && <p role="alert">{error}</p>}<Button type="submit" busy={busy} variant="primary">등록</Button>
  </form>;
}
