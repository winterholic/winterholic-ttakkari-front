# 통합 UI 좁은 검증 — 2026-11-07

## 판정과 범위

판정은 **부분**이다. 화면 검증 때 제품 소스 SHA `1fa18fd9ebc42caa4e90c4a03125883e264bb03e`에서 통합으로 달라진 프로젝트 목록, 주제 진입, 전체 실행 내역, 임무의 실행 회차 탭을 저장된 GET fixture로 desktop/mobile에서 확인했다. 종료 시 HEAD는 `e030ccf4148868a0bd3e5174f800423a44bb4204`로 이동했으며, 그 사이 추가된 커밋은 `integration-release-candidate-20261107.md`에만 기록된 docs-only였다. `1fa18fd9..e030ccf4` 제품 소스·manifest diff는 없었다. 이번 검증은 화면 이동과 fixture 렌더 확인이며 게시 승인이나 전체 제품 승인(R1–R10)이 아니다.

작업 전 현재 Run outbox UUID `anon-3ec202ad80ee0cc5a3b1`를 owner Run API로 조회했다. 출력은 `status=running`, `profile=회사 코덱스 ai2`였다. 계정 순서·토글과 인증 설정은 바꾸지 않았다.

작업 checkout은 `/Users/winterholic/development/projects/winterholic-ttakkari/front-collect-release-candidate-20261107`, HEAD는 위 SHA, 작업 전 `git status --short --branch`는 `## release/collect-workspace-20261107...origin/main [ahead 26]`로 clean이었다. 제품 코드는 수정하지 않고 이 감사 문서 한 파일만 추가했다.

## 통합 diff에서 이번에 확인한 화면 범위

`a028be2f9a447bbc09f9300468be01d43b8d1a18..1fa18fd9` 중 이번 대상은 다음이다.

- `src/features/collector/Missions.tsx`: 프로젝트·주제·실행 내역 메뉴와 화면 이동, 서버 확인 ID를 기준으로 주제 그룹을 만들고, 실행 회차 탭과 페이지 추가 불러오기를 제공한다.
- `src/features/collector/missionTopics.ts`: 이름이 같다는 이유만으로 임무를 합치지 않는 그룹 계산.
- `src/features/collector/missionProjects.ts`, `src/features/collector/collector.css`: 목록 정렬과 두 화면의 반응형 표시.

기존 상세의 나머지 탭, Review, ResearchPanel, 계획 미리보기는 반복하지 않았다. `794d0e9`와 `a028be2` 독립 UI 감사는 재사용했다. 8c0a286의 native 키보드 필터 미검증 결과도 그대로 재사용했으며 키보드 선택을 다시 시도하지 않았다.

## 저장 데이터와 경계

화면 입력은 후보의 `docs/collect-workspace/evidence/replay-fixture.json` 하나다. 문서상 출처는 익명화된 owner-authenticated GET 응답이며 관측 시각은 `2026-11-06T15:45:43.416672Z`다. 브라우저는 configured `ttakkari_browser`; app은 `127.0.0.1:5197`, 격리 read-only mock은 `127.0.0.1:5198`만 요청했다. 화면 시각은 KST, 표의 캡처 원시 시각은 UTC다.

- 저장 fixture의 mission list는 21행이며 `runs`가 21행에 존재한다. 선택 detail에는 3개 실행 회차가 저장돼 있어, 실행 내역과 회차 탭은 이 필드를 그대로 표시했다.
- mission list 21행에는 `topic_key`가 없다. 따라서 동일 제목을 병합하지 않았고, 주제 화면의 21개 단일 항목을 실제로 연결된 주제 그룹으로 해석하지 않는다. 이 표본은 메뉴 이동과 fallback 표시만 확인한다.
- 선택 detail의 `topic_key="replay"`는 integration commit `68c9a22`에서 fixture에 들어간 재생 표식이다(`git blame` 확인). 이를 실제 저장 주제 키로 사용하거나 근거로 주장하지 않았다.
- 목록 replay 중 `SHAPE_DEFAULT` 로그는 없었다. 기본값·topic key·추가 회차를 만들어 넣지 않았다. 화면에 보이는 `수집 과제 01` 같은 제목은 기존 익명 alias다.
- 완료 overlay mock은 사전 진단에서 목록 alias와 completion fixture ID가 join되지 않아 `mission_rows=0`, `selected_detail_joined=false`였다. 이 overlay는 버리고 저장된 baseline GET fixture를 직접 replay했다. 실패한 overlay 자료를 실제 화면 증거로 사용하지 않았다.
- 네트워크 요청 검토에서 collector 데이터 요청은 localhost mock으로만 향했고 모두 200 GET이었다. 유일한 POST는 로컬 mock의 가짜 `/api/auth/refresh`였다. 운영 collector GET/mutation, backend, DB, 정책, queue, push, deploy 요청은 하지 않았다.

