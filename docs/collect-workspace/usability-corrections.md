# 수집 작업공간 사용성 교정

## 관측과 변경

- 독립 감사와 실제 `CollectPage` 코드에서 프로젝트 목록이 검토 진입 전부터 마운트되고, 검토가 운영·고급 설정 안에 묻혀 있었음을 확인했다. 상단에 프로젝트·검토·운영 영역을 두고 URL `view`에서 선택 상태를 직접 계산한다. `view=review`에서는 프로젝트 목록을 마운트하지 않으며 `overview|sources|runs|quality`, 신규 계획, mission 상세 경로를 유지한다.
- 독립 감사는 검토 50행의 긴 목록, 각 행 반복 안내와 기본 펼침 판정 폼, 맨 아래 페이지 조작을 관측했다. 자동 평가 설명은 목록 공통 안내로 모으고 행별 출처·상태·사유·우선순위·미리보기·가능 조치를 남겼다. 판정·적재 폼은 행별 버튼으로 열며 페이지 불러오기·실패 재시도는 목록 위아래에서 제공한다. 기존 필터, 판정·적재·재처리, 정책 차단 제외 및 페이지 오류 시 목록 보존 동작은 관련 회귀 테스트로 확인했다.
- 기준 계약의 trace stage 단위 확인 결과, `load` 수는 적재 처리된 distinct 자료이고 `trace.documents`는 API 최대 3,000개 문서 응답 목록이다. 두 숫자에 각각 단위를 붙이고 응답 목록은 전체 누계가 아님을 상세·요약에 표시했다. 원자료와 숫자 값은 바꾸지 않았다.

## 검증

- 검증 대상 코드·테스트 revision: `794d0e902dac50d4582ca9ed9582df3de0c49672`; 시작 revision은 `7c301a3787eee132bea51ce2e8cea97f01d82bc1`.
- `TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/pages/CollectPage.test.tsx src/features/collector/ReviewWorkspace.test.tsx src/features/collector/ReviewIndependentAudit.test.tsx src/features/collector/Collector.test.tsx src/features/collector/Missions.test.tsx --reporter=dot` — 5개 파일, 59개 테스트 통과.
- `TTAKKARI_NO_ENV_FILE=1 pnpm exec eslint src/pages/CollectPage.tsx src/features/collector/Review.tsx src/features/collector/MissionTrace.tsx src/pages/CollectPage.test.tsx src/features/collector/ReviewWorkspace.test.tsx` — 종료 코드 0, 진단 없음.
- `node scripts/ui-lint.mjs` — 기준선 위반 138건 이하, 신규 위반 증가 없음. `git diff --check` — 종료 코드 0, 출력 없음.
- 실제 브라우저 화면과 반응형 계측은 독립 감사 Run `b91696c3` 소유이므로 미검증이다. 높이/스크롤 개선 수치는 추정하지 않았다. 이 작업에서 운영 mutation은 실행하지 않았다.

## 2026-11-07 독립 API 감사 후속

- 제품 코드 revision: `78635d328b983b1dbda8dab41450c5ace5607996`.
- backend source checkout `d74300c5963920c524d35680b7a6b844132cedac`의 `src/ttakkari/collector/missions.py`에서 `precise_waiting = pending + processing`, `precise_unresolved = unresolved`를 확인했다. `pipeline.py`는 `canonical_candidate`에 후보 envelope 식별자를 문자열로 기록한다. 따라서 구형 대기 집계는 “대기·처리 합계”로 표시하고, 정밀 triage 개별값이 있으면 그 값을 우선한다. 누락된 개별값은 미확인으로 남긴다.
- 결함 A: `ResearchPanel`과 임무 화면에서 구형 `counts.precise_waiting`/`precise_unresolved`를 놓치던 경로를 공유 `preciseEvalSummary`로 교정했다. triage의 0도 유지하고 pending/processing/unresolved를 임의 계산하지 않는다.
- 결함 B: `CollectDedupe.canonical_candidate`를 `string | null`로 맞췄다. 독립 경계와 Review fixture는 실제 문자열 ID를 사용하며, 기술 상세에서 식별자를 원문 필드로 표시하고 링크나 승인 상태로 해석하지 않는 것을 확인한다.
- 수정 전 red: `TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/features/collector/CollectWorkspaceBoundaryAudit.test.tsx src/features/collector/ReviewWorkspace.test.tsx --reporter=dot` — 의도한 구형 집계 assertion 2건 실패, 나머지 12건 통과.
- 수정 후 green: `TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/features/collector/CollectWorkspaceBoundaryAudit.test.tsx src/features/collector/Missions.test.tsx src/features/collector/ResearchPanel.test.tsx src/features/collector/ReviewIndependentAudit.test.tsx src/features/collector/ReviewWorkspace.test.tsx --reporter=dot` — 5개 파일, 31개 테스트 통과.
- 변경 TS/TSX ESLint — 종료 코드 0, 진단 없음. `node scripts/ui-lint.mjs` — `ui-lint ok · 위반 138건(기준선 138건 이하, 새로 늘지 않음)`. `git diff --check` — 종료 코드 0.
- 실화면 브라우저 검증과 운영 쓰기는 미검증·미실행이다. 브라우저는 독립 감사 소유이므로 열지 않았다.
