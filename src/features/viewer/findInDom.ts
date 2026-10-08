/** 문서 안 찾기(markdown). 텍스트 노드를 mark[data-hit] 으로 감싼다. 지울 때 원래 텍스트 노드로 되돌린다. */
export function clearHits(root: HTMLElement): void {
  for (const m of Array.from(root.querySelectorAll("mark[data-hit]"))) {
    const parent = m.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(m.textContent ?? ""), m);
    parent.normalize();
  }
}

export function markHits(root: HTMLElement, query: string): HTMLElement[] {
  clearHits(root);
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest("mark[data-hit], script, style") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  const hits: HTMLElement[] = [];
  for (const node of nodes) {
    const text = node.data;
    const lower = text.toLowerCase();
    let from = 0;
    const parts: (string | HTMLElement)[] = [];
    for (let i = lower.indexOf(q, from); i !== -1; i = lower.indexOf(q, from)) {
      if (i > from) parts.push(text.slice(from, i));
      const mark = document.createElement("mark");
      mark.dataset.hit = "";
      mark.textContent = text.slice(i, i + q.length);
      parts.push(mark);
      hits.push(mark);
      from = i + q.length;
    }
    if (parts.length === 0) continue;
    if (from < text.length) parts.push(text.slice(from));
    node.replaceWith(...parts);
  }
  return hits;
}

export function setCurrentHit(hits: HTMLElement[], index: number): void {
  hits.forEach((h, i) => {
    if (i === index) {
      h.setAttribute("aria-current", "true");
      h.scrollIntoView({ block: "center" });
    } else h.removeAttribute("aria-current");
  });
}
