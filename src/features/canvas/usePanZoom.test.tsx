import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { usePanZoom } from "./usePanZoom";

function Probe() {
  const { ref, view } = usePanZoom();
  return (
    <div ref={ref} data-testid="board" data-view={JSON.stringify(view)}>
      <button type="button">노드</button>
    </div>
  );
}

const pointer = (type: string, x: number, y: number) =>
  new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 } as PointerEventInit);

afterEach(cleanup);

describe("usePanZoom", () => {
  it("끌다가 같은 틈에 손을 떼도 터지지 않고 끈 만큼 옮긴다", () => {
    const { getByTestId } = render(<Probe />);
    const board = getByTestId("board");
    board.setPointerCapture = () => {};
    // 이동과 떼기가 React 가 그리기 전에 한꺼번에 들어오는 경우(빠른 끌기). 전에는 drag 가 null 이 된 뒤 갱신 함수가 돌아 터졌다.
    act(() => {
      board.dispatchEvent(pointer("pointerdown", 100, 100));
      // 첫 갱신은 바로 계산되고, 이미 대기 중인 갱신이 있으면 다음 것은 그릴 때 돈다. 두 번 옮긴 뒤 떼야 재현된다.
      board.dispatchEvent(pointer("pointermove", 130, 110));
      board.dispatchEvent(pointer("pointermove", 160, 130));
      board.dispatchEvent(pointer("pointerup", 160, 130));
    });
    expect(JSON.parse(board.dataset.view!)).toMatchObject({ x: 60, y: 30, k: 1 });
  });

  it("노드(버튼) 위에서 시작한 누름은 판을 옮기지 않는다", () => {
    const { getByRole, getByTestId } = render(<Probe />);
    const node = getByRole("button");
    act(() => {
      node.dispatchEvent(pointer("pointerdown", 0, 0));
      node.dispatchEvent(pointer("pointermove", 80, 80));
    });
    expect(JSON.parse(getByTestId("board").dataset.view!)).toMatchObject({ x: 0, y: 0 });
    fireEvent.click(node);
  });
});
