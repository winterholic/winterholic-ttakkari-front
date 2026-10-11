import { useSyncExternalStore } from "react";
import { ApiError, cancelTransfer, completeTransfer, putTransferChunk, startTransfer, transferStatus } from "../../api/client";
import type { DeliveredFile } from "../../api/client";

/**
 * 폰 → 컴퓨터 보내기 대기열. 모듈 전역이라 다른 화면으로 가도 계속 올린다.
 * 아이폰 사파리는 화면이 꺼지거나 다른 앱으로 가면 요청을 끊는다. 조각 단위로 올리고,
 * 끊기면 서버가 가진 크기부터 이어 올린다. 올리는 동안은 화면 꺼짐을 막는다(Wake Lock).
 */

export type ItemState = "queued" | "uploading" | "processing" | "done" | "failed" | "cancelled";

export interface TransferOptions {
  convertHeic: boolean;
  stripLocation: boolean;
  keepOriginal: boolean;
}

export interface TransferItem {
  key: string;
  file: File;
  name: string;
  size: number;
  dest: string;
  options: TransferOptions;
  sent: number;
  state: ItemState;
  error?: string;
  files?: DeliveredFile[];
  notes?: string[];
  /** 서버 쪽 업로드 id. 이어 올릴 때 쓴다. */
  id?: string;
  /** 서버가 정한 조각 크기 */
  chunk?: number;
}

const CONCURRENCY = 2;
const MAX_RETRIES = 8;

let items: TransferItem[] = [];
const listeners = new Set<() => void>();
const controllers = new Map<string, AbortController>();
const wakers = new Map<string, () => void>();
let seq = 0;

function emit() {
  items = [...items];
  for (const l of listeners) l();
  syncWakeLock();
}

function patch(key: string, p: Partial<TransferItem>) {
  items = items.map((it) => (it.key === key ? { ...it, ...p } : it));
  for (const l of listeners) l();
  syncWakeLock();
}

export function useTransfers(): TransferItem[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
  );
}

export const isBusy = (it: TransferItem) => it.state === "queued" || it.state === "uploading" || it.state === "processing";

export function addFiles(files: File[], dest: string, options: TransferOptions) {
  for (const file of files) {
    seq += 1;
    items = [...items, { key: `${Date.now()}-${seq}`, file, name: file.name || "upload", size: file.size, dest, options, sent: 0, state: "queued" }];
  }
  emit();
  pump();
}

export function cancel(key: string) {
  const it = items.find((x) => x.key === key);
  if (!it) return;
  controllers.get(key)?.abort();
  if (it.id) void cancelTransfer(it.id).catch(() => undefined);
  patch(key, { state: "cancelled" });
  pump();
}

export function retry(key: string) {
  patch(key, { state: "queued", error: undefined });
  pump();
}

export function clearFinished() {
  items = items.filter(isBusy);
  emit();
}

function pump() {
  const running = items.filter((x) => x.state === "uploading" || x.state === "processing").length;
  for (const it of items.filter((x) => x.state === "queued").slice(0, Math.max(0, CONCURRENCY - running))) {
    patch(it.key, { state: "uploading" });
    void run(it.key);
  }
}

const sleep = (ms: number, key: string) =>
  new Promise<void>((resolve) => {
    // 화면으로 돌아오면(visibilitychange) 기다리지 않고 바로 다시 시도한다.
    const t = window.setTimeout(done, ms);
    function done() {
      window.clearTimeout(t);
      wakers.delete(key);
      resolve();
    }
    wakers.set(key, done);
  });

function current(key: string) {
  return items.find((x) => x.key === key);
}

async function run(key: string) {
  let it = current(key);
  if (!it) return;
  const ctl = new AbortController();
  controllers.set(key, ctl);
  let failures = 0;
  try {
    if (!it.id) {
      const t = await startTransfer({
        filename: it.name, size: it.size, dest_dir: it.dest,
        convert_heic: it.options.convertHeic, strip_location: it.options.stripLocation, keep_original: it.options.keepOriginal,
      });
      patch(key, { id: t.id, sent: 0, chunk: t.chunk_size });
    }
    let chunk = current(key)?.chunk ?? 8 * 1024 * 1024;
    for (;;) {
      it = current(key);
      if (!it || it.state !== "uploading" || !it.id) return;
      if (it.sent >= it.size) break;
      try {
        const res = await putTransferChunk(it.id, it.sent, it.file.slice(it.sent, it.sent + chunk), ctl.signal);
        chunk = res.chunk_size;
        failures = 0;
        patch(key, { sent: res.received });
      } catch (e) {
        if (ctl.signal.aborted) return;
        if (e instanceof ApiError && e.code === "offset_mismatch") {
          const n = Number(/received=(\d+)/.exec(e.message)?.[1]);
          if (Number.isFinite(n)) {
            patch(key, { sent: n });
            continue;
          }
        }
        if (e instanceof ApiError && e.status < 500 && e.status !== 408 && e.status !== 429) throw e;
        // 네트워크 끊김(백그라운드 전환·터널 순단): 서버가 가진 크기를 다시 묻고 이어 올린다.
        failures += 1;
        if (failures > MAX_RETRIES) throw e;
        await sleep(Math.min(30_000, 1000 * 2 ** failures), key);
        try {
          const st = await transferStatus(it.id);
          patch(key, { sent: st.received });
        } catch {
          // 상태 조회도 실패하면 다음 반복에서 다시 시도한다.
        }
      }
    }
    patch(key, { state: "processing" });
    const done = await completeTransfer(current(key)!.id!);
    patch(key, { state: "done", files: done.files, notes: done.notes, sent: current(key)!.size });
  } catch (e) {
    if (!ctl.signal.aborted) patch(key, { state: "failed", error: e instanceof Error ? e.message : "보내지 못했어요" });
  } finally {
    controllers.delete(key);
    pump();
  }
}

// ---- 화면 켜 두기(Wake Lock)와 돌아왔을 때 즉시 재시도

interface WakeLockLike {
  release: () => Promise<void>;
}
let lock: WakeLockLike | null = null;
let locking = false;

function syncWakeLock() {
  const busy = items.some(isBusy);
  const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockLike> } };
  if (busy && !lock && !locking && nav.wakeLock && document.visibilityState === "visible") {
    locking = true;
    nav.wakeLock
      .request("screen")
      .then((l) => {
        lock = l;
      })
      .catch(() => undefined)
      .finally(() => {
        locking = false;
      });
  } else if (!busy && lock) {
    void lock.release().catch(() => undefined);
    lock = null;
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      // 화면을 벗어나면 브라우저가 잠금을 푼다. 돌아오면 다시 잡는다.
      lock = null;
      return;
    }
    for (const wake of [...wakers.values()]) wake();
    syncWakeLock();
  });
  window.addEventListener("beforeunload", (e) => {
    if (items.some(isBusy)) e.preventDefault();
  });
}

/** 테스트 전용 */
export function __resetTransfers() {
  for (const c of controllers.values()) c.abort();
  items = [];
  emit();
}
