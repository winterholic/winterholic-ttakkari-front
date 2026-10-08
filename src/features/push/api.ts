import { apiUrl, getAccessToken, refreshOrLose, toApiError } from "../../api/client";

// client.ts 의 json() 은 export 되어 있지 않아 같은 규칙(Bearer, 401 이면 refresh 후 1회 재시도)으로 얻어 쓴다.
async function call(path: string, method: string, body?: unknown): Promise<Response> {
  const send = (token: string | null) =>
    fetch(apiUrl(path), {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
  let res = await send(getAccessToken());
  if (res.status === 401) res = await send(await refreshOrLose());
  if (!res.ok) throw await toApiError(res);
  return res;
}

export async function vapidPublicKey(): Promise<string> {
  return ((await (await call("/api/push/vapid-public-key", "GET")).json()) as { public_key: string }).public_key;
}

export async function registerSubscription(sub: PushSubscriptionJSON, label?: string): Promise<void> {
  await call("/api/push/subscriptions", "POST", { endpoint: sub.endpoint, keys: sub.keys, label });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await call("/api/push/subscriptions", "DELETE", { endpoint });
}

export interface TestResult {
  sent: number;
  removed: number;
  failed: number;
}
export async function sendTest(): Promise<TestResult> {
  return (await (await call("/api/push/test", "POST")).json()) as TestResult;
}
