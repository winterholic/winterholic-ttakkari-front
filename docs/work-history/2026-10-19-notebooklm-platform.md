# 2026-10-19 NotebookLM 플랫폼 화면

- 부가 기능 > NotebookLM(`/notebooklm`, 노트북 상세 `/notebooklm/:notebookId`). 백엔드는 ADR 0045 REST(`/api/notebooklm/*`)를 그대로 쓴다.
- 연결 상태 카드(7개 state, 로그인 창 시작·취소, 접속 확인, blocked 재개 확인 대화상자, 쿨다운 카운트다운, 세션 암호화 안 함 표시, 지원 안 함 기능과 이유, 접이식 metrics), 노트북 목록·생성·이름 변경·삭제, 상세의 소스 목록·추가(URL·YouTube·텍스트·파일)·삭제·등록 job 진행/취소, 질의(분석과 인용 분리, 마커 클릭 시 출처·인용 원문).
- Google 에 닿는 요청은 `ready` 일 때만 만든다. 상태 조회는 Google 요청이 없어 화면을 열 때마다 읽는다.
- job 폴링은 이 노트북의 진행 중(queued/running) job 이 있을 때만 2.5초 간격이고 모두 끝나면 멈춘다. 끝난 순간 소스 목록을 다시 읽는다.
- 코드 기준으로 계약과 달랐던 점: 중복 소스 200 응답의 `source` 는 `{id,title,kind}` 뿐이고, 업로드 413 은 `{detail:{code:"too_large"}}` 로 온다(client 의 `toApiError` 가 이미 푼다). 409 `duplicate` 는 "등록 중"과 "결과 불명"을 코드로 구분하지 않아 메시지를 그대로 보여 주고 목록 확인 뒤에만 force 를 연다.
- 화면 확인: `scripts/ui-sweep/notebooklm-shots.mjs`(합성 데이터, 모바일 390·데스크톱 1280). 실제 Google 로그인 세션이 없어 실데이터 화면은 미검증.
- 배포: main push 가 Vercel 자동 배포를 시작한다. 반영 여부는 push 뒤 Vercel 커밋 상태로 따로 확인한다.
