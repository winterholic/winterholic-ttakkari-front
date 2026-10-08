import { useCallback, useEffect, useState } from "react";
import { registerSubscription, removeSubscription, sendTest, vapidPublicKey } from "./api";
import { derivePushState, readPushEnv, urlBase64ToBytes } from "./pushState";
import type { PushState } from "./pushState";

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : "기기";
  return `${os} ${/Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "브라우저"}`;
}

export function usePush() {
  const [state, setState] = useState<PushState>(() => derivePushState(readPushEnv(false)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const env = readPushEnv(false);
    const sub = env.supported ? await currentSubscription().catch(() => null) : null;
    return derivePushState({ ...env, subscribed: sub !== null });
  }, []);
  const refresh = useCallback(async () => setState(await load()), [load]);

  useEffect(() => {
    let alive = true;
    void load().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "알림 설정에 실패했습니다.");
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const enable = () =>
    run(async () => {
      if ((await Notification.requestPermission()) !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBytes(await vapidPublicKey()),
        }));
      await registerSubscription(sub.toJSON(), deviceLabel());
    });

  const disable = () =>
    run(async () => {
      const sub = await currentSubscription();
      if (!sub) return;
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await removeSubscription(endpoint);
    });

  const test = async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      return (await sendTest()).sent > 0;
    } catch (e) {
      setError(e instanceof Error ? e.message : "테스트 알림을 보내지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { state, busy, error, enable, disable, test };
}
