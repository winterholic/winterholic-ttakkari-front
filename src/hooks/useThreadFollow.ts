import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export interface ThreadFollowState {
  ref: RefObject<HTMLDivElement | null>;
  inner: RefObject<HTMLDivElement | null>;
  jump: boolean;
  toBottom: () => void;
  holdPosition: () => void;
}

interface Anchor {
  element: HTMLElement;
  topOffset: number;
}

/**
 * 뷰포트 내(컨테이너 기준)에서 현재 사용자가 보고 있는 첫 번째 메시지 요소를 찾아
 * DOM anchor로 반환한다.
 * 더보기 버튼(.thread-older) 등 상단 컨트롤은 앵커에서 제외한다.
 */
function findAnchor(container: HTMLElement): Anchor | null {
  const containerRect = container.getBoundingClientRect();
  const candidates = container.querySelectorAll<HTMLElement>(
    ".tk-message, .report-message, article[data-author]",
  );
  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    const rect = el.getBoundingClientRect();
    if (rect.bottom > containerRect.top + 2 && rect.top < containerRect.bottom - 2) {
      return {
        element: el,
        topOffset: rect.top - containerRect.top,
      };
    }
  }
  return null;
}

/**
 * 기억해둔 anchor 요소를 기준으로 스크롤 위치를 미세 조정하여
 * 사용자가 보고 있던 위치를 화면상 정확하게 보존한다.
 */
function adjustAnchor(container: HTMLElement, anchor: Anchor): boolean {
  if (!anchor.element || !anchor.element.isConnected) return false;
  const containerRect = container.getBoundingClientRect();
  const currentRect = anchor.element.getBoundingClientRect();
  const currentOffset = currentRect.top - containerRect.top;
  const delta = currentOffset - anchor.topOffset;
  if (Math.abs(delta) >= 1) {
    container.scrollTop += delta;
    return true;
  }
  return false;
}

/**
 * 바닥 근처일 때만 새 내용을 따라가고, 사용자가 위로 스크롤하여 탐색을 시작하면
 * 즉시 자동 따라가기를 해제하며, 과거 데이터 추가 및 비동기 높이 변화 시
 * 안정적인 DOM anchor 기반으로 보고 있던 위치를 유지한다.
 */
