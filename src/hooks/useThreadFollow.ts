import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export interface ThreadFollowState {
  ref: RefObject<HTMLDivElement | null>;
  inner: RefObject<HTMLDivElement | null>;
  jump: boolean;
  toBottom: () => void;
  holdPosition: () => void;
}

// 이 거리 안이면 바닥으로 본다(새 메시지 버튼이 사라지는 기준과 같다).
const NEAR_BOTTOM = 48;
const SCROLL_KEYS = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

function isOutsidePanel(target: EventTarget | null, container: HTMLElement): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (container.contains(target)) return false;
  return !!target.closest("aside, dialog, [role='dialog'], .desk-split__node, .tk-viewer");
}

interface Anchor {
  element: HTMLElement;
  topOffset: number;
}

/**
 * 뷰포트 내(컨테이너 기준)에서 사용자가 보고 있는 기준 메시지 요소를 찾아 DOM anchor로 반환한다.
 * 위쪽 경계가 화면 안에서 시작하는 첫 메시지를 우선한다. 위쪽이 잘려 걸쳐 있는 메시지를 기준으로 삼으면
 * 그 메시지 자신이 지연 로딩으로 커질 때(top 은 그대로) 아래에서 읽던 메시지가 밀려도 보정이 일어나지 않는다.
 * 그런 메시지가 없으면(한 메시지가 화면을 채움) 걸쳐 있는 첫 메시지를 쓴다.
 * 더보기 버튼(.thread-older) 등 상단 컨트롤은 앵커에서 제외한다.
 */
function findAnchor(container: HTMLElement): Anchor | null {
  const containerRect = container.getBoundingClientRect();
  const candidates = container.querySelectorAll<HTMLElement>(
    ".tk-message, .report-message, article[data-author]",
  );
  let straddling: Anchor | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    const rect = el.getBoundingClientRect();
    if (rect.bottom > containerRect.top + 2 && rect.top < containerRect.bottom - 2) {
      const anchor = { element: el, topOffset: rect.top - containerRect.top };
      if (rect.top >= containerRect.top - 2) return anchor;
      straddling ??= anchor;
    }
  }
  return straddling;
}

/**
 * 기억해둔 anchor 요소의 화면 위치가 달라졌으면 그만큼 스크롤을 되돌려
 * 사용자가 보고 있던 위치를 화면상 정확하게 보존한다.
 * 기준이 '요소의 현재 화면 위치'라서 브라우저 scroll anchoring 이 이미 보정했다면 차이가 0이 되어 아무것도 하지 않는다(이중 보정 없음).
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
 * 즉시 자동 따라가기를 해제한다.
 *
 * 위치 보존의 책임 분담:
 * - 브라우저: CSS overflow-anchor(thread.css)가 보이는 영역 위쪽의 높이 변화(지연 로딩으로 카드가 자라는 것 포함)를 먼저 보정한다.
 *   WebKit 처럼 지원하지 않는 엔진에서는 보정이 없다.
 * - 이 훅: ResizeObserver 에서 '보던 메시지의 화면 위치가 달라진 만큼'만 되돌린다(currentAnchor).
 *   브라우저가 이미 보정했다면 차이가 0이라 겹쳐도 두 번 움직이지 않는다.
 * - 이전 대화 더 보기(holdPosition)는 클릭 시점의 기준점(pendingHold)을 따로 둔다.
 *   데이터가 실제로 앞에 붙어 기준 요소가 밀린 첫 갱신에서 한 번만 적용하고 버린다.
 *   높이가 그대로인 무관한 갱신은 기준점을 쓰지 않고 남겨 두며, 사용자가 움직이면(휠·터치·키·스크롤바) 버린다.
 *
 * 우리가 바꾼 스크롤과 사용자의 스크롤은 시간 창이 아니라 '우리가 만든 scrollTop 값'으로 가른다.
 * 우리 대입이 낳은 scroll 이벤트는 값이 그대로라서 한 번만 무시되고, 값이 다르면 직후라도 사용자 스크롤이다.
 */
