# 알림 유형별 수신 설정 — 2026-11-06

상태: 기능의 백엔드·프론트 운영 적용 확인. 실제 휴대폰 OS 푸시 수신은 미검증이다.

- 기존 알림 설정 모달에 12종 토글과 설명을 추가했다. 기기별 푸시 구독과 모든 기기에 공통 적용하는 유형 선택을 분리했다.
- 일상 / 메인 직접 / 작업 상태와 하위 / 회의록과 서비스로 묶었다. 날씨·일정·할 일·메인 직접·메인 실패·회의록·로그인은 기본 켜짐, 메인 대기·하위 직접/실패/대기·배포는 기본 꺼짐이다.
- 서버 값을 읽고 선택 직후 한 종류만 저장한다. 저장 중에는 중복 조작을 막고 실패하면 이전 선택과 오류 토스트·재시도 안내를 남긴다. 조회 실패를 전체 꺼짐으로 표시하지 않는다.
- 날씨 화면은 수신 거부를 전송 실패로 표시하지 않고 브리핑을 계속 볼 수 있다고 안내한다.
- 알림 목록에도 세부 kind 이름을 표시한다. 기존 알림은 보존한다.

검증: 전체 vitest 1594 passed/10 skipped(마지막 CSS·오류 토스트 보강 전), 최종 관련 검사 41 passed(날씨 opt-out 표시 회귀 포함). tsc/build, 변경 파일 ESLint, ui-lint 통과. 지정 브라우저의 실제 컴포넌트+샘플 API에서 320/390/1280px, light/dark, 개별 토글 저장·reload·하단 내부 스크롤 확인. 최종390px dialog x12/폭366, 유형 행 12개 폭324/높이74px 이상. collectPage 최초 viewport 커버리지는 내부 스크롤 때문에 51.7%이고 전체 UI 감사로 주장하지 않는다. 최종 브라우저 콘솔 오류0. 실제 사용자 로그인·OS push는 미검증이다.

관련 백엔드: `winterholic-ttakkari-back/docs/work-history/2026-11-06-notification-preferences.md`. 기준 front e2d89e6. 기존 main 미커밋 변경은 건드리지 않았다.

## 운영 적용 후속 — 2026-11-07

- 백엔드 예약 `19f63617-cfd7-4354-a180-88d40b4d5a29`는 `draining`, 활성 revision은 `5f5cbd997addcb4ea084ab908790f8f6eec54122`다. `ttk get /api/notifications/preferences`에서 12종 응답을 확인했다. 날씨·일정·메인 직접 알림은 켜짐, 하위 직접·실패·대기 알림은 꺼짐이다. 운영 설정 변경과 푸시 시험 발송은 하지 않았다.
- 기능 커밋 `64ca2e0`을 최신 `origin/main` 위로 rebase한 결과는 `e00e539`다. `git range-diff e2d89e6..64ca2e0 origin/main..HEAD`에서 같은 변경(`=`)임을 확인했고, 통합된 다른 기능은 알림 변경 경로와 겹치지 않는다. 기존 검사 결과를 재사용하며 `git diff --check`도 확인했다.
- main `0669362` push 후 GitHub commit status의 Vercel `success / Deployment has completed`를 확인했다. 운영 `https://ttakkari.winterholic.net`의 `/assets/index-DNIu8vfp.js`에서 `알림 유형`, `하위 직접 알림`, `메인 직접 알림`, `notification-preferences`를, `/assets/client-D-FCpBnx.js`에서 `/notifications/preferences`를 확인했다. 이 후속 기록만 추가하는 커밋은 실행 코드를 바꾸지 않는다. 운영 사용자 로그인 토글 조작과 휴대폰 OS 푸시는 시험하지 않았다.
