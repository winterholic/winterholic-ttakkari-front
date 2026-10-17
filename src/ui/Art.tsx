import { useState } from "react";
import manifest from "../vendor/ttakkari/art-manifest.json";
import { Icon } from "./Icon";

export type ArtSize = "sm" | "md" | "lg";

// 디자인 시스템 docs/23 §3 슬롯 크기(CSS px). sizes 속성에 쓴다.
const SLOT_PX: Record<ArtSize, number> = { sm: 96, md: 154, lg: 230 };

// 납품된 컷의 키(동기화된 manifest). 여기 없는 키는 요청하지 않고 자리만 그린다.
const DELIVERED = new Set(Object.keys(manifest));

/**
 * 빈 상태·오류·온보딩의 마스코트 일러스트 자리(.tk-art). 장식이라 alt="" 이고 뜻은 옆 글이 말한다.
 * 컷이 아직 없거나 못 불러오면 같은 크기의 점선 자리(data-pending)를 남겨 레이아웃이 밀리지 않는다.
 */
export function Art({ name, size = "md" }: { name: string; size?: ArtSize }) {
  const [failed, setFailed] = useState(false);
  const cls = `tk-art tk-art--${size}`;
  if (!DELIVERED.has(name) || failed) {
    return <figure className={cls} data-pending="" data-art={name}><Icon name="image" /></figure>;
  }
  return (
    <figure className={cls} data-art={name}>
      <img
        src={`/art/${name}-480.webp`}
        srcSet={`/art/${name}-480.webp 480w, /art/${name}-960.webp 960w`}
        sizes={`${SLOT_PX[size]}px`}
        alt=""
        width={480}
        height={480}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </figure>
  );
}
