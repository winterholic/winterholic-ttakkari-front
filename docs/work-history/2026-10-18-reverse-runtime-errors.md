# 운영 역분석 부분 완료 사유 표시

운영 basename 재현의 실제 GPT 검증에서 stderr 차이가 발견되어 partial이 됐다.
상세 화면은 reconstruction partial의 error를 숨기고 있어 필요한 조치가 보이지 않았다.
실패 이유가 alert로 나타나야 한다는 회귀 테스트를 먼저 실패시킨 후 표시 조건을 고쳤다.

- vitest ReversePage.test.tsx: 10 passed.
- 변경 파일 eslint, ui-lint(138건/기준선 139 이내), 타입 검사 포함 build, git diff --check 통과.
- 운영 인증 브라우저 확인은 격리 프로필에 로그인 쿠키가 없어 미검증이다.
  이 테스트를 실제 로그인된 운영 화면 확인이라고 보고하지 않는다.
