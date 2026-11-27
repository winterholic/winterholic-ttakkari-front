import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThreadFollow } from "./useThreadFollow";

// jsdom 에는 레이아웃이 없다. 메시지의 내용 좌표(tops)로 화면 위치(top - scrollTop)를 흉내 낸다.
// 시간은 일부러 흘리지 않는다: 사용자 스크롤을 '우리 스크롤 직후 일정 시간 밖'에서만 인정하는 구조를 잡으려는 테스트다.
const IDS = ["m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7"];
const VIEW = 140;

let resize = () => {};

function setup() {
  const tops: Record<string, number> = Object.fromEntries(IDS.map((id, i) => [id, i * 100]));
  let total = 900;
  function Thread() {
    const t = useThreadFollow("conversation");
    return (
      <div ref={t.ref} data-testid="thread">
        <button onClick={t.holdPosition}>이전 대화</button>
        <div ref={t.inner}>
          {IDS.map((id) => <article key={id} className="tk-message" data-testid={id}>{id}</article>)}
        </div>
      </div>
    );
  }
  const page = render(<Thread />);
  const thread = page.getByTestId("thread");
  Object.defineProperties(thread, { clientHeight: { value: VIEW }, scrollHeight: { get: () => total } });
  thread.getBoundingClientRect = () => new DOMRect(0, 0, 300, VIEW);
  for (const id of IDS) page.getByTestId(id).getBoundingClientRect = () => new DOMRect(0, tops[id] - thread.scrollTop, 300, 80);
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
    act(resize);
  };
  const hold = () => act(() => page.getByRole("button").click());
  return { thread, screenTop, userScrollTo, prepend, hold, grow: (dy: number) => { total += dy; act(resize); } };
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() {}
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
    act(resize); // 높이 변화 없음
    act(resize);
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
    act(resize);
    expect(t.screenTop("m5")).toBe(10);
  });

  it("사용자가 빠르게 방향을 바꿔도 마지막 위치가 다음 갱신에서 유지된다", () => {
    const t = setup();
    t.thread.scrollTop = 190;
    t.hold();
    t.prepend(300);
    t.userScrollTo(390);
    act(resize);
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
});