export function useThreadFollow(dep: unknown): ThreadFollowState {
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  // 1. 하단 자동 따라가기 여부 (초기 true)
  const isFollowing = useRef(true);
  // 2. 사용자가 직접 포인터/스크롤바를 잡고 있는지 여부
  const isUserInteracting = useRef(false);
  // 3. 우리가 방금 대입한 scrollTop. 이 값과 같은 scroll 이벤트만 우리 것으로 보고 한 번 무시한다.
  const programScrollTop = useRef<number | null>(null);
  // 4. 이전 대화 더 보기를 누른 시점의 기준점. 데이터가 실제로 붙은 첫 갱신에서 쓰고 버린다.
  const pendingHold = useRef<{ anchor: Anchor | null; fromBottom: number; scrollHeight: number } | null>(null);
  // 5. 일반 탐색 중 현재 보고 있는 앵커
  const currentAnchor = useRef<Anchor | null>(null);
  // 7. 직전 바닥 거리
  const lastGap = useRef(0);
  // 직전 scroll 이벤트가 본 scrollTop. 아래로 움직인 이벤트만 '바닥에 도달'로 읽는 데 쓴다.
  const lastTop = useRef(0);
  // 8. '새 메시지' 점프 버튼 표시 여부
  const [jump, setJump] = useState(false);

  // 세션이 바뀌면 상태 초기화
  useEffect(() => {
    isFollowing.current = true;
    isUserInteracting.current = false;
    programScrollTop.current = null;
    pendingHold.current = null;
    currentAnchor.current = null;
    lastGap.current = 0;
    lastTop.current = 0;
    setJump(false);
  }, [dep]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 사용자가 움직이기 시작했다: 이전 대화 더 보기의 기준점은 더 이상 읽던 자리가 아니다.
    // programScrollTop 은 지우지 않는다: 입력 직전에 우리가 낸 스크롤의 이벤트가 입력 뒤에 도착해도 우리 것으로 알아봐야 한다.
    const userMoved = () => {
      pendingHold.current = null;
    };

    // 사용자 의도 감지: 위로 스크롤하려는 입력이 발생하는 즉시 자동 따라가기 해제
    const onWheel = (e: WheelEvent) => {
      userMoved();
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
      userMoved();
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
      // 입력창 안의 키는 커서 이동이고, 사이드 패널이나 다이얼로그 안의 포커스는 대화 스크롤이 아니다.
      if (isEditable(e.target) || isOutsidePanel(e.target, el)) return;
      if (SCROLL_KEYS.includes(e.key)) userMoved();
      if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Home") {
        isFollowing.current = false;
        currentAnchor.current = findAnchor(el);
      } else if (e.key === "End" || ((e.metaKey || e.ctrlKey) && e.key === "ArrowDown")) {
        // 바닥으로 가겠다는 뜻이다. 1~2초 걸리는 부드러운 이동 중에 스트리밍이 자라 도착 시점의 gap 이 기준을 넘어도 바닥을 따라간다.
        isFollowing.current = true;
        currentAnchor.current = null;
        setJump(false);
      }
    };

    const onScroll = () => {
      const movedDown = el.scrollTop > lastTop.current + 0.5;
      lastTop.current = el.scrollTop;
      // 우리가 대입한 값 그대로인 이벤트는 우리 것이다. 한 번만 무시하고, 값이 다르면 직후라도 사용자 스크롤로 읽는다.
      const own = programScrollTop.current;
      programScrollTop.current = null;
      if (own !== null && Math.abs(el.scrollTop - own) < 1) return;
      // 사용자 스크롤(휠·터치·키보드·스크롤바)이나 브라우저 자체 보정이다. 어느 쪽이든 지금 위치가 새 기준이다.
      pendingHold.current = null;

      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      lastGap.current = gap;

      if (gap <= NEAR_BOTTOM && (gap <= 4 || movedDown)) {
        setJump(false);
        // 아래로 내려 바닥에 닿음(새 메시지 버튼이 사라지는 48px 안; End 키·스크롤바의 부드러운 이동이 끝날 즈음 스트리밍이 조금 더 자란 경우 포함) -> 다시 자동 따라가기 활성화.
        // 위치가 그대로이거나 위로 간 이벤트(직전 따라가기 스크롤이 남긴 지연·중복 이벤트)는 키·휠로 푼 따라가기를 되살리지 못한다.
        if (isFollowing.current || movedDown) {
          isFollowing.current = true;
          currentAnchor.current = null;
        }
      } else {
        // 바닥에서 벗어나 있음:
        // 사용자가 직접 입력(터치, 스크롤바 드래그 등) 중인 경우에만 isFollowing 해제
        if (isUserInteracting.current) {
          isFollowing.current = false;
        }
        currentAnchor.current = findAnchor(el);
        if (!isFollowing.current && gap > NEAR_BOTTOM) {
          setJump(true);
        }
      }
    };

    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    window.addEventListener("keydown", onKeyDown, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  // ResizeObserver: 크기 변화 시 위치 보존 또는 바닥 추적
  useEffect(() => {
    const el = ref.current;
    const body = inner.current;
    if (!el || !body) return;

    // scrollTop 을 바꾸고, 실제로 달라졌을 때만 그 값을 '우리 것'으로 기록한다(값이 같으면 scroll 이벤트가 오지 않는다).
    const moveBy = (change: () => void) => {
      const before = el.scrollTop;
      change();
      if (Math.abs(el.scrollTop - before) >= 1) programScrollTop.current = el.scrollTop;
    };

    const ro = new ResizeObserver(() => {
      if (isFollowing.current) {
        // 바닥 따라가기 모드: 항상 바닥으로 맞춘다
        moveBy(() => { el.scrollTop = el.scrollHeight - el.clientHeight; });
        return;
      }
      // 사용자 직접 탐색 모드: 보던 내용의 위치를 보존한다
      const hold = pendingHold.current;
      let held = false;
      if (hold) {
        if (hold.anchor?.element.isConnected) {
          // 기준 요소가 밀렸을 때만(= 앞에 데이터가 실제로 붙었을 때) 쓰고 버린다. 밀리지 않은 갱신은 기준점을 남겨 둔다.
          moveBy(() => { held = adjustAnchor(el, hold.anchor!); });
          if (held) {
            currentAnchor.current = hold.anchor;
            pendingHold.current = null;
          }
        } else if (!hold.anchor && el.scrollHeight > hold.scrollHeight) {
          // 화면에 기준 메시지가 없었다: 아래에서부터의 거리로 되돌린다
          moveBy(() => { el.scrollTop = el.scrollHeight - hold.fromBottom; });
          currentAnchor.current = findAnchor(el);
          pendingHold.current = null;
          held = true;
        }
      }
      if (!held && currentAnchor.current?.element.isConnected) {
        moveBy(() => { adjustAnchor(el, currentAnchor.current!); });
      }

      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (gap > NEAR_BOTTOM) {
        setJump(true);
      }
      lastGap.current = gap;
    });

    ro.observe(body);
    // 대화 영역 자체의 크기 변화(입력창 포커스로 뷰포트가 줄었다 돌아옴)도 같은 경로로 처리한다: 바닥을 보던 사용자는 마지막 메시지가 계속 보여야 한다.
    ro.observe(el);
    return () => ro.disconnect();
  }, [dep]);

  const toBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    isFollowing.current = true;
    isUserInteracting.current = false;
    pendingHold.current = null;
    programScrollTop.current = null;
    currentAnchor.current = null;
    setJump(false);

    // 부드러운 이동의 중간 scroll 이벤트는 따라가기 중이라 해롭지 않다(위로 가려는 입력은 onWheel 등이 즉시 해제한다).
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
    const anchor = findAnchor(el);
    currentAnchor.current = anchor;
    pendingHold.current = { anchor, fromBottom: el.scrollHeight - el.scrollTop, scrollHeight: el.scrollHeight };
  }, []);

  return { ref, inner, jump, toBottom, holdPosition };
}
