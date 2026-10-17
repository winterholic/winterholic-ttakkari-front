import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link } from "react-router";
import { listNotifications, readAllNotifications, readNotification } from "../api/client";
import type { NotificationCategory, NotificationOut } from "../api/notificationTypes";
import { PushSettingsDialog } from "../features/push/PushSettings";
import { useForegroundResync } from "../hooks/useForegroundResync";
import { PageHeader } from "../shell/PageHeader";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/Icon";
import { toast } from "../ui/toastStore";
import "./notifications.css";
import { Art } from "../ui/Art";

type Category = NotificationCategory | "all";
const TABS: { id: Category; label: string; icon: IconName }[] = [
  { id: "all", label: "전체", icon: "important" },
  { id: "tasks", label: "작업", icon: "tasks" },
  { id: "assistant", label: "따까리", icon: "chat" },
  { id: "planner", label: "일정·할 일", icon: "calendar" },
  { id: "weather", label: "날씨", icon: "sun" },
  { id: "meetings", label: "회의록", icon: "mic" },
  { id: "system", label: "시스템", icon: "server" },
];
const dayFormat = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
const timeFormat = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" });

function NotificationRow({ item, busy, onRead }: { item: NotificationOut; busy: boolean; onRead: (id: number) => void }) {
  const tab = TABS.find(t => t.id === item.category)!;
  return (
    <li className="notification-row" data-unread={!item.read_at}>
      <Link to={item.url} className="notification-row__link" onClick={() => { if (!item.read_at) onRead(item.id); }}>
        <span className="notification-row__icon"><Icon name={tab.icon} /></span>
        <span className="notification-row__body">
          <span className="notification-row__meta">
            <span>{tab.label}</span>
            {!item.read_at && <span className="notification-row__unread">안 읽음</span>}
            <time dateTime={item.created_at} title={new Date(item.created_at).toLocaleString("ko-KR")}>{timeFormat.format(new Date(item.created_at))}</time>
          </span>
          <span className="notification-row__title">{item.title}</span>
          {item.body && <span className="notification-row__description">{item.body}</span>}
        </span>
        <Icon name="chevron-right" className="notification-row__chevron" />
      </Link>
      {!item.read_at && <Button variant="ghost" className="notification-row__read" disabled={busy} aria-label={`${item.title} 읽음 처리`} onClick={() => onRead(item.id)}>
        <Icon name="check" /><span>읽음</span>
      </Button>}
    </li>
  );
}

export function NotificationsPage() {
  const [category, setCategory] = useState<Category>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const qc = useQueryClient();
  const filterCategory = category === "all" ? undefined : category;
  const query = useInfiniteQuery({
    queryKey: ["notifications", category, unreadOnly],
    queryFn: ({ pageParam }) => listNotifications({ category: filterCategory, unread_only: unreadOnly, before: pageParam, limit: 30 }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: last => last.next_before ?? undefined,
    refetchInterval: 30_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  useForegroundResync(() => { void refresh(); });
  const onError = () => toast({ message: "읽음 처리를 저장하지 못했어요. 다시 시도해 주세요.", tone: "danger" });
  const read = useMutation({ mutationFn: (id: number) => readNotification(id), onSuccess: refresh, onError });
  const readAll = useMutation({ mutationFn: (body: Parameters<typeof readAllNotifications>[0]) => readAllNotifications(body), onSuccess: refresh, onError });
  const busy = read.isPending || readAll.isPending;
  const items = query.data?.pages.flatMap(p => p.items) ?? [];
  const counts = query.data?.pages[0]?.unread_counts;
  const tabsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    tabsRef.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [category, counts]);
  const selectedTab = TABS.find(t => t.id === category)!;
  const groups = new Map<string, NotificationOut[]>();
  for (const item of items) {
    const date = new Date(item.created_at).toLocaleDateString("en-CA");
    const group = groups.get(date) ?? [];
    group.push(item);
    groups.set(date, group);
  }

  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % TABS.length
      : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length
        : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setCategory(TABS[next].id);
    const target = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next];
    target?.focus();
  }

  return (
    <div className="tk-screen">
      <PageHeader title="알림" meta={counts?.all ? `안 읽은 알림 ${counts.all}개` : "따까리의 소식과 놓친 알림"}
        actions={<Button variant="ghost" className="notification-push-settings" onClick={() => setSettingsOpen(true)}><Icon name="settings" />푸시 설정</Button>} />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--thread notifications-page">
          <div ref={tabsRef} className="tk-tablist notifications-tabs" role="tablist" aria-label="알림 유형">
            {TABS.map((tab, index) => (
              <button key={tab.id} type="button" id={`notification-tab-${tab.id}`} className="tk-tab" role="tab"
                aria-selected={category === tab.id} aria-controls="notification-panel" tabIndex={category === tab.id ? 0 : -1}
                onClick={() => setCategory(tab.id)} onKeyDown={e => tabKey(e, index)}>
                {tab.label}{!!counts?.[tab.id] && <span className="tk-badge tk-badge--count" aria-label={`안 읽음 ${counts[tab.id]}개`}>{counts[tab.id]}</span>}
              </button>
            ))}
          </div>
          <section id="notification-panel" role="tabpanel" aria-labelledby={`notification-tab-${category}`} tabIndex={0}>
            <div className="notifications-toolbar">
              <label className="tk-checkbox"><input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} />안 읽은 알림만</label>
              <Button variant="ghost" disabled={busy || !counts?.[category] || !items.length} onClick={() => readAll.mutate({ category: filterCategory, through_id: items[0].id })}>
                <Icon name="check" />모두 읽음
              </Button>
            </div>
            {(read.isError || readAll.isError) && <p className="tk-status tk-status--danger" role="alert">읽음 처리를 저장하지 못했어요. 다시 시도해 주세요.</p>}
            {query.isPending && <p className="tk-status" role="status" aria-busy="true"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />알림을 불러오는 중</p>}
            {query.isError && <div className="tk-empty tk-empty--boxed" role="alert">
              <Art name="state-error" />
              <p className="tk-empty__title">알림을 불러오지 못했어요</p>
              <Button onClick={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())}>다시 시도</Button>
            </div>}
            {Array.from(groups, ([date, group]) => <section key={date} className="notifications-day" aria-label={dayFormat.format(new Date(group[0].created_at))}>
              <h2 className="notifications-day__title">{dayFormat.format(new Date(group[0].created_at))}</h2>
              <ul className="notifications-list">{group.map(item => <NotificationRow key={item.id} item={item} busy={busy} onRead={id => read.mutate(id)} />)}</ul>
            </section>)}
            {query.isSuccess && !items.length && <div className="tk-empty tk-empty--boxed notifications-empty">
              <Art name="state-notifications-empty" />
              <p className="tk-empty__title">{unreadOnly ? "안 읽은 알림이 없어요" : category === "all" ? "아직 알림이 없어요" : `${selectedTab.label} 알림이 없어요`}</p>
              <p className="tk-body-sm tk-text-tertiary">{unreadOnly ? "새 알림이 도착하면 여기에 모여요." : "알림함을 켠 뒤 도착하는 알림부터 보관해요."}</p>
            </div>}
            {query.hasNextPage && <div className="notifications-more"><Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "불러오는 중" : "더 보기"}</Button></div>}
          </section>
        </div>
      </div>
      {settingsOpen && <PushSettingsDialog open onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
