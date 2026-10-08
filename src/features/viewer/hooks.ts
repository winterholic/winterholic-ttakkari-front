import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { contentBlob } from "../../api/client";
import type { ArtifactVariant, UUID } from "../../api/types";

/** 원본을 Bearer 로 받아 objectURL 을 만든다. 언마운트·id 변경 시 revoke 한다. */
export function useBlobUrl(id: UUID, variant: ArtifactVariant, enabled = true) {
  const q = useQuery({
    queryKey: ["artifact-blob", id, variant],
    queryFn: () => contentBlob(id, variant),
    enabled,
    // 원본은 민감할 수 있어 메모리에 오래 두지 않는다.
    gcTime: 0,
    staleTime: Infinity,
  });
  const blob = q.data;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    // objectURL 은 effect 정리에서 revoke 해야 해서 state 로 들고 있는다(StrictMode 재실행에도 안전).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
      setUrl(null);
    };
  }, [blob]);
  return { blob, url, isLoading: q.isLoading, error: q.error, refetch: q.refetch };
}

export function useBlobText(id: UUID, enabled = true) {
  const q = useQuery({
    queryKey: ["artifact-text", id],
    queryFn: async () => (await contentBlob(id, "original")).text(),
    enabled,
    gcTime: 0,
    staleTime: Infinity,
  });
  return { text: q.data, isLoading: q.isLoading, error: q.error, refetch: q.refetch };
}

export function useMediaQuery(query: string): boolean {
  const get = () => (typeof matchMedia === "function" ? matchMedia(query).matches : false);
  const [m, setM] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return m;
}

/** lg(1024px) 이상이면 분할 패널, 미만이면 전체 화면 dialog. */
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");

/** 앱 테마. documentElement.dataset.theme(light|dark) 이 우선이고, 없으면 prefers-color-scheme. */
export function useAppTheme(): "light" | "dark" {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const read = () => document.documentElement.dataset.theme;
  const [attr, setAttr] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setAttr(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  if (attr === "dark" || attr === "light") return attr;
  return prefersDark ? "dark" : "light";
}

export function useOnline(): boolean {
  const [on, setOn] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return on;
}

/** 입력이 멈춘 뒤 delay ms 가 지나야 값이 바뀐다. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