## 화면 확인

최초 변경 전 기준은 원본 수집 checkout의 detached `e2d89e6` baseline 8장이다(보충 ZIP의 `baseline-e2d89e6/`과 screenshot manifest). `04eec5d`/`e070bc0` 화면은 이전 사용성 교정 후의 중간 스냅샷이며 최초 변경 전으로 부르지 않는다. 계정명이 보이는 desktop PNG는 비공개 보충 ZIP에만 넣고 공개 후보에서는 제외했다. 관측 시점이 다른 수치는 개선 성과로 비교하지 않는다. 통합 후보의 10PNG는 이미 대화에서 공유된 `collect-workspace-integration-evidence.zip`을 참조하며 이 Run에서 다시 열거나 복사하지 않는다. 주제·전체 실행 내역은 새 화면이라 원래 baseline 대응 화면이 없다.

| 단계 | 화면 | 뷰포트 | 캡처 시각 UTC | 증거 파일 |
|---|---|---:|---|---|
| 변경 전 (e2d89e6) | 수집 목록 | 1440×900 | 2026-11-06 15:30:13.635Z | `desktop-list-1440x900.png` (비공개 보충 ZIP) |
| 변경 전 (e2d89e6) | 선택 임무 상세 | 1440×900 | 2026-11-06 15:30:23.759Z | `desktop-detail-1440x900.png` (비공개 보충 ZIP) |
| 변경 전 (e2d89e6) | 검토 대기 | 1440×900 | 2026-11-06 15:30:37.546Z | `desktop-review-1440x900.png` (비공개 보충 ZIP) |
| 변경 전 (e2d89e6) | 계획 preview | 1440×900 | 2026-11-06 15:30:57.723Z | `desktop-plan-1440x900.png` (비공개 보충 ZIP) |
| 변경 전 (e2d89e6) | 수집 목록 | 390×844 | 2026-11-06 15:31:05.387Z | `mobile-list-390x844.png` (비공개 보충 ZIP) |
| 변경 전 (e2d89e6) | 선택 임무 상세 | 390×844 | 2026-11-06 15:31:11.541Z | `mobile-detail-390x844.png` (비공개 보충 ZIP) |
| 변경 전 (e2d89e6) | 검토 대기 | 390×844 | 2026-11-06 15:31:19.098Z | `mobile-review-390x844.png` (비공개 보충 ZIP) |
| 변경 전 (e2d89e6) | 계획 preview | 390×844 | 2026-11-06 15:31:56.082Z | `mobile-plan-390x844.png` (비공개 보충 ZIP) |
| 중간 스냅샷 (e070) | 프로젝트/임무 목록 | 1440×900 | 2026-11-06 17:17:07.662Z | `before-desktop-projects-a028-1440x900.png` |
| 중간 스냅샷 (e070) | 프로젝트/임무 목록 | 390×844 | 2026-11-06 17:22:59.859Z | `before-mobile-projects-a028-390x844.png` |
| 후보 | 수집 프로젝트 | 1440×900 | 2026-11-06 17:46:28.364Z | `after-desktop-projects-1fa18fd9-1440x900.png` |
| 후보 | 주제 | 1440×900 | 2026-11-06 17:46:41.316Z | `after-desktop-topics-1fa18fd9-1440x900.png` |
| 후보 | 전체 실행 내역 | 1440×900 | 2026-11-06 17:47:06.670Z | `after-desktop-history-1fa18fd9-1440x900.png` |
| 후보 | 수집 프로젝트 | 390×844 | 2026-11-06 17:47:32.852Z | `after-mobile-projects-1fa18fd9-390x844.png` |
| 후보 | 주제 | 390×844 | 2026-11-06 17:47:37.980Z | `after-mobile-topics-1fa18fd9-390x844.png` |
| 후보 | 전체 실행 내역 | 390×844 | 2026-11-06 17:47:43.137Z | `after-mobile-history-1fa18fd9-390x844.png` |
| 후보 | 선택 임무의 실행 회차(3회) | 1440×900 | 2026-11-06 17:51:04.327Z | `after-desktop-mission-runs-1fa18fd9-1440x900.png` |
| 후보 | 선택 임무의 실행 회차(3회) | 390×844 | 2026-11-06 17:51:04.186Z | `after-mobile-mission-runs-1fa18fd9-390x844.png` |

