#!/usr/bin/env bash
# 모든 주요 경로를 320/390/768/1024/1440 폭에서 연다. 평소 + 긴 글자 주입, 가로 넘침·잘림·이중 간격·터치 타깃·입력 글자 크기·safe-area 를 검사한다.
# 규칙과 고치는 법: winterholic-design-system/ttakkari/docs/22-ui-error-prevention.md
# 사용: scripts/ui-sweep/run.sh [추가 옵션: --widths=320,390 --routes=/memos,/settings --stress-raw --no-fail]
# 필요: Chrome, playwright-core(PLAYWRIGHT_CORE=<경로>/index.mjs). 실제 서버·계정은 쓰지 않는다(API 는 stub.mjs 의 합성 데이터).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FRONT="$(cd "$HERE/../.." && pwd)"
DS="${TTAKKARI_DS:-$(cd "$FRONT/../../winterholic-design-system" && pwd)}"
PORT="${PORT:-5399}"
ROUTES="${ROUTES:-/chat,/work,/tasks,/tasks/failed,/workspace,/library,/files,/settings,/assistant,/more,/notifications,/weather,/resources,/meetings,/meetings/new,/pms,/wbs,/checklists,/memos,/calendar,/context-library?tab=overview,/context-library?tab=structure,/context-library?tab=ontology,/context-library?tab=search,/context-library?tab=quality}"

cd "$FRONT"
TTAKKARI_NO_ENV_FILE=1 VITE_API_BASE="http://127.0.0.1:$PORT" pnpm exec vite --port "$PORT" --strictPort --host 127.0.0.1 >/tmp/ui-sweep-vite.log 2>&1 &
VITE_PID=$!
trap 'kill $VITE_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -fs "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 0.5; done

node "$DS/scripts/ttakkari-layout.check.mjs" --url="http://127.0.0.1:$PORT" --routes="$ROUTES" --stub="$HERE/stub.mjs" "$@"
