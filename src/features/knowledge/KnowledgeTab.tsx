import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { knowledgeAssertion, knowledgeAssertions, knowledgeCorrect, knowledgeRecall, knowledgeReview, knowledgeStatus } from '../../api/client';
import type { LibScope } from '../../api/client';
import { LibError, Section, Stat, when } from '../contextlib/shared';
import type { Assertion, SearchAssertion } from './types';
import './knowledge.css';

const STATE:Record<string,string>={candidate:'검토 전',active:'사용 중',disputed:'판단 보류',superseded:'정정됨',retracted:'철회됨'};
const MODALITY:Record<string,string>={fact:'사실',proposal:'제안',question:'질문',inference:'추론',decision:'결정',preference:'선호'};
const SPEAKER:Record<string,string>={user:'사용자',assistant:'에이전트',system:'시스템',document:'문서',tool:'도구'};
const RELATION:Record<string,string>={uses:'사용',works_on:'참여',informs_design_of:'설계에 영향을 줌',evolved_into:'발전',prefers:'선호',depends_on:'의존'};
const LEVEL:Record<string,string>={candidate:'미검토',source_reviewed:'에이전트 원문 대조',user_confirmed:'사용자 확인'};

function Claim({item,onSaved}:{item:Assertion;onSaved:()=>void}){
 const [reason,setReason]=useState('');
 const [editing,setEditing]=useState(false);
 const [subject,setSubject]=useState(item.subject),[predicate,setPredicate]=useState(item.predicate),[object,setObject]=useState(item.object);
 const [validation,setValidation]=useState('');
 const change=useMutation({mutationFn:async(state:string)=>{
  if(!reason.trim())throw new Error('검토 사유를 입력해 주세요.');
  if(state==='correct'){
   const e=item.evidence[0];
   return knowledgeCorrect(item.id,item.version,reason,{unit_id:e.id,start:e.start,end:e.end,quote:e.quote,
    subject,predicate,object,modality:item.modality,polarity:item.polarity,valid_from:item.valid_from,valid_to:item.valid_to});
  }
  return knowledgeReview(item.id,item.version,state,reason);
 },onSuccess:()=>{setReason('');setEditing(false);onSaved();}});
 const save=(state:string)=>{if(!reason.trim()){setValidation('검토 사유를 입력해 주세요.');return;}setValidation('');change.mutate(state);};
 const closed=['superseded','retracted'].includes(item.state);
 return <article className="kn-claim" aria-label={`${item.subject} ${item.predicate} ${item.object}`}>
  <div className="kn-badges"><span className="tk-badge">{STATE[item.state]??item.state}</span><span className="tk-badge">{MODALITY[item.modality]??item.modality}</span>{!item.polarity&&<span className="tk-badge">부정</span>}<span className="cl-note">{LEVEL[item.review_level]} · v{item.version}</span></div>
  <h3 className="kn-title">{item.subject} <span>{RELATION[item.predicate]??item.predicate.replaceAll('_',' ')}</span> {item.object}</h3>
  {(item.valid_from||item.valid_to)&&<p className="cl-note">유효 기간 {when(item.valid_from)} → {when(item.valid_to)}</p>}
  {item.evidence.map(e=><div className="kn-source" key={`${e.id}:${e.start}`}>
   <blockquote>{e.quote}</blockquote>
   <p className="cl-note">{SPEAKER[e.speaker]??e.speaker} · {when(e.event_time)} · {e.active_branch===true?'현재 분기':e.active_branch===false?'이전 분기':'분기 미확인'}</p>
   <details><summary>출처와 원문 해시</summary><p className="kn-path">{e.locator}</p><p className="kn-path">SHA-256 {e.revision_sha256}</p><p className="cl-note">문자 위치 {e.start}–{e.end}</p></details>
  </div>)}
  <details className="kn-history"><summary>검토·정정 이력 {item.history.length}건</summary><ol>{item.history.map(v=><li key={v.version}><strong>v{v.version} · {STATE[v.state]}</strong><p>{v.reason}</p><small>{v.actor} · {LEVEL[v.review_level]} · {when(v.recorded_at)}</small></li>)}</ol></details>
  {!closed&&<div className="kn-review">
   <label htmlFor={`reason-${item.id}`}>검토 사유</label><textarea className="tk-input" id={`reason-${item.id}`} rows={2} value={reason} onChange={e=>setReason(e.target.value)} placeholder="원문을 보고 어떤 판단을 했는지 남겨 주세요."/>
   {editing&&<div className="kn-edit"><p className="cl-note">같은 원문의 해석을 정정합니다. 새 사실은 새 원문 근거가 필요합니다.</p>{[['주어',subject,setSubject],['관계',predicate,setPredicate],['대상',object,setObject]].map(([label,value,setter])=><label key={label as string}>{label as string}<input className="tk-input" value={value as string} onChange={e=>(setter as (v:string)=>void)(e.target.value)}/></label>)}</div>}
   <div className="kn-actions"><button className="tk-button tk-button--primary" disabled={change.isPending} onClick={()=>save(editing?'correct':'active')}>{editing?'정정 반영':'사용자 확인'}</button><button className="tk-button" disabled={change.isPending} onClick={()=>save('disputed')}>판단 보류</button><button className="tk-button" disabled={change.isPending} onClick={()=>setEditing(!editing)}>{editing?'정정 취소':'해석 정정'}</button><button className="tk-button" disabled={change.isPending} onClick={()=>save('retracted')}>철회</button></div>
   {(validation||change.error)&&<p role="alert" className="kn-error">{validation||change.error?.message}</p>}
  </div>}
 </article>;
}