PNG 크기는 각 파일 기준으로 desktop `1440×900`, mobile `390×844`를 확인했다. 브라우저에 보이는 계정명은 이 비공개 사용자 전달 묶음에만 있다. 공개 게시 후보에 캡처를 추가하지 않았다.

## 주요 이동 및 기능 판정

| 흐름 | 관측 | 판정 |
|---|---|---|
| `/collect` → 수집 프로젝트 목록 | 저장 mission list GET 200, 21행 표시. 프로젝트 별도 ID와 `counts.imported` 문맥이 보인다. | 확인 |
| `/collect?collectionView=topics` | menu 선택 후 URL과 주제 영역 갱신. 21개의 단일 항목 표시. | 메뉴/렌더 확인; topic identity/grouping 미검증 |
| `/collect?collectionView=topics&history=all` | 전체 실행 내역 메뉴 이동 후 21행, 상태·회차 수·시각 표시. | 확인 |
| 선택 mission `&tab=runs` | 저장 detail GET 200; 1·2·3회차, trigger, collected/imported 및 시각 표시. | 확인 |
| pagination | 첫 페이지가 21행이며 다음 페이지가 없어 이전 수집 추가 불러오기는 생성하지 않음. | fixture에서 다음 페이지가 없어 미검증 |
| 프로젝트 행 선택/뒤로 가기, 검색/필터의 기능 조합 | 화면 캡처와 URL 이동만 확인; 모든 행 조작 조합을 수행하지 않음. | 부분 |

## 원문으로 정리된 7개 질문과 답변 위치

기존 감사 문서에 적힌 설명대로, 아래 7개 문구는 작업 카드 완료 기준을 감사자가 정리한 질문이며 별도 원문 질문지는 저장돼 있지 않다. 답은 기존 저장 표본 판정을 재사용한다. 이번 좁은 Run에서 Review/품질 화면을 재방문하지 않았다.

| 감사 질문 | 답변 경로 | 저장 표본이 답한 범위 / 제한 |
|---|---|---|
| 지금 어떤 연구를 진행 중인가? | `/collect` → 프로젝트 → 선택 임무 `요약·진행` | 익명 선택 임무는 중지됨, 3회차, 마지막 회차 수집 5·적재 1. 취소 맥락은 미확인. |
| 어느 분야의 지식을 확보했는가? | 임무 상세 `확보 분야` 및 `요약·진행` | 기존 표본 15/51 요구가 수 기준 충족. 주제 원문과 자료의 정확성·품질은 별도 검증 안 됨. |
| 요구사항 중 무엇이 부족한가? | 임무 상세 `요약·진행` 부족 항목 / `확보 분야` | 기존 표본에서 부족 36개. 개별 요구는 익명화돼 실질 주제와 출처 접근 제한은 확인 불가. |
| 실제 도서관에 무엇이 저장됐는가? | `요약·진행` 대표 자료 / `자료·품질` | 운영 집계 accepted/imported 2,939, trace 응답 문서 목록 1,652는 다른 원장·상한. 전체 원문·정본 관계는 열람하지 않음. |
| 수집 품질이 얼마나 검증됐는가? | `요약·진행` 품질 판정 / `자료·품질 검토` | 기존 표본 집계 수락 13, 추가 확인 2,926, 보류 1,244; Review 전체 2,310 중 첫 50행. 사실성·승인율 증거는 없음. |
| 막혔다면 왜인가? | `요약·진행` 문제·다음 행동 / `자율 조사` | 기존 표본은 정밀평가 엔진 사용 불가·모델 미확인·종료 사유 확인 필요. 취소 원인은 익명화돼 단정하지 않음. |
| 지금 무엇을 해야 하는가? | `/collect` → 프로젝트 → 선택 mission `요약·진행` / 부족 항목 | 표본 mission은 cancelled이며 화면은 `다시 실행`을 제안한다. 부족 36개 보충은 종료 후 가능으로 비활성이다. 실행은 하지 않았다. 재개 전 원요청·출처 권한·품질을 확인해야 한다. |

상세 근거 및 기존 경계는 [`ui-independent-audit.md`](ui-independent-audit.md), [`scenario-matrix.md`](evidence/scenario-matrix.md), [`manifest.md`](evidence/screenshots/manifest.md)를 재사용했다.

