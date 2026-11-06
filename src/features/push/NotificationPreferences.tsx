import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getNotificationPreferences, updateNotificationPreference } from "../../api/client";
import type { NotificationCategory } from "../../api/notificationTypes";
import { Button } from "../../ui/Button";
import { toast } from "../../ui/toastStore";
import "./notificationPreferences.css";

const GROUPS: { categories: NotificationCategory[]; label: string }[] = [
  { categories: ["weather", "planner"], label: "일상 알림" },
  { categories: ["assistant"], label: "메인 에이전트" },
  { categories: ["tasks"], label: "작업 상태와 하위 에이전트" },
  { categories: ["meetings", "system"], label: "회의록과 서비스" },
];
const key = ["notification-preferences"];

export function NotificationPreferences() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: key, queryFn: getNotificationPreferences });
  const save = useMutation({
    mutationFn: updateNotificationPreference,
    onSuccess: data => qc.setQueryData(key, data),
    onError: () => toast({ message: "알림 설정을 저장하지 못했어요. 다시 선택해 주세요.", tone: "danger" }),
  });
  return <section className="notification-preferences" aria-labelledby="notification-preferences-title">
    <div>
      <h3 id="notification-preferences-title">받고 싶은 알림만 선택하세요</h3>
      <p className="tk-fieldset__help">끄면 새 푸시와 알림함에 쌓이지 않아요. 기존 알림은 남아 있고, 유형 설정은 모든 기기에 적용돼요.</p>
    </div>
    {query.isPending && <p role="status">알림 설정을 불러오는 중이에요.</p>}
    {query.isError && <div>
      <p className="tk-status tk-status--danger" role="alert">알림 설정을 불러오지 못했어요.</p>
      <Button onClick={() => void query.refetch()}>다시 불러오기</Button>
    </div>}
    {query.data && GROUPS.map(group => {
      const items = query.data.items.filter(x => group.categories.includes(x.category));
      if (!items.length) return null;
      return <fieldset key={group.label} className="notification-preferences__group">
        <legend>{group.label}</legend>
        {items.map(item => {
          const labelId = `notification-label-${item.kind}`;
          const descriptionId = `notification-description-${item.kind}`;
          return <label key={item.kind} className="tk-switch tk-switch--row notification-preferences__row">
            <span className="notification-preferences__copy">
              <span id={labelId}>{item.label}</span>
              <span className="tk-fieldset__help" id={descriptionId}>{item.description}</span>
            </span>
            <input type="checkbox" role="switch" aria-labelledby={labelId} aria-describedby={descriptionId}
              checked={item.enabled} disabled={save.isPending}
              onChange={event => save.mutate({ kind: item.kind, enabled: event.target.checked })} />
          </label>;
        })}
      </fieldset>;
    })}
    <p className="notification-preferences__save" role="status" aria-live="polite">
      {save.isPending ? "저장 중…" : save.isSuccess ? "저장했어요." : "선택하면 바로 저장돼요."}
    </p>
    {save.isError && <p className="tk-status tk-status--danger" role="alert">저장하지 못했어요. 기존 설정을 유지했으니 다시 선택해 주세요.</p>}
  </section>;
}
