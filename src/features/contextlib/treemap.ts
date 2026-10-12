/** squarified treemap(Bruls 외). 입력 가중치 합이 면적 전체가 되도록 정사각형에 가깝게 쪼갠다. 순수 함수라 테스트로 고정한다. */
export interface Rect { x: number; y: number; w: number; h: number }
export interface TreemapItem<T> { value: number; data: T }
export interface Placed<T> extends Rect { data: T; value: number }

function worst(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

export function squarify<T>(items: TreemapItem<T>[], rect: Rect): Placed<T>[] {
  const list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((a, i) => a + i.value, 0);
  if (!list.length || rect.w <= 0 || rect.h <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const areas = list.map((i) => i.value * scale);
  const out: Placed<T>[] = [];
  let { x, y, w, h } = rect;
  let i = 0;
  while (i < list.length) {
    const side = Math.min(w, h);
    let end = i + 1;
    let row = [areas[i]];
    while (end < list.length && worst([...row, areas[end]], side) <= worst(row, side)) {
      row = [...row, areas[end]];
      end += 1;
    }
    const sum = row.reduce((a, b) => a + b, 0);
    const horizontal = w >= h; // 짧은 변(side)을 따라 한 줄을 세운다.
    const thick = sum / side;
    let offset = 0;
    row.forEach((area, k) => {
      const len = area / thick;
      const item = list[i + k];
      out.push(
        horizontal
          ? { x, y: y + offset, w: thick, h: len, data: item.data, value: item.value }
          : { x: x + offset, y, w: len, h: thick, data: item.data, value: item.value },
      );
      offset += len;
    });
    if (horizontal) {
      x += thick;
      w -= thick;
    } else {
      y += thick;
      h -= thick;
    }
    i = end;
  }
  return out;
}

export function inset(r: Rect, by: number): Rect {
  const d = Math.min(by, r.w / 2, r.h / 2);
  return { x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d };
}

/** 아주 작은 항목도 누를 수 있게 전체의 floor 비율까지 키운다(면적은 근사). 키운 항목이 있는지도 돌려준다. */
export function withFloor<T>(items: TreemapItem<T>[], floor = 0.015): { items: TreemapItem<T>[]; inflated: boolean } {
  const total = items.reduce((a, i) => a + i.value, 0);
  const min = total * floor;
  let inflated = false;
  const out = items.map((i) => {
    if (i.value > 0 && i.value < min) {
      inflated = true;
      return { ...i, value: min };
    }
    return i;
  });
  return { items: out, inflated };
}
