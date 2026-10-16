import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { listNotifications } from "../api/client";
import { useForegroundResync } from "../hooks/useForegroundResync";
import { Icon } from "../ui/Icon";
import "./notification-link.css";

/** 홈에서 알림함으로 바로 이동. 목록의 읽음 처리와 같은 캐시 범위를 쓴다. */
export function NotificationLink() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", "header"],
    queryFn: () => listNotifications({ limit: 1 }),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  useForegroundResync(() => { void qc.invalidateQueries({ queryKey: ["notifications"] }); });
  const unread = query.data?.unread_counts.all;
  const label = unread === undefined ? "알림함 열기" : unread > 0 ? `알림함 열기, 안 읽은 알림 ${unread}개` : "알림함 열기, 안 읽은 알림 없음";

  return (
    <Link className="tk-icon-button notification-link" to="/notifications" aria-label={label} title="알림">
      <Icon name="important" />
      {!!unread && <span className="tk-badge tk-badge--count tk-badge--danger notification-link__count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );
}
