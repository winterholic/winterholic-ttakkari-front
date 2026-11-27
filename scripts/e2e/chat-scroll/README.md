# chat-scroll E2E

대화 스크롤 12개 시나리오를 실제 입력·화면 위치로 검증한다. 합성 mock 백엔드(`mock-api.mjs`)와 Vite 개발 서버를 loopback 에 띄우고 실제 계정·토큰은 쓰지 않는다.

```
PLAYWRIGHT_CORE=<경로>/playwright-core/index.mjs node scripts/e2e/chat-scroll/chat-scroll.e2e.mjs [--browser=chromium|webkit] [--scenarios=4,6] [--json=<파일>] [--chromium-mobile]
node scripts/e2e/chat-scroll/prepare-failure.check.mjs      # 브라우저 없이 준비 실패 시 서버 정리를 검사
PLAYWRIGHT_CORE=... node scripts/e2e/chat-scroll/perf.mjs --browser=chromium --variant=current|content-visibility [--label=...] [--runs=3]
```

환경: `PLAYWRIGHT_CORE`, `CHAT_SCROLL_VITE_PORT`(5899), `CHAT_SCROLL_MOCK_PORT`(5898), `CHAT_SCROLL_HOOK_VARIANT`(교정 전 `useThreadFollow` 대체 파일의 절대 경로, 소스는 건드리지 않고 Vite alias 로만 바꾼다).

## 입력과 프로파일
- 입력은 Playwright 의 신뢰된 휠·키보드·클릭만 쓴다. `scrollTop` 직접 대입이나 `dispatchEvent` 는 쓰지 않는다.
- 키보드 스크롤은 스레드가 포커스를 못 받으므로(클릭하면 `<main>` 이 가져간다) 입력창에서 Shift+Tab 으로 스레드 안 컨트롤에 포커스를 옮긴 뒤 보낸다.
- `chromium-desktop` 1280x800, `webkit-iphone-viewport` iPhone 14 뷰포트·UA 이지만 `isMobile=false`(Playwright 모바일 WebKit 은 `mouse.wheel` 미지원이고 터치 스크롤 API 가 없다), `webkit-iphone-emulated` `isMobile=true`+터치(휠·Tab 포커스 불가라 스크롤 입력이 필요 없는 9·12 만).
- 검증하지 못하는 것: iPhone 실기기 터치 제스처, 실제 소프트 키보드(뷰포트 축소로 에뮬레이션), 스크롤바 드래그.

## 판정 방식
- 메시지는 안정 ID(`author:run번호`), 위치는 `.tk-thread` 기준 픽셀이다. 입력 직후 사용자가 보는 기준 메시지가 지연 로딩·카드 폴링·스트리밍 뒤에도 ±2px 안에 있는지 본다.
- 각 시나리오는 원인 동작(요청·응답·높이 변화·입력 이탈량)이 실제로 있었음을 먼저 단언한다. 없으면 PASS 하지 않는다.
- 스트리밍을 따라가는 중에도 성장 직후·보정 전 프레임을 읽으면 gap 이 한 틱(약 40px) 나오므로 `followSample` 은 표본 안에서 gap 이 0 으로 되돌아오는지로 본다.
