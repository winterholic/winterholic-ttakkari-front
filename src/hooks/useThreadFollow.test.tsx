import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThreadFollow } from "./useThreadFollow";

// jsdom 에는 레이아웃이 없다. 메시지의 내용 좌표(tops)로 화면 위치(top - scrollTop)를 흉내 낸다.
// 시간은 일부러 흘리지 않는다: 사용자 스크롤을 '우리 스크롤 직후 일정 시간 밖'에서만 인정하는 구조를 잡으려는 테스트다.
const IDS = ["m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7"];
const VIEW = 140;

// 실제 ResizeObserver 처럼 관찰 중인 요소의 크기가 바뀐 때만 콜백이 온다.
const observers: { callback: () => void; targets: Set<Element> }[] = [];
const fire = (target: Element) => observers.forEach((o) => o.targets.has(target) && o.callback());

function setup({ initialDep = "conversation" }: { initialDep?: string } = {}) {
  const tops: Record<string, number> = Object.fromEntries(IDS.map((id, i) => [id, i * 100]));
  const heights: Record<string, number> = Object.fromEntries(IDS.map((id) => [id, 80]));
  let total = 900;
  function Thread({ dep }: { dep: string }) {
    const t = useThreadFollow(dep);
    return (
      <div ref={t.ref} data-testid="thread">
        <button onClick={t.holdPosition}>이전 대화</button>
        {t.jump && <button data-testid="jump-btn">새 메시지</button>}
        <div ref={t.inner}>
          {IDS.map((id) => <article key={id} className="tk-message" data-testid={id}>{id}</article>)}
        </div>
      </div>
    );
  }
  const page = render(<Thread dep={initialDep} />);
  const thread = page.getByTestId("thread");
  const inner = thread.querySelector("div")!;
  let view = VIEW;
  Object.defineProperties(thread, { clientHeight: { get: () => view }, scrollHeight: { get: () => total } });
  thread.getBoundingClientRect = () => new DOMRect(0, 0, 300, view);
  for (const id of IDS) page.getByTestId(id).getBoundingClientRect = () => new DOMRect(0, tops[id] - thread.scrollTop, 300, heights[id]);
  const screenTop = (id: string) => page.getByTestId(id).getBoundingClientRect().top;
  // 사용자가 입력(휠)으로 scrollTop 을 바꾸고 scroll 이벤트가 따라온다.
  const userScrollTo = (top: number) => {
    act(() => {
      thread.dispatchEvent(new WheelEvent("wheel", { deltaY: top - thread.scrollTop }));
      thread.scrollTop = top;
      thread.dispatchEvent(new Event("scroll"));
    });
  };
  // 이전 대화가 앞에 붙는다: 기존 메시지가 dy 만큼 밀리고 전체 높이가 는다.
  const prepend = (dy: number) => {
    for (const id of IDS) tops[id] += dy;
    total += dy;
    act(() => fire(inner));
  };
  const hold = () => act(() => page.getByRole("button", { name: "이전 대화" }).click());
  // 한 메시지 자체가 커진다(지연 로딩): 그 아래 메시지가 dy 만큼 밀리고 전체 높이가 는다. 그 메시지의 top 은 그대로다.
  const growMessage = (id: string, dy: number) => {
    heights[id] += dy;
    for (const other of IDS.slice(IDS.indexOf(id) + 1)) tops[other] += dy;
    total += dy;
    act(() => fire(inner));
  };
  const resizeView = (h: number) => { view = h; act(() => fire(thread)); };
  const layout = () => act(() => fire(inner));
  const changeDep = (newDep: string) => {
    act(() => {
      page.rerender(<Thread dep={newDep} />);
    });
  };
  return { page, thread, layout, screenTop, userScrollTo, prepend, hold, growMessage, resizeView, changeDep, grow: (dy: number) => { total += dy; act(() => fire(inner)); } };
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal("ResizeObserver", class {
    private entry: { callback: () => void; targets: Set<Element> };
    constructor(callback: () => void) { this.entry = { callback, targets: new Set() }; observers.push(this.entry); }
    observe(target: Element) { this.entry.targets.add(target); }
    disconnect() { this.entry.targets.clear(); }
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useThreadFollow 이전 대화 불러오기 뒤 탐색", () => {
  it("데이터가 붙기 전에 높이가 그대로인 무관한 갱신이 먼저 와도 기준점을 쓰지 않고 남겨 둔다", () => {
    const t = setup();
    t.thread.scrollTop = 190; // m2 가 화면 위 10px
    t.hold();
    t.layout(); // 높이 변화 없음
    t.layout();
    expect(t.thread.scrollTop).toBe(190);
    t.prepend(300);
    expect(t.screenTop("m2")).toBe(10);
  });

  it("아래쪽만 자란 갱신(스트리밍)도 기준점을 소모하지 않는다", () => {
    const t = setup();
    t.thread.scrollTop = 190;
    t.hold();
    t.grow(120);
    expect(t.thread.scrollTop).toBe(190);
    t.prepend(300);
    expect(t.screenTop("m2")).toBe(10);
  });

  it("붙인 직후(시간이 흐르지 않아도) 사용자가 옮긴 위치를 다음 갱신이 되돌리지 않는다", () => {
    const t = setup();
    t.thread.scrollTop = 190;
    t.hold();
    t.prepend(300); // 보정: scrollTop 490
    expect(t.screenTop("m2")).toBe(10);
    t.userScrollTo(790); // m5 가 화면 위 10px (내용 좌표 800 - 790)
    expect(t.screenTop("m5")).toBe(10);
    t.grow(60);
    expect(t.screenTop("m5")).toBe(10);
    t.layout();
    expect(t.screenTop("m5")).toBe(10);
  });

  it("사용자가 빠르게 방향을 바꿔도 마지막 위치가 다음 갱신에서 유지된다", () => {
    const t = setup();
    t.thread.scrollTop = 190;
    t.hold();
    t.prepend(300);
    t.userScrollTo(390);
    t.layout();
    t.userScrollTo(640);
    t.userScrollTo(540);
    t.grow(40);
    // 540 에서 보이는 첫 메시지는 m2(내용 좌표 500 → 화면 -40, 아래 끝 40 → 보임)
    expect(t.thread.scrollTop).toBe(540);
    t.userScrollTo(250);
    t.grow(40);
    expect(t.thread.scrollTop).toBe(250);
  });

  it("데이터가 오기 전에 사용자가 다른 곳으로 움직였으면 누른 시점의 위치가 아니라 지금 위치를 지킨다", () => {
    const t = setup();
    t.thread.scrollTop = 190;
    t.hold();
    t.userScrollTo(390); // m4(내용 좌표 400)가 화면 위 10px
    t.prepend(300);
    expect(t.screenTop("m4")).toBe(10);
  });

  it("브라우저 scroll anchoring 이 먼저 보정했으면 훅이 한 번 더 움직이지 않는다", () => {
    const t = setup();
    t.thread.scrollTop = 190;
    t.hold();
    // 브라우저가 레이아웃 중에 이미 scrollTop 을 맞췄다(scroll 이벤트는 다음 프레임).
    t.thread.scrollTop = 490;
    t.prepend(300);
    expect(t.thread.scrollTop).toBe(490);
    expect(t.screenTop("m2")).toBe(10);
  });

  it("화면에 기준 메시지가 없으면 아래에서부터의 거리로 되돌린다", () => {
    const t = setup();
    t.thread.scrollTop = 820; // 어느 메시지도 안 보이는 빈 구간
    t.hold();
    t.prepend(300);
    expect(t.thread.scrollTop).toBe(1120);
  });

  it("위쪽이 잘려 걸친 메시지가 스스로 커져도(지연 로딩) 그 아래 읽던 메시지가 제자리에 머문다", () => {
    const t = setup();
    t.userScrollTo(400);
    t.userScrollTo(258); // 위로 올려 읽는다. m2(내용 200~280)가 화면 위로 58px 잘려 걸치고, m3 는 화면 위 42px 에서 시작한다
    expect(t.screenTop("m2")).toBe(-58);
    expect(t.screenTop("m3")).toBe(42);
    t.growMessage("m2", 300); // m2 의 events 가 도착해 m2 만 커진다 → m3 이하는 300px 밀린다
    expect(t.screenTop("m3")).toBe(42);
  });

  it("바닥을 따라가는 중 대화 영역 자체가 줄어도(입력창 포커스로 뷰포트 축소) 마지막 메시지가 계속 보인다", () => {
    const t = setup();
    t.layout(); // 열린 직후 바닥으로
    expect(t.thread.scrollTop).toBe(900 - VIEW);
    t.resizeView(90);
    expect(t.thread.scrollTop).toBe(900 - 90);
    t.resizeView(VIEW);
    expect(t.thread.scrollTop).toBe(900 - VIEW);
  });

  it("위로 올려 읽는 중 대화 영역이 줄었다 돌아와도 읽던 메시지 위치는 그대로다", () => {
    const t = setup();
    t.userScrollTo(400);
    t.userScrollTo(290);
    const before = t.screenTop("m3");
    t.resizeView(90);
    expect(t.screenTop("m3")).toBe(before);
    t.resizeView(VIEW);
    expect(t.screenTop("m3")).toBe(before);
  });

  it("키보드로 따라가기를 푼 뒤에 도착한 우리 스크롤의 scroll 이벤트(바닥)가 다시 따라가게 만들지 않는다", () => {
    const t = setup();
    t.layout(); // 바닥을 따라가며 scrollTop 을 바닥으로 둔다
    expect(t.thread.scrollTop).toBe(900 - VIEW);
    // 우리가 바닥으로 보낸 스크롤의 scroll 이벤트는 아직 도착하지 않았다.
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" })); }); // 사용자가 위로: 따라가기 해제
    // 그 이벤트가 키 입력 뒤에 도착한다(위치는 그대로 바닥). 사용자의 아래 이동으로 오인하면 따라가기가 되살아난다.
    act(() => { t.thread.dispatchEvent(new Event("scroll")); });
    t.grow(60);
    expect(t.thread.scrollTop).toBe(900 - VIEW); // 바닥으로 끌려가지 않는다
  });

  it("사용자가 아래로 내려 바닥에 닿으면 다시 따라간다", () => {
    const t = setup();
    t.userScrollTo(400);
    t.userScrollTo(200); // 위로: 해제
    t.userScrollTo(900 - VIEW); // 아래로 바닥까지
    t.grow(60);
    expect(t.thread.scrollTop).toBe(900 + 60 - VIEW);
  });

  it("아래로 내려 바닥 48px 안에 닿으면(부드러운 스크롤이 끝날 즈음 조금 더 자란 경우) 다시 따라간다", () => {
    const t = setup();
    t.userScrollTo(400);
    t.userScrollTo(200); // 위로: 따라가기 해제
    t.userScrollTo(900 - VIEW - 30); // 아래로, 바닥 30px 앞
    t.grow(60);
    expect(t.thread.scrollTop).toBe(900 + 60 - VIEW);
  });

  it("위로 20px 올린 것은 바닥 48px 안이어도 해제 상태를 유지한다", () => {
    const t = setup();
    t.layout();
    act(() => { t.thread.dispatchEvent(new Event("scroll")); });
    t.userScrollTo(900 - VIEW - 20); // 위로 20px(wheel deltaY<0)
    t.grow(60);
    expect(t.thread.scrollTop).toBe(900 - VIEW - 20);
  });

  const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}) =>
    act(() => { target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init })); });

  it("End 키는 바닥으로 가서 따라가겠다는 뜻이다(부드러운 이동이 끝나기 전에 자란 만큼 뒤처져도 바닥을 따라간다)", () => {
    const t = setup();
    t.userScrollTo(400);
    t.userScrollTo(200); // 위로 올려 읽는 중: 따라가기 해제
    key(t.thread, "End");
    t.grow(60);
    expect(t.thread.scrollTop).toBe(900 + 60 - VIEW);
  });

  it("입력창에서 누른 End·↑ 는 커서 이동일 뿐이라 따라가기 상태를 바꾸지 않는다", () => {
    const t = setup();
    t.layout();
    const box = document.createElement("textarea");
    document.body.appendChild(box);
    key(box, "ArrowUp"); // 입력창에서 위 화살표: 따라가기가 풀리면 안 된다
    t.grow(60);
    expect(t.thread.scrollTop).toBe(900 + 60 - VIEW);
    t.userScrollTo(400);
    t.userScrollTo(200); // 위로 올려 읽는 중
    key(box, "End"); // 입력창의 End: 되살리면 안 된다
    t.grow(60);
    expect(t.thread.scrollTop).toBe(200);
    box.remove();
  });

  it("touchcancel 및 pointercancel 발생 시 사용자 상호작용 상태를 리셋하여 부당한 따라가기 해제를 막는다", () => {
    const t = setup();
    t.layout(); // 바닥에서 따라가기 중
    expect(t.thread.scrollTop).toBe(900 - VIEW);

    // 1. pointerdown 후 시스템에 의해 pointercancel 발생
    act(() => {
      t.thread.dispatchEvent(new PointerEvent("pointerdown"));
      window.dispatchEvent(new PointerEvent("pointercancel"));
    });

    // 사용자가 손을 뗐으므로 상호작용 중이 아니다.
    // 임의의 스크롤(예: 레이아웃 갱신 등)로 일시적 바닥 이탈(gap > NEAR_BOTTOM)이 발생해도 상호작용 중이 아니면 따라가기가 유지되어야 한다.
    act(() => {
      t.thread.scrollTop = 900 - VIEW - 60; // gap = 60 > NEAR_BOTTOM
      t.thread.dispatchEvent(new Event("scroll"));
    });

    t.grow(80);
    expect(t.thread.scrollTop).toBe(900 + 80 - VIEW); // 따라가기가 풀리지 않고 바닥으로 가야 함

    // 2. touchstart 후 touchcancel 발생
    act(() => {
      t.thread.dispatchEvent(new TouchEvent("touchstart", { touches: [{ clientY: 200 } as Touch] }));
      t.thread.dispatchEvent(new TouchEvent("touchcancel", { touches: [] }));
    });

    act(() => {
      t.thread.scrollTop = 900 + 80 - VIEW - 60;
      t.thread.dispatchEvent(new Event("scroll"));
    });

    t.grow(80);
    expect(t.thread.scrollTop).toBe(900 + 80 + 80 - VIEW);
  });

  it("손가락이 눌린 채 브라우저가 pointercancel 을 보내도(스크롤 인계) 그 터치의 드래그는 상호작용이라 바닥으로 끌려가지 않는다", () => {
    const t = setup();
    t.layout(); // 바닥에서 따라가기 중
    expect(t.thread.scrollTop).toBe(900 - VIEW);

    // 터치 시작 -> 브라우저가 스크롤을 넘겨받으며 pointercancel. 손가락은 아직 떼지 않았다.
    act(() => {
      t.thread.dispatchEvent(new PointerEvent("pointerdown"));
      t.thread.dispatchEvent(new TouchEvent("touchstart", { touches: [{ clientY: 200 } as Touch] }));
      window.dispatchEvent(new PointerEvent("pointercancel"));
    });
    // 손가락이 시작점보다 위에 있어 touchmove 의 방향 판정으로는 따라가기가 풀리지 않는 상태에서, 화면이 바닥에서 60px 올라간다.
    act(() => {
      t.thread.dispatchEvent(new TouchEvent("touchmove", { touches: [{ clientY: 150 } as Touch] }));
      t.thread.scrollTop = 900 - VIEW - 60;
      t.thread.dispatchEvent(new Event("scroll"));
    });

    t.grow(80); // 손가락이 눌린 채 대화가 자란다
    expect(t.thread.scrollTop).toBe(900 - VIEW - 60);

    // 손가락을 떼면 상호작용이 끝난다: 이후 touchcancel 만 오는 터치(시스템 제스처)도 상태를 남기지 않는다.
    act(() => { t.thread.dispatchEvent(new TouchEvent("touchend", { touches: [] })); });
    act(() => {
      t.thread.dispatchEvent(new TouchEvent("touchstart", { touches: [{ clientY: 200 } as Touch] }));
      t.thread.dispatchEvent(new TouchEvent("touchcancel", { touches: [] }));
    });
    t.userScrollTo(900 + 80 - VIEW); // 사용자가 바닥으로 돌아와 따라가기가 복구된다
    t.grow(40);
    expect(t.thread.scrollTop).toBe(900 + 80 + 40 - VIEW);
  });

  it("touchcancel 만으로도 상호작용 상태가 풀린다(pointercancel 없이)", () => {
    const t = setup();
    t.layout();
    act(() => {
      t.thread.dispatchEvent(new TouchEvent("touchstart", { touches: [{ clientY: 200 } as Touch] }));
      t.thread.dispatchEvent(new TouchEvent("touchcancel", { touches: [] }));
    });
    act(() => {
      t.thread.scrollTop = 900 - VIEW - 60;
      t.thread.dispatchEvent(new Event("scroll"));
    });
    t.grow(80);
    expect(t.thread.scrollTop).toBe(900 + 80 - VIEW);
  });

  it("세션이 바뀌면 이전 세션에서 켜졌던 새 메시지 점프 버튼(jump)이 초기화되어 사라진다", () => {
    const t = setup();
    t.layout();
    expect(t.page.queryByTestId("jump-btn")).toBeNull();

    // 위로 올려서 바닥에서 벗어남 -> jump 버튼 표시
    t.userScrollTo(200);
    t.grow(60);
    expect(t.page.queryByTestId("jump-btn")).not.toBeNull();

    // 세션 전환
    t.changeDep("another-session");

    // 새 세션에서는 jump 버튼이 즉시 초기화되어야 함
    expect(t.page.queryByTestId("jump-btn")).toBeNull();
  });

  it("사이드 패널(aside, dialog) 안의 요소에 포커스가 있을 때 누른 화살표/End 키는 대화 스레드의 따라가기를 건드리지 않는다", () => {
    const t = setup();
    t.layout();
    expect(t.thread.scrollTop).toBe(900 - VIEW);

    const aside = document.createElement("aside");
    aside.className = "desk-split__node";
    const panelBtn = document.createElement("button");
    panelBtn.textContent = "작업 노드";
    aside.appendChild(panelBtn);
    document.body.appendChild(aside);

    // 사이드 패널 안의 버튼에서 ArrowUp 누름: 대화 스레드 따라가기가 풀리면 안 됨
    key(panelBtn, "ArrowUp");
    t.grow(60);
    expect(t.thread.scrollTop).toBe(900 + 60 - VIEW);

    // 사용자가 대화 스레드를 위로 스크롤하여 따라가기를 해제함
    t.userScrollTo(400);
    t.userScrollTo(200);
    expect(t.thread.scrollTop).toBe(200);

    // 사이드 패널 안의 버튼에서 End 키 누름: 대화 스레드가 바닥으로 끌려가면 안 됨
    key(panelBtn, "End");
    t.grow(60);
    expect(t.thread.scrollTop).toBe(200); // 200 유지

    aside.remove();
  });
});
