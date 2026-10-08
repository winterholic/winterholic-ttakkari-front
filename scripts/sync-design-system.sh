#!/usr/bin/env bash
# 디자인 시스템(winterholic-design-system/ttakkari)의 빌드 산출물을 앱 안으로 복사한다.
# Vercel 빌드에서 서브모듈 인증을 피하려고 산출물을 커밋한다. 디자인 시스템을 갱신하면 이 스크립트를 다시 돌린다.
set -euo pipefail
SRC="${1:-$(cd "$(dirname "$0")/../../../winterholic-design-system/ttakkari" && pwd)}"
DEST="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$DEST/src/vendor/ttakkari" "$DEST/public/brand"
for f in tokens.css typography.css components.css prose.css monaco-theme.json tokens.js tokens.d.ts pwa.json; do
  cp "$SRC/dist/$f" "$DEST/src/vendor/ttakkari/$f"
done
find "$SRC/assets/brand" -maxdepth 1 -type f \( -name '*.png' -o -name '*.svg' -o -name '*.ico' -o -name '*.webp' \) -exec cp {} "$DEST/public/brand/" \;
git -C "$SRC" log -1 --format='%h %s' -- . > "$DEST/src/vendor/ttakkari/VERSION"
echo "synced from $SRC ($(cat "$DEST/src/vendor/ttakkari/VERSION"))"