**보충 질문 — 전체 큐와 감사 표본은 어떻게 다른가?** `자료·품질 검토` 경로에서 전체 큐 2,310, 화면에 불러온 행 50, 감사 표본 468을 별도 모집단으로 본다. 수치는 서로 다른 시점/절차의 관측이므로 비율·전수 결과로 합치지 않는다. 절차 준수는 자료의 사실 정확도나 완료 후 실제 부족 표본의 검증을 대신하지 않는다.

**UI-01 과거 이슈:** `usability-corrections.md`의 적재 수와 trace 응답 목록의 단위 혼동은 고정 `794d0e9`에서 `2,939 적재 처리 자료`와 `1,652 응답 문서 목록`으로 분리하고 API 최대 3,000을 표시했다. 당시 desktop 1440×900 및 mobile 390×844 양쪽 확인은 [`ui-independent-audit.md`의 794d0e9 영향 화면 감사](ui-independent-audit.md#2026-11-07-kst--794d0e9-독립-실화면-영향-감사)에 기록돼 있다. 이번 Run은 UI-01을 다시 검증하지 않았다. 2,306과 2,310처럼 다른 시점의 Review 수치를 개선 성과로 해석하지 않는다.


## 제한·미검증·배포 상태

- 주제 grouping의 실제 서버 발급 `topic_key`와 동일 주제의 복수 임무 연결은 fixture list에 키가 없어 확인하지 못했다.
- 회차 화면은 선택 임무의 저장 3회만 확인했다. 회차 중 pagination, 대량 기록, 추가 수집 후 새 회차 생성은 실행하지 않았다.
- 모바일 캡처는 지정 viewport의 첫 화면이며 전체 문서 스크롤, 물리 터치/히트 영역, 정량 overflow 검사는 하지 않았다.
- 실행 회차 탭의 keyboard 전수 탐색은 하지 않았다. 이전 `8c0a286` native 키보드 결과를 그대로 인용한다.
- browser console의 2개 오류는 Vite 로컬 `sw.js`가 `text/html` MIME으로 반환되어 ServiceWorker 등록이 거부된 환경 메시지였다. 이를 제품 오류나 후보 회귀로 분류하지 않았다.
- 이번 Run에서는 UI-01을 재검증하지 않았다. 794d0e9의 두 viewport 과거 확인을 위 문서 링크에서 참고한다.
- [`ui-independent-audit.md`의 8c0a286 후속 절](ui-independent-audit.md#2026-11-07-kst--native-select-단일-재현-후-tool-fallback)에 기록된 native keyboard 재현은 focus를 확인하고 `ArrowDown`/`Enter` 후에도 `모든 조치`가 유지됐으며, browser `selectOption(reprocess)` fallback에서는 `재처리 가능` 46/50으로 바뀌었다. 이는 실제 키보드 통과가 아니고 configured browser의 keyboard 전달 한계 가능성으로 분류돼 제품 결함을 확정하지 않았다. 이번 Run에서 다시 검증하지 않았다.
- 실제 `topic_key`가 없는 목록에서 topic group 연결은 미검증이다. 선택 mission이 cancelled이므로 완료 후 부족 실표본은 없고 미검증이다. 실제 `exact_of`/`cluster_id` dedupe 관계 ID는 표본에서 확인되지 않았다. 운영 쓰기는 실행하지 않았다. 이번 Run에서 확인된 신규 제품 결함은 없다.
- 게시/배포, main push, production 설정 확인, 운영 데이터 변경은 **미진행**이다. 후속 게시 결과를 덧붙일 수 있도록 남긴다.
- 전체 테스트/build/ui-lint 재실행은 하지 않았다. 통합자의 86 tests/build/ui-lint 기록은 후보 문서의 기존 근거로 재사용했다.

## 실행 증거 요약

```text
ttk get /api/runs/anon-3ec202ad80ee0cc5a3b1 | python3 -c '... id/session_id/status/profile ...'
{"id":"anon-3ec202ad80ee0cc5a3b1","status":"running","profile":"회사 코덱스 ai2 (email redacted)"}

git rev-parse HEAD (screen capture time)
1fa18fd9ebc42caa4e90c4a03125883e264bb03e

git diff --quiet 1fa18fd9..e030ccf4 -- src package.json pnpm-lock.yaml
product_diff_exit=0

configured browser network_requests (static=false, filter=/api/)
GET http://127.0.0.1:5198/api/assistant/collect/missions?limit=100&offset=0 => 200
GET http://127.0.0.1:5198/api/assistant/collect/missions/anon-21eee7a431745b22e649 => 200
POST http://127.0.0.1:5198/api/auth/refresh => 200 (local synthetic auth only)
```