export function useThreadFollow(dep: unknown): ThreadFollowState {
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  // 1. 하단 자동 따라가기 여부 (초기 true)
  const isFollowing = useRef(true);
  // 2. 사용자가 직접 포인터/스크롤바를 잡고 있는지 여부
  const isUserInteracting = useRef(false);
  // 3. 프로그램적 스크롤 여부 및 타임스탬프
  const programScrollUntil = useRef(0);
  // 4. 이전 대화 더 보기 시 명시적으로 잠근 앵커
  const lockedAnchor = useRef<Anchor | null>(null);
  // 5. 일반 탐색 중 현재 보고 있는 앵커
  const currentAnchor = useRef<Anchor | null>(null);
  // 6. 폴백용 바닥 거리
  const keepFromBottom = useRef<number | null>(null);
  // 7. 직전 바닥 거리
  const lastGap = useRef(0);
  // 8. '새 메시지' 점프 버튼 표시 여부
  const [jump, setJump] = useState(false);

  // 세션이 바뀌면 상태 초기화
  useEffect(() => {
    isFollowing.current = true;
    isUserInteracting.current = false;
    lockedAnchor.current = null;
    currentAnchor.current = null;
    keepFromBottom.current = null;
    lastGap.current = 0;
  }, [dep]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 사용자 의도 감지: 위로 스크롤하려는 입력이 발생하는 즉시 자동 따라가기 해제
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        // 사용자가 위로 휠을 굴림 -> 하단 96px 이내여도 즉각 자동 따라가기 해제
        isFollowing.current = false;
        currentAnchor.current = findAnchor(el);
      } else if (e.deltaY > 0) {
        // 아래로 굴림: 바닥 근처에 오면 자동 따라가기 복귀는 onScroll이 처리
        currentAnchor.current = findAnchor(el);
      }
    };

    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      isUserInteracting.current = true;
      if (e.touches.length > 0) {
        touchStartY = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const delta = e.touches[0].clientY - touchStartY;
        if (delta > 3) {
          // 화면을 아래로 당김 (위쪽 내용을 보려고 함) -> 즉각 자동 따라가기 해제
          isFollowing.current = false;
          currentAnchor.current = findAnchor(el);
        }
      }
    };

    const onTouchEnd = () => {
      isUserInteracting.current = false;
    };

    const onPointerDown = () => {
      isUserInteracting.current = true;
    };

    const onPointerUp = () => {
      isUserInteracting.current = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Home") {
        isFollowing.current = false;
        currentAnchor.current = findAnchor(el);
      }
    };

    const onScroll = () => {
      const now = Date.now();
      if (now < programScrollUntil.current) {
        // 프로그램에 의해 설정된 스크롤 이벤트는 무시
        return;
      }

      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      lastGap.current = gap;

      if (gap <= 4) {
        // 사용자가 스크롤하여 맨 바닥에 도달함 -> 다시 자동 따라가기 활성화
        isFollowing.current = true;
        setJump(false);
        currentAnchor.current = null;
        lockedAnchor.current = null;
      } else {
        // 바닥에서 벗어나 있음:
        // 사용자가 직접 입력(터치, 스크롤바 드래그 등) 중인 경우에만 isFollowing 해제
        if (isUserInteracting.current) {
          isFollowing.current = false;
        }
        currentAnchor.current = findAnchor(el);
        if (!isFollowing.current && gap > 48) {
          setJump(true);
        }
      }
    };

    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("keydown", onKeyDown, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  // ResizeObserver: 크기 변화 시 위치 보존 또는 바닥 추적
  useEffect(() => {
    const el = ref.current;
    const body = inner.current;
    if (!el || !body) return;

    const setScrollTop = (top: number) => {
      if (Math.abs(el.scrollTop - top) >= 1) {
        programScrollUntil.current = Date.now() + 100;
        el.scrollTop = top;
      }
    };

    const ro = new ResizeObserver(() => {
      if (isFollowing.current) {
        // 바닥 따라가기 모드: 항상 바닥으로 맞춘다
        setScrollTop(el.scrollHeight - el.clientHeight);
      } else {
        // 사용자 직접 탐색 모드: 보던 내용의 위치를 보존한다
        let restored = false;
        if (lockedAnchor.current && lockedAnchor.current.element.isConnected) {
          programScrollUntil.current = Date.now() + 100;
          restored = adjustAnchor(el, lockedAnchor.current);
          if (restored) {
            currentAnchor.current = lockedAnchor.current;
          }
        }
        if (!restored && currentAnchor.current && currentAnchor.current.element.isConnected) {
          programScrollUntil.current = Date.now() + 100;
          adjustAnchor(el, currentAnchor.current);
        } else if (!restored && keepFromBottom.current !== null) {
          setScrollTop(el.scrollHeight - keepFromBottom.current);
          keepFromBottom.current = null;
        }

        const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (gap > 48) {
          setJump(true);
        }
        lastGap.current = gap;
      }
    });

    ro.observe(body);
    return () => ro.disconnect();
  }, [dep]);

  const toBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    isFollowing.current = true;
    isUserInteracting.current = false;
    lockedAnchor.current = null;
    currentAnchor.current = null;
    keepFromBottom.current = null;
    setJump(false);
    programScrollUntil.current = Date.now() + 400;

    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, []);

  const holdPosition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    isFollowing.current = false;
    lockedAnchor.current = findAnchor(el);
    keepFromBottom.current = el.scrollHeight - el.scrollTop;
  }, []);

  return { ref, inner, jump, toBottom, holdPosition };
}
