# 수집 주제와 실행 내역 분리

사용자가 반복된 복구 요청이 목록에 쌓이는 점을 지적했다. 원인은 mission 목록이 곧 주제 목록이었던 구조다. backend topic_key(지시문 전문·참고 맥락·명시 URL의 동일성)를 기준으로 주제를 묶고 현재 수집 한 건과 각 시도의 실행 내역을 분리했다. 제목이 같은 별도 지시문은 합치지 않는다. 이전 시도의 적재량은 현재 건수에 합산하지 않는다.

주제 / 실행 내역 / 새 수집 메뉴, 주제별 내역 필터, 과거 시도→현재 수집 이동, 상세의 실행 회차 탭, 과거 시도의 쓰기 제어 숨김을 구현했다. 새 제출은 reuse_existing=true로 기존 수집을 열며 랜덤 요청 키를 새로 만들지 않는다. 재실행·추가·보충은 기존 회차 API를 사용한다. 목록은 100건씩 읽고 더 불러온 동일 주제는 합친다. topic_key가 없는 이전 서버 응답은 추정으로 합치지 않고 각 기록을 보존한다.

검증: 새 UI 검사 변경 전 5 failed/26 passed. 수정 후 CollectPage/API 34 passed. 전체 vitest 1596 passed/10 skipped, TypeScript·대상 ESLint·ui-lint(기존 기준선138)·production build passed. 최종 heading wrapper/CSS 후 변경 표면34건과 TypeScript·대상 ESLint·ui-lint·build 재확인.

configured ttakkari_browser로 실제 Missions.tsx+디자인 토큰에 합성 데이터(주제2, 시도6)를 넣어 390x844/1440x900 계측과 직접 조작을 확인했다. 주제→주제별 내역3건→과거 상세→현재 수집→회차 이동을 실행했다. collect.js fullPage 계측 3회 coverage1.0, overflow/overlap 없음. 남은 관찰2개는 서로 다른 역할 컨트롤의 패딩 비율과 검증용 h1 행간이며 제품 결함 판정은 아니다. 최종 console errors0. UI 증거는 backend reports/collector/topic-history-layout-20261106.json. 운영 로그인 UI, 실제 Safari, 다크모드는 미검증이다.

초기 Vite 프로세스는 파일 변경을 반영하지 않아 실제 서빙 모듈의 heading wrapper 부재를 확인 후 소유한 개발 서버만 종료·기동했다. 최종 위 검증은 재기동 후 코드다. Codex 명령 환경 ps는 operation not permitted였으나 이를 운영 장애로 일반화하거나 다른 경로로 재시도하지 않았다. 실제 브라우저는 configured MCP만 사용했다.

운영 반영은 backend의 새 계약이 활성화된 뒤 프론트 main에 반영한다. backend 근거와 배포 상태는 back-mission-domain-20261106/docs/work-history/2026-11-06-collection-topic-history.md 및 영속 목표 계약에서 이어간다.
