# G30·G31 구간 피드백 프론트 연결

녹화·구간 선택 뒤 대표 화면을 장별로 제외하고 “이 구간을 수정 요청에 담기”로 메모리에 보관한다. 최종 “AI 수정 요청” 때만 선택된 JPEG를 기존 /api/uploads로 올리고 feedback.clip에 Artifact ID·시각·원래 빌드 ID를 전달한다. 다른 빌드의 캡처·픽킹과 혼합하지 않는다. 장당 1MB·합계 6MB, 1~8장·15초 상한, 시각 순서와 JPEG 서명을 업로드 전에 검사한다. 업로드 실패 시 AI 요청을 시작하지 않고 입력을 보존한다. 깨진 JPEG 응답은 미리보기 전에 거부한다.

모바일 녹화 열기 상태에서 조작 버튼이 화면 오른쪽으로 넘쳤다(390px, 마지막 버튼 x=311+98=409). 그룹 최대 폭을 제한하고 줄바꿈하여 x=24+98=122, 그룹 x=24+342=366으로 화면 안에 들어온 것을 확인했다.

검증: node node_modules/vitest/vitest.mjs run src/features/games, node node_modules/typescript/bin/tsc -b, node node_modules/eslint/bin/eslint.js src/features/games src/api/gameTypes.ts, TTAKKARI_NO_ENV_FILE=1 node node_modules/vite/bin/vite.js build. 최종 결과는 커밋 시 실행 로그와 종료 보고에 따른다.

브라우저: configured ttakkari_browser 경로의 Chromium 390x844에서 실제 GameCockpit·GamePlayer·FeedbackForm을 합성 게임 bridge·합성 API와 연결했다. 1~2초를 선택하고 1.5초 화면을 제외: 담기 후 업로드 0, 최종 제출 후 JPEG 2장(1000ms·2000ms)과 b2에 대한 구조화 요청 1개. 최신 정적 빌드에서는 콘솔 오류 0. 1280px에서는 제출 후 화면 캡처만 확인했다. 증거: outbox/e195e118-a8c1-48d4-9f7d-6f586ce89546/browser/element-2026-10-20T13-08-37-500Z.png 및 page-2026-10-20T13-08-46-699Z.png. 이전 Vite 개발 서버 캐시에는 수정 전 CSS가 남아 있었고, 최종 계측은 소스에서 새로 만든 정적 검증 빌드로 수행했다.

서버 회귀: back의 PYTHONPATH=src .venv/bin/pytest -q tests/test_game_feedback_clip.py tests/test_game_feedback_request.py → 9 passed in 12.27s.

미검증: 실제 AI worker가 전달된 JPEG를 열어 수정한 결과·자동 빌드, 실제 게임을 포함한 운영 E2E, iOS Safari·실기기. 서버 테스트는 fake adapter이며 브라우저 API는 합성 응답이다. 따라서 G31 전체 E2E 완료로 표시하지 않는다. 다음 단위는 실제 worker 프레임 읽기 검증, 이어 G32 버전 이력 탐색·필터·비교다. 기존 잠금 결정·격리 빌드 정책·게임 외부 hostname 보류는 바꾸지 않았다.

실패한 업로드/요청 전에 이미 성공한 프레임 업로드는 기존 Artifact로 남을 수 있다(기존 스크린샷 업로드와 같은 수명주기). 자동 삭제를 새로 도입하지 않는다. main 푸시는 기존 Vercel 자동 배포를 시작하며 운영 적용은 별도 상태로 확인한다.
