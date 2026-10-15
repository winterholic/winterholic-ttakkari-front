import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { createChecklistItem, createChecklistTemplate, deleteChecklistItem, deleteChecklistTemplate,
  listChecklist, listChecklistTemplates, patchChecklistItem, patchChecklistTemplate } from "../api/client";
import type { ChecklistItem, ChecklistTemplate } from "../api/client";
import { useForegroundResync } from "../hooks/useForegroundResync";
import { PageHeader } from "../shell/PageHeader";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Dialog } from "../ui/Dialog";
import "./checklists.css";

function seoulDay() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function shiftDay(day: string, amount: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}
function validDay(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function dayLabel(day: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "UTC", month: "long", day: "numeric", weekday: "long" }).format(new Date(`${day}T12:00:00Z`));
}
type Target = { id: string; title: string; fixed: boolean };

export function ChecklistsPage() {
  const [params, setParams] = useSearchParams();
  const [today, setToday] = useState(seoulDay);
  useEffect(() => {
    const t = window.setInterval(() => setToday(seoulDay()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const requested = params.get("date");
  // 기본 진입은 보기 전용 조회 화면이다. 편집(mode=edit)이나 날짜별 조회(date=)로 들어갈 때만 관리 컨트롤을 연다.
  const modeEdit = params.get("mode") === "edit";
  const manage = modeEdit || params.has("date");
  const day = manage && validDay(requested) ? requested : today;
  const [fixed, setFixed] = useState(false);
  const [title, setTitle] = useState("");
  const [edit, setEdit] = useState<Target | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [remove, setRemove] = useState<Target | null>(null);
  const qc = useQueryClient();
  useForegroundResync(() => { setToday(seoulDay()); void qc.invalidateQueries({ queryKey: ["checklists"] }); });
  const daily = useQuery({ queryKey: ["checklists", "daily", day], queryFn: () => listChecklist(day), refetchInterval: 30_000 });
  const templates = useQuery({ queryKey: ["checklists", "templates"], queryFn: listChecklistTemplates, enabled: manage && fixed, refetchInterval: 30_000 });
  const mutation = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklists"] }),
  });
  const busy = mutation.isPending;
  const showFixed = manage && fixed;
  const query = showFixed ? templates : daily;
  const items: (ChecklistItem | ChecklistTemplate)[] = showFixed ? templates.data?.templates ?? [] : daily.data?.items ?? [];
  const changeDate = (value: string) => {
    if (!validDay(value)) return;
    setTitle(""); mutation.reset();
    setParams(prev => { const next = new URLSearchParams(prev); next.set("date", value); return next; });
  };
  const changeTab = (value: boolean) => { setFixed(value); setTitle(""); mutation.reset(); };
  const go = (next: Record<string, string>) => { setFixed(false); setTitle(""); mutation.reset(); setParams(new URLSearchParams(next)); };
  const run = (fn: () => Promise<unknown>, success?: () => void) => mutation.mutate(fn, { onSuccess: success });
  return (
    <div className="tk-screen">
      <PageHeader title="체크리스트" />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--md checklist-page">
          {!manage ? <section className="checklist-view" aria-label="오늘 체크리스트">
            <header className="checklist-hero">
              <p className="checklist-hero__day">{dayLabel(today)}</p>
              {daily.data ? <>
                <p className="checklist-hero__count" aria-live="polite"><strong>{daily.data.completed}</strong> / {daily.data.total} 완료</p>
                <progress aria-label="완료 현황" value={daily.data.completed} max={daily.data.total || 1} />
                <p className="checklist-hero__hint">{daily.data.total === 0 ? "오늘 항목이 아직 없어요" : daily.data.completed === daily.data.total ? "모두 체크했어요" : `${daily.data.total - daily.data.completed}개 남았어요`}</p>
              </> : <p className="checklist-hero__hint">오늘 할 일을 확인하는 중이에요</p>}
            </header>
            {mutation.isError && <p className="checklist-error" role="alert">저장하지 못했어요. {mutation.error.message}</p>}
            {daily.isPending ? <p role="status" className="checklist-note">불러오는 중…</p> : daily.isError ? <div role="alert" className="checklist-state"><p>목록을 불러오지 못했어요. {daily.error.message}</p><Button onClick={() => void daily.refetch()}>다시 시도</Button></div> : daily.data.items.length === 0 ? <div className="checklist-state"><p>아직 항목이 없어요. 오늘 할 일을 추가해 보세요.</p><Button variant="primary" onClick={() => go({ mode: "edit" })}>항목 추가하기</Button></div> : <ul className="checklist-cards">
              {daily.data.items.map(item => <li key={item.id} className="checklist-card" data-checked={item.checked || undefined}>
                <label className="tk-checkbox checklist-card__label">
                  <input type="checkbox" checked={item.checked} disabled={busy} onChange={e => { const checked = e.currentTarget.checked; run(() => patchChecklistItem(item.id, { checked })); }} />
                  <span>{item.title}</span>
                </label>
                {item.template_id && <span className="checklist-fixed" title="고정 항목에서 추가됨"><Icon name="pin" /><span className="tk-sr-only">고정 항목</span></span>}
              </li>)}
            </ul>}
            <nav className="checklist-actions" aria-label="체크리스트 관리">
              <Button onClick={() => go({ mode: "edit" })}><Icon name="new-chat" />편집</Button>
              <Button onClick={() => go({ date: today })}><Icon name="calendar" />날짜별 조회</Button>
            </nav>
          </section> : <>
          <div className="checklist-mode">
            <Button disabled={busy} onClick={() => go({})}><Icon name="back" />조회로</Button>
            <h2 className="checklist-mode__title">{modeEdit ? "편집" : "날짜별 조회"}</h2>
          </div>
          <div className="tk-button-group" role="tablist" aria-label="체크리스트 종류" onKeyDown={e => {
            if (busy || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
            e.preventDefault();
            const next = e.key === "Home" ? false : e.key === "End" ? true : !fixed;
            changeTab(next); document.getElementById(next ? "fixed-tab" : "daily-tab")?.focus();
          }}>
            <Button role="tab" id="daily-tab" aria-controls="checklist-panel" aria-selected={!fixed} tabIndex={fixed ? -1 : 0} variant={!fixed ? "primary" : "ghost"} disabled={busy} onClick={() => changeTab(false)}>매일 체크</Button>
            <Button role="tab" id="fixed-tab" aria-controls="checklist-panel" aria-selected={fixed} tabIndex={fixed ? 0 : -1} variant={fixed ? "primary" : "ghost"} disabled={busy} onClick={() => changeTab(true)}>고정 항목</Button>
          </div>
          <section id="checklist-panel" role="tabpanel" aria-labelledby={fixed ? "fixed-tab" : "daily-tab"} className="checklist-panel">
            {fixed ? <p className="checklist-note">매일 미체크 상태로 추가할 항목입니다. 새 항목은 오늘부터 적용되고, 수정·삭제해도 이미 만들어진 날짜별 기록은 유지됩니다.</p> : <>
              <div className="checklist-date">
                <IconButton aria-label="이전 날짜" disabled={busy} onClick={() => changeDate(shiftDay(day, -1))}><Icon name="chevron-left" /></IconButton>
                <input className="tk-input" aria-label="체크 날짜" type="date" value={day} disabled={busy} onChange={e => changeDate(e.target.value)} />
                <IconButton aria-label="다음 날짜" disabled={busy} onClick={() => changeDate(shiftDay(day, 1))}><Icon name="chevron-right" /></IconButton>
                <Button disabled={busy} onClick={() => { setTitle(""); mutation.reset(); setParams(prev => { const next = new URLSearchParams(prev); next.set("date", today); return next; }); }}>오늘</Button>
              </div>
              <p className="checklist-note">한국시간 07:30에 하루를 시작하는 알림을 보내요. 12·16·20·22시에는 미완료 항목이 있을 때 알려드려요.</p>
              {day > today && <p className="checklist-note">고정 항목은 해당 날짜가 되면 추가됩니다.</p>}
              {daily.data && <div className="checklist-progress" aria-live="polite"><span>{daily.data.completed} / {daily.data.total} 완료</span>
                <progress aria-label="완료 현황" value={daily.data.completed} max={daily.data.total || 1} />
                {daily.data.total > 0 && daily.data.completed === daily.data.total && <span>모두 체크했어요</span>}
              </div>}
            </>}
            <form className="checklist-add" onSubmit={e => { e.preventDefault(); const value = title.trim(); if (!value || busy) return;
              run(() => fixed ? createChecklistTemplate(value) : createChecklistItem({ title: value, day }), () => setTitle("")); }}>
              <label className="tk-field"><span className="tk-label">새 항목</span><input className="tk-input" aria-label="새 항목" value={title} maxLength={300} required disabled={busy} placeholder={fixed ? "매일 반복할 일" : "이날 해야 할 일"} onChange={e => setTitle(e.target.value)} /></label>
              <Button type="submit" variant="primary" busy={busy} disabled={!title.trim()}>추가</Button>
            </form>
            {mutation.isError && <p className="checklist-error" role="alert">저장하지 못했어요. {mutation.error.message}</p>}
            {query.isPending ? <p role="status">불러오는 중…</p> : query.isError ? <div role="alert"><p>목록을 불러오지 못했어요. {query.error.message}</p><Button onClick={() => void query.refetch()}>다시 시도</Button></div> : <>
              {items.length === 0 ? <p className="checklist-note">{fixed ? "매일 반복할 항목을 추가해 보세요." : "아직 항목이 없어요. 오늘 할 일을 추가해 보세요."}</p> : <ul className="checklist-list">
                {items.map(item => <li key={item.id} className="checklist-row">
                  {"checked" in item ? <label className="tk-checkbox checklist-row__title" data-checked={item.checked || undefined}>
                    <input type="checkbox" checked={item.checked} disabled={busy} onChange={e => { const checked = e.currentTarget.checked; run(() => patchChecklistItem(item.id, { checked })); }} />
                    <span>{item.title}</span>
                  </label> : <span className="checklist-row__title">{item.title}</span>}
                  {"template_id" in item && item.template_id && <span className="checklist-fixed" title="고정 항목에서 추가됨"><Icon name="pin" /><span className="tk-sr-only">고정 항목</span></span>}
                  <IconButton aria-label={`${item.title} 수정`} disabled={busy} onClick={() => { mutation.reset(); setEdit({ ...item, fixed }); setEditTitle(item.title); }}><Icon name="new-chat" /></IconButton>
                  <IconButton aria-label={`${item.title} 삭제`} disabled={busy} onClick={() => { mutation.reset(); setRemove({ ...item, fixed }); }}><Icon name="trash" /></IconButton>
                </li>)}
              </ul>}
            </>}
          </section>
          </>}
        </div>
      </div>
      <Dialog open={!!edit} onClose={() => { if (!busy) setEdit(null); }} title="항목 수정" modal={busy ? "strict" : true}>
        <form className="checklist-edit" onSubmit={e => { e.preventDefault(); if (!edit || !editTitle.trim() || busy) return;
          const target = edit; run(() => target.fixed ? patchChecklistTemplate(target.id, editTitle.trim()) : patchChecklistItem(target.id, { title: editTitle.trim() }), () => setEdit(null)); }}>
          <label className="tk-field"><span className="tk-label">항목 이름</span><input className="tk-input" aria-label="항목 이름" required maxLength={300} value={editTitle} disabled={busy} onChange={e => setEditTitle(e.target.value)} /></label>
          {mutation.isError && <p role="alert">{mutation.error.message}</p>}
          <div className="tk-button-group tk-button-group--end"><Button disabled={busy} onClick={() => setEdit(null)}>취소</Button><Button type="submit" variant="primary" busy={busy} disabled={!editTitle.trim()}>저장</Button></div>
        </form>
      </Dialog>
      <Dialog open={!!remove} onClose={() => { if (!busy) setRemove(null); }} title="항목 삭제" modal={busy ? "strict" : true}>
        <div className="checklist-edit"><p>‘{remove?.title}’ 항목을 삭제할까요?</p><p className="checklist-note">{remove?.fixed ? "앞으로 반복하지 않습니다. 이미 만들어진 날짜별 기록은 유지돼요." : "선택한 날짜에서만 삭제합니다. 고정 항목은 계속 반복돼요."}</p>
          {mutation.isError && <p role="alert">{mutation.error.message}</p>}
          <div className="tk-button-group tk-button-group--end"><Button disabled={busy} onClick={() => setRemove(null)}>취소</Button><Button variant="danger" busy={busy} onClick={() => { if (!remove || busy) return; const target = remove; run(() => target.fixed ? deleteChecklistTemplate(target.id) : deleteChecklistItem(target.id), () => setRemove(null)); }}>삭제</Button></div>
        </div>
      </Dialog>
    </div>
  );
}