function SearchClaim({item,scope,onSaved}:{item:SearchAssertion;scope:LibScope;onSaved:()=>void}){
 const [open,setOpen]=useState(false);
 const detail=useQuery({queryKey:['knowledge','assertion',scope,item.id],queryFn:()=>knowledgeAssertion(item.id,scope),enabled:open});
 if(detail.data)return <Claim item={detail.data} onSaved={onSaved}/>;
 return <article className="kn-claim"><h3 className="kn-title">{item.subject} · {RELATION[item.predicate]??item.predicate.replaceAll('_',' ')} · {item.object}</h3>
  <p className="cl-note">{STATE[item.state]} · {LEVEL[item.review_level]} · {MODALITY[item.modality]}{!item.polarity?' · 부정':''}</p>
  {item.evidence.map(e=><blockquote className="kn-source" key={`${e.id}:${e.start}`}>{e.quote}</blockquote>)}
  <button className="tk-button" disabled={detail.isFetching} onClick={()=>setOpen(true)}>근거·검토 이력 보기</button>
  {detail.isFetching&&<p role="status">검토 이력 불러오는 중…</p>}
  {detail.error&&<LibError error={detail.error} what="검토 이력" onRetry={()=>void detail.refetch()}/>}
 </article>;
}

export function KnowledgeTab({scope}:{scope:LibScope}){
 const qc=useQueryClient();const [state,setState]=useState('candidate'),[offset,setOffset]=useState(0),[text,setText]=useState(''),[query,setQuery]=useState('');
 const status=useQuery({queryKey:['knowledge','status',scope],queryFn:()=>knowledgeStatus(scope)});
 const list=useQuery({queryKey:['knowledge','assertions',scope,state,offset],queryFn:()=>knowledgeAssertions(scope,state,offset)});
 const search=useQuery({queryKey:['knowledge','recall',scope,query],queryFn:()=>knowledgeRecall(query,scope),enabled:!!query});
 const refresh=()=>{void qc.invalidateQueries({queryKey:['knowledge']});};
 return <div className="kn-page">
  <Section id="kn-summary" title="원문에서 주장까지" hint="전체 지식 보존율은 아직 측정하지 않았습니다. 아래 숫자는 이 원장에 가져온 자료와 검토 상태만 뜻합니다.">
   {status.isPending?<p role="status">집계 불러오는 중…</p>:status.error?<LibError error={status.error} what="근거 집계" onRetry={()=>void status.refetch()}/>:status.data&&<div className="cl-stats"><Stat label="원문 버전" value={status.data.counts.revisions}/><Stat label="원문 단위" value={status.data.counts.units}/><Stat label="검토 전" value={status.data.counts.assertion_states.candidate??0}/><Stat label="사용 중" value={status.data.counts.assertion_states.active??0}/></div>}
  </Section>
  <Section id="kn-search" title="원문·관계 찾기" hint="검토 전 후보는 확정된 관계로 검색되지 않습니다. 원문은 별도로 찾아볼 수 있습니다.">
   <form className="kn-search" onSubmit={e=>{e.preventDefault();setQuery(text.trim());}}><label className="kn-search__field">검색어<input className="tk-input" value={text} onChange={e=>setText(e.target.value)} placeholder="프로젝트, 진로, 결정의 맥락"/></label><button className="tk-button" disabled={!text.trim()||search.isFetching}>찾기</button></form>
   {query&&<div aria-live="polite">{search.isPending?<p role="status">근거 찾는 중…</p>:search.error?<LibError error={search.error} what="근거 검색" onRetry={()=>void search.refetch()}/>:search.data&&<><p className="cl-note">검토된 관계 {search.data.assertions.length}건 · 원문 {search.data.evidence.length}건</p>{search.data.assertions.map(a=><SearchClaim key={a.id} item={a} scope={scope} onSaved={refresh}/>)}{search.data.evidence.map(e=><details className="kn-source" key={e.id}><summary>{e.body.slice(0,100)}</summary><blockquote>{e.body}</blockquote><p className="cl-note kn-path">{SPEAKER[e.speaker]??e.speaker} · {e.locator}</p></details>)}{!search.data.assertions.length&&!search.data.evidence.length&&<p>이 범위에서 일치하는 근거를 찾지 못했습니다.</p>}</>}</div>}
  </Section>
  <Section id="kn-review" title="관계 검토" hint="에이전트의 원문 대조와 사용자의 확인을 구분합니다. 정정·철회 이력은 원문과 함께 남습니다.">
   <label className="kn-filter">검토 상태<select className="tk-input" value={state} onChange={e=>{setState(e.target.value);setOffset(0);}}>{Object.entries(STATE).map(([v,label])=><option key={v} value={v}>{label}</option>)}<option value="">전체</option></select></label>
   {list.isPending?<p role="status">주장 불러오는 중…</p>:list.error?<LibError error={list.error} what="관계 후보" onRetry={()=>void list.refetch()}/>:<>{!list.data?.items.length&&<p className="cl-note">이 상태의 관계가 없습니다. 가져온 원문의 추출·검토가 끝났다는 뜻은 아닙니다.</p>}{list.data?.items.map(a=><Claim key={`${a.id}:${a.version}`} item={a} onSaved={refresh}/>)}</>}
   <nav className="kn-actions" aria-label="관계 목록 페이지"><button className="tk-button" disabled={!offset||list.isFetching} onClick={()=>setOffset(Math.max(0,offset-30))}>이전</button><span className="cl-note">{Math.floor(offset/30)+1}페이지</span><button className="tk-button" disabled={list.isFetching||(list.data?.items.length??0)<30} onClick={()=>setOffset(offset+30)}>다음</button></nav>
  </Section>
 </div>;
}
