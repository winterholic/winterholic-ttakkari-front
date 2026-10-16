import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const h = vi.hoisted(()=>({status:vi.fn(),list:vi.fn(),review:vi.fn(),recall:vi.fn(),correct:vi.fn(),details:vi.fn()}));
vi.mock('../../api/client',async(orig)=>({...await orig<typeof import('../../api/client')>(),
 knowledgeStatus:h.status, knowledgeAssertions:h.list, knowledgeReview:h.review,
 knowledgeRecall:h.recall, knowledgeCorrect:h.correct,knowledgeAssertion:h.details}));
import { KnowledgeTab } from './KnowledgeTab';
const claim={id:'a',version:1,subject:'따까리',predicate:'uses',object:'디자인 시스템',state:'candidate',
 review_level:'candidate',modality:'proposal',polarity:false,valid_from:null,valid_to:null,
 evidence:[{id:'u',quote:'시스템을 검토하자.',speaker:'assistant',locator:'/source#message',revision_sha256:'abc',
 revision_id:'r',start:0,end:11,event_time:null,active_branch:true}],
 history:[{version:1,actor:'system',state:'candidate',review_level:'candidate',reason:'추출 후보',recorded_at:'2026-10-16T00:00:00Z'}]};
function mount(scope:'all'|'work'='all'){
 h.status.mockResolvedValue({counts:{revisions:1,units:1,assertion_states:{candidate:1}},scope});
 h.list.mockResolvedValue({items:[claim]});
 return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><KnowledgeTab scope={scope}/></QueryClientProvider>);
}
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('shows exact evidence, negation and assistant provenance without calling it user-confirmed',async()=>{
 mount('work');expect(await screen.findByText('시스템을 검토하자.')).toBeTruthy();
 expect(screen.getByText('부정')).toBeTruthy();expect(screen.getByText('제안')).toBeTruthy();
 expect(screen.getByText(/^에이전트 ·/)).toBeTruthy();expect(h.list).toHaveBeenCalledWith('work','candidate',0);
 expect(screen.getByText(/전체 지식 보존율은 아직 측정하지/)).toBeTruthy();
});
it('requires a review reason and sends the observed version; stale conflict stays visible',async()=>{
 h.review.mockRejectedValue(new Error('다른 검토가 먼저 반영됐습니다. 새로고침해 주세요.'));
 mount();await screen.findByText('시스템을 검토하자.');
 fireEvent.click(screen.getByRole('button',{name:'사용자 확인'}));
 expect(h.review).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('검토 사유'),{target:{value:'원문과 대조함'}});
 fireEvent.click(screen.getByRole('button',{name:'사용자 확인'}));
 await waitFor(()=>expect(h.review).toHaveBeenCalledWith('a',1,'active','원문과 대조함'));
 expect(await screen.findByText(/다른 검토가 먼저/)).toBeTruthy();
});
it('does not show old scope evidence while a new scope is loading',async()=>{
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 h.status.mockResolvedValue({counts:{revisions:1,units:1,assertion_states:{}},scope:'all'});
 h.list.mockImplementation((scope:string)=>scope==='all'?Promise.resolve({items:[claim]}):new Promise(()=>{}));
 const view=render(<QueryClientProvider client={qc}><KnowledgeTab scope="all"/></QueryClientProvider>);
 await screen.findByText('시스템을 검토하자.');
 view.rerender(<QueryClientProvider client={qc}><KnowledgeTab scope="work"/></QueryClientProvider>);
 await waitFor(()=>expect(h.list).toHaveBeenCalledWith('work','candidate',0));
 expect(screen.queryByText('시스템을 검토하자.')).toBeNull();
 expect(screen.getByText('주장 불러오는 중…')).toBeTruthy();
});

it('loads authoritative history before reviewing a compact search result',async()=>{
 h.recall.mockResolvedValue({assertions:[{...claim,history:undefined}],evidence:[]});
 h.details.mockResolvedValue(claim);
 mount('work');await screen.findByText('시스템을 검토하자.');
 fireEvent.change(screen.getByRole('textbox',{name:'검색어'}),{target:{value:'디자인'}});
 fireEvent.click(screen.getByRole('button',{name:'찾기'}));
 fireEvent.click(await screen.findByRole('button',{name:'근거·검토 이력 보기'}));
 await waitFor(()=>expect(h.details).toHaveBeenCalledWith('a','work'));
});
