# 수집 워크스페이스 통합 교정 기록

## 변경 범위

- 시작 revision: `d87b696fbffcb63600b62487a0916d71779b49c8`.
- 작업 카드 기준: 기존 `0b28512`, `8bd151cf`, `9e71bd1` 변경을 보존한다. 작업 시작 시 HEAD는 위 시작 revision이었고, reset·checkout·rebase 없이 해당 작업 트리에서 교정했다.
- 이전 작업 카드 기록: Run `3145959d`, `e8d19f8c`, `743b88c8`, `76d7bb6a`는 queued에서 취소된 상태로 이양 문서에 기록되어 있었다. 이번 Run에서는 해당 작업을 재실행하거나 중단하지 않았다.
- 수정 파일은 작업 카드에 지정한 Collector/Review/Research/Missions/CSS/API 타입 및 전용 테스트에 한정했다. 기존 미추적 baseline·evidence·감사 파일은 stage하지 않았다.

## 결함과 교정

1. **통합 `Collector.test.tsx`의 네 실패** — 실패는 수집 동작 회귀가 아니라 이전 문구 기대(`내 검토 대기`, 이전 빈 상태/검토 총량 표현)와 현재 화면 문구의 불일치였다. 기대 문구를 실제 제공 상태에 맞췄고 정지 요청, `ItemReview` 판단·적재 mutation, 표본 그룹 조작 검증은 유지했다. `teacher_enabled=false`에서 모델 호출 중단·비용 0·규칙 전용을 도출하지 않도록 관련 부정 검증을 유지하고, 비용·호출 값은 응답 필드로만 단언한다.
2. **CSS lint** — `review-workspace.css`의 고정 `3px` 및 미정의 `--tk-border-width-thick` fallback을 정의된 `--tk-space-px` 토큰으로 교체했다. 토큰 기준선은 수정하지 않았다.
3. **정밀 평가·가용 상태** — Missions의 `busy`를 로컬 모델 실행 단정에서 중립 문구로 바꿨다. mission 응답의 `pending`, `processing`, `unresolved` 및 엔진 가용 상태를 ResearchPanel과 품질 상세에 표시한다. 없는 카운트는 `미확인`, `unavailable`은 엔진 이름이 아닌 사용 불가 상태로 표시한다. 모델명과 별도 실행 상태는 미확인이다. Review/Overview의 미제공 안내는 각각 검토 응답·현황 응답의 범위로 한정했다.
4. **재처리 필터/버튼 경계** — 공통 `canReprocessItem` 판정을 사용해 `status === held`, `can_reprocess === true`, 정책 차단 아님을 모두 만족할 때만 필터와 버튼에 나타난다. accepted 행과 권리·정책 차단은 재처리 대상이 아니다.
5. **dedupe 계약** — `exact_of`, `cluster_id`, `canonical_candidate`, `canonical_status`, `algorithm_version`을 선택적 nullable 타입으로 보존했다. 응답된 근거는 기술 상세에 노출하고, `exact_of`가 있는 경우 식별자만 표시한다. null/미제공은 미확인으로 두며 대상 문서 링크를 만들지 않는다.
6. **decision 생략** — 상세 응답의 `decision`을 선택적으로 정의했다. decision이 없으면 최상위 status와 reason_codes를 표시하며, decision이 있으면 해당 값을 우선 표시한다. decision state는 `accept/reject/hold` 판정 라벨로 읽는다.
7. **독립 회귀 및 페이지 오류** — 독립 감사의 버그 재현 기대 3개를 정상 동작 기대값으로 바꿨다. 수정 전 세 항목은 모두 실패했고 수정 후 통과했다. 중복 필드 보존/추정 링크 금지와 다음 페이지 실패 후 기존 목록·필터 보존 및 재시도도 테스트했다.

## 실행 및 결과

- 수정 전 통합 묶음: `TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/features/collector/Collector.test.tsx src/features/collector/Missions.test.tsx src/features/collector/missionProjects.test.ts src/features/collector/ResearchPanel.test.tsx src/features/collector/ReviewWorkspace.test.tsx src/features/collector/ReviewIndependentAudit.test.tsx --reporter=dot` — 6 files, 34 tests 중 4 failed / 30 passed. 독립 감사 3개는 버그 존재를 기대한 테스트라 별도 의도적 red 실행에서 3 failed였다.
- 최종 관련 테스트 묶음은 같은 명령으로 실행: **6 files passed, 38 tests passed**.
- 변경 TS/TSX 파일 ESLint: 명시된 10개 제품·테스트 파일을 `pnpm exec eslint ...`로 실행 — exit 0, lint findings 없음.
- `node scripts/ui-lint.mjs` — `ui-lint ok · 위반 138건(기준선 138건 이하, 새로 늘지 않음)`.
- `git diff --check` — 출력 없음, exit 0.
- 전체 build는 최종 통합에서 실행하기로 한 범위이므로 이번 Run에서 미실행.
- 코드 교정 commit revision: `4450dac805bc3557bc57bd8093abdd50e8dec06a` (`fix(collect): reconcile integration review findings`).

## 미검증

- 실제 서버 쓰기 API: 미실행. review/import/reprocess/runtime/pilot 등 운영 mutation을 호출하지 않았다.
- 실화면·반응형 감사: 미실행. 브라우저 단독 소유자인 독립 감사 Run `b91696c3`가 진행 중으로 조회되었고 브라우저는 열지 않았다. 해당 감사 결과는 이 기록 시점에 미확인이다.
- API 타입·화면 검증은 Vitest mock 응답 기준이다. 별도 실운영 응답 대조는 실행하지 않았다.
