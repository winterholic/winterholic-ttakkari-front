# 리버스 엔지니어링 자연어 요청·소스 재현 화면

사용자는 GitHub 주소 중심 입력을 거부하고, 대상과 재현 목표를 채팅처럼 자세히 설명해
우리 작업공간에 소스를 작성하도록 기능을 바꾸라고 명시했다.

- 여러 줄 자연어 textarea(40,000자)와 선택 작업공간, description/workspace_id 요청으로 전환.
- 상세에 대상 설명·소스 경로·관찰·실행 검사·독립 검증·실행 도구 기록·파일 탐색·ZIP·후속 지시·중지 연결.
- 구현/검증 과정은 진행 중 펼치고 완료하면 접는다. legacy 저장소 분석은 이전 기록으로 표시한다.
- needs_input에서 설명 보충을 유도하고 waiting도 폴링한다. API·MCP 계약은 백엔드 ADR 0041 참조.
- 테스트 먼저 새 계약 3건 실패를 확인한 후 구현. 페이지 테스트 9 passed.
- 전체 프론트 테스트 613 passed, 1 skipped. 타입 검사·빌드·변경 파일 eslint 통과.
  ui-lint 138건(기존 기준선 139 이내), git diff --check 통과.
- configured ttakkari_browser의 390px/1280px에서 합성 API 데이터로 화면과 자연어 입력→상세 이동 확인.
  textarea box-sizing 누락을 계측·수정. 마지막 로컬 빌드 브라우저 콘솔 0 errors.
  실제 로그인·운영 API·상용 모델 분석은 이 UI 검사로 검증하지 않았다.
- 화면 캡처는 기획 Run 3c0ade4a-bb09-4f54-8867-e9a072e78193의 outbox/browser.
