#!/usr/bin/env bash
# 모든 주요 경로를 320/390/768/1024/1440 폭에서 연다. 평소 + 긴 글자 주입, 가로 넘침·잘림·이중 간격·터치 타깃·입력 글자 크기·safe-area 를 검사한다.
# 규칙과 고치는 법: winterholic-design-system/ttakkari/docs/22-ui-error-prevention.md
# 사용: scripts/ui-sweep/run.sh [추가 옵션: --widths=320,390 --routes=/memos,/settings --stress-raw --no-fail]
# 마지막에 modals.mjs(모달·메뉴를 실제로 열어 검사)도 돈다. 모달만: node scripts/ui-sweep/modals.mjs --url=http://127.0.0.1:5399 [--shots=/tmp/m]
# Chrome 한 번 + WebKit(iOS Safari 와 같은 엔진, iPhone 프리셋 320/390) 한 번 돈다. 실기기 결함은 Chrome 에뮬레이션만으로는 안 보였다.
# WebKit 만: --browser=webkit, Chrome 만: --browser=chrome. WebKit 스크린샷·수치: node scripts/ui-sweep/webkit-shots.mjs --url=... --out=... --tag=...
# 필요: Chrome, `npx playwright install webkit`, playwright-core(PLAYWRIGHT_CORE=<경로>/index.mjs). 실제 서버·계정은 쓰지 않는다(API 는 stub.mjs 의 합성 데이터).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FRONT="$(cd "$HERE/../.." && pwd)"
DS="${TTAKKARI_DS:-$(cd "$FRONT/../../winterholic-design-system" && pwd)}"
PORT="${PORT:-5399}"
ROUTES="${ROUTES:-/chat,/work,/tasks,/tasks/failed,/workspace,/library,/files,/settings,/assistant,/more,/notifications,/weather,/resources,/meetings,/meetings/new,/pms,/wbs,/checklists,/memos,/calendar,/context-library?tab=overview,/context-library?tab=structure,/context-library?tab=ontology,/context-library?tab=search,/context-library?tab=quality,/chat/s1,/meetings/m1,/pms/p1,/pms/p1/board,/pms/p1/notes,/wbs/p1,/memos/memo1,/checklists?mode=edit,/calendar?view=list,/github,/github?as=alice,/github/alice?as=alice,/github/alice/demo?as=alice,/github/alice/demo/code?as=alice,/github/alice/demo/code?as=alice&path=src/index.ts,/github/alice/demo/code?as=alice&path=logo.png,/github/alice/demo/pulls?as=alice,/github/alice/demo/pulls/12?as=alice,/github/alice/demo/pulls/12?as=alice&tab=files,/github/alice/demo/issues?as=alice,/github/alice/demo/issues/7?as=alice,/github/alice/demo/actions?as=alice,/github/alice/demo/actions/runs/9001?as=alice,/github/alice/demo/actions/runs/9001/jobs/5001?as=alice}"
# 위 뒤쪽 아홉 경로는 상세 화면이다. 기본 스텁이 [] 를 주면 "화면을 그리다 멈췄어요" 로 떨어져 한 번도 검사되지 않았다(fixtures-detail.mjs 가 합성 데이터를 준다).

cd "$FRONT"
TTAKKARI_NO_ENV_FILE=1 VITE_API_BASE="http://127.0.0.1:$PORT" pnpm exec vite --port "$PORT" --strictPort --host 127.0.0.1 >/tmp/ui-sweep-vite.log 2>&1 &
VITE_PID=$!
trap 'kill $VITE_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -fs "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 0.5; done

status=0
RUN_CHROME=1; RUN_WEBKIT=1; PASS=()
for a in "$@"; do
  case "$a" in
    --browser=webkit) RUN_CHROME=0 ;;
    --browser=chrome) RUN_WEBKIT=0 ;;
    *) PASS+=("$a") ;;
  esac
done
if [[ $RUN_CHROME == 1 ]]; then
  node "$DS/scripts/ttakkari-layout.check.mjs" --url="http://127.0.0.1:$PORT" --routes="$ROUTES" --stub="$HERE/stub.mjs" ${PASS[@]+"${PASS[@]}"} || status=$?
fi
# WebKit: 폰 폭 두 개(SE 320, iPhone 390)에서 같은 규칙을 한 번 더. 날짜 입력·파일 선택·본문 가로 넘침은 여기서 잡힌다.
if [[ $RUN_WEBKIT == 1 ]]; then
  node "$DS/scripts/ttakkari-layout.check.mjs" --browser=webkit --widths=320,390 --url="http://127.0.0.1:$PORT" --routes="$ROUTES" --stub="$HERE/stub.mjs" ${PASS[@]+"${PASS[@]}"} || status=$?
fi
# 첫 실행 소개가 열린 상태(모달 크기·넘침·터치)도 같은 폭으로 본다. --routes 로 좁힌 실행에서는 건너뛴다.
if [[ $RUN_CHROME == 1 && ! " $* " =~ " --routes" ]]; then
  SWEEP_ONBOARDING=1 node "$DS/scripts/ttakkari-layout.check.mjs" --url="http://127.0.0.1:$PORT" --routes="/chat" --stub="$HERE/stub.mjs" "$@" || status=$?
fi
# 조건부로 그려지는 모달·메뉴는 위 검사가 열지 못한다. 대표 모달을 직접 열어 이중 간격·폭·라벨·체크박스·메뉴 잘림을 본다(Chrome 만).
if [[ $RUN_CHROME == 1 && ! " $* " =~ " --routes" ]]; then
  node "$HERE/modals.mjs" --url="http://127.0.0.1:$PORT" || status=$?
fi
exit $status
