# 수집 워크스페이스 독립 UI 감사

감사일: 2026-11-07 KST  
검증 역할: 구현에 참여하지 않은 사용자 관점의 브라우저 조작  
판정: **부분** — 핵심 화면과 실제 GET 재생은 확인했다. 일부 화면 데이터가 비식별 fixture에서 비어 있고, 정량 UI 계측은 실행할 수 없었다.

## 실행 조건과 revision

| 항목 | 기록 |
|---|---|
| 작업 경로 | `/Users/winterholic/development/projects/winterholic-ttakkari/front-collect-workspace-20261107` |
| 감사 시작 HEAD | `0b2851252fd6adb59b98a600ef97b997ddec3f0e` (`0b28512`) |
| 후보 8장 관측 HEAD | `d87b696fbffcb63600b62487a0916d71779b49c8` (`d87b696`); 캡처 16:02–16:05Z. d87 commit은 00:59:09 KST이므로 후보 캡처 시점의 HEAD는 0b가 아니라 d87이며 화면 코드에는 차이가 없음 |
| 화면 코드 교정 revision | `4450dac805bc3557bc57bd8093abdd50e8dec06a` (`4450dac`) |
| 캡처 당시 repo HEAD | 캡처마다 다름: 16:32:18/16:32:58Z는 `165ea5f`; 16:33:14Z 이후는 `3d2b30e`. `3d2b30e`는 audit/evidence/전용 테스트 추가였고 제품 화면 소스는 바꾸지 않음 |
| 최종 영향 화면 재확인 | 제품 소스는 `4450dac`, repo HEAD는 위 시각별 값. captures 모두 실제 fixture에서 동작하는 동일한 교정 source를 재생 |
| 통합 교정 기록 | [integration-corrections.md](integration-corrections.md); 교정 commit `4450dac`, 기록 commit `3b3e764`. 뒤따른 `3d2b30e`도 확인했으며 문서/evidence/전용 테스트만 추가. 배포 완료를 의미하지 않음 |
| 화면/API 계약 기준 | `5f5cbd997addcb4ea084ab908790f8f6eec54122` |
| 실제 runtime 보고 | 작업 handoff의 2026-11-07 00:51 KST에는 active `efe07c4bf9332473c60743bf31bb73111be00c4a`. 감사에서 확인한 read-only `runtime_report`는 2026-11-06 15:58:35Z 기준 active `5f5cbd997addcb4ea084ab908790f8f6eec54122`, 이전 `efe07c4b` draining. 시점이 다른 두 보고를 구분하며 제품 UI replay는 로컬 Vite이므로 어느 runtime revision이 그 화면을 제공했다고 주장하지 않음 |
| 브라우저 및 앱 | configured `ttakkari_browser`; `http://127.0.0.1:5195/collect`; API는 격리 mock `http://127.0.0.1:5196`만 사용 |
| 실행 명령 | `TTAKKARI_NO_ENV_FILE=1 VITE_API_BASE=http://127.0.0.1:5196 npm run dev -- --host 127.0.0.1 --port 5195 --strictPort`; mock `COLLECT_REPLAY_FIXTURE=.../replay-fixture.json python3 /private/tmp/collect_replay_mock.py` |
| fixture 시각/출처 | `replay-fixture.json`의 `observed_at=2026-11-06T15:45:43.416672Z`; 비식별화한 실제 owner API GET 응답. source 목록/원문·제목·목표·URL·문맥은 제거 또는 대체됨 |

### 감사 연속성

이 기록은 이전 독립 UI 감사 Run `8b7e4566-de8e-434d-96ff-68cca2b1a14d`의 연속이다. 새 Run `492a5c71-f3ad-4462-8c1f-9efcb4c6484d`에서는 기존 8개 전후 캡처와 scenario 결과를 보존하고, 통합 교정 `4450dac`이 건드린 Review/ResearchPanel만 다시 확인했다. 목록·계획 재로딩은 영향이 없어서 생략했다. 이 세션의 callable tools 목록에는 `fresh_context`/`reset_my_context`가 없어 reset은 실행하지 않았다. 이 문서와 manifest에 revision·남은 검증 한계를 기록해 다음 재로딩 비용을 줄인다.

마지막 최종 캡처는 16:35:42Z (01:35:42 KST)다. 현재 worktree에서 `MissionTrace.tsx`, `Review.tsx`, collector/review CSS, `CollectPage.tsx` 및 관련 테스트가 그 뒤 01:36–01:40 KST에 수정된 것으로 보인다. 감사자는 이 제품 코드를 수정·stage하지 않았으며, 해당 후속 dirty diff는 이 revision-pinned 캡처에 포함되지 않고 별도 화면 대조도 수행하지 않았다.

운영에 로그인해 UI를 열지 않았다. 후보 화면과 모든 브라우저 API 요청은 local replay로 구동했다. 수집 생성, 승인/거절/보류, 재처리, 보충, 일시정지, 권리/정책 변경을 운영 API에 전송하지 않았다. 계획 미리보기와 재처리는 mock에만 POST했다. `/private/tmp/collect_replay_mock_writes.jsonl`에는 로컬 `POST /missions/plan` 2회, 로컬 inert `POST /items/{id}/reprocess` 1회, 로컬 auth refresh만 기록되어 있다. 별도 누락 판정 테스트는 synthetic mock 응답으로 분리했다.

## 화면 캡처 및 기준 비교

기준 화면은 detached checkout `e2d89e6`의 허용 복사본이다. 후보 8장은 교정 전 화면으로 보존했고, 사용자가 지정한 동일 viewport에서 보관했다. 파일명은 복사본에만 붙였으며 browser 캡처는 filename 없이 수행했다.

| 화면 | 기준 PNG | 후보 PNG | viewport / 데이터 입력 | 기준 HEAD | 후보 HEAD |
|---|---|---|---|---|---|
| 수집 목록 | [desktop 기준](evidence/screenshots/desktop-list-1440x900.png) | [desktop 후보](evidence/screenshots/ui-candidate-desktop-list-1440x900.png) | 1440×900, fixture 21개 mission; 16:02:16Z | `e2d89e6` | `d87b696` |
| 임무 상세 | [desktop 기준](evidence/screenshots/desktop-detail-1440x900.png) | [desktop 후보](evidence/screenshots/ui-candidate-desktop-detail-1440x900.png) | 1440×900, 선택 mission; 16:03:26Z | `e2d89e6` | `d87b696` |
| 검토 | [desktop 기준](evidence/screenshots/desktop-review-1440x900.png) | [desktop 후보](evidence/screenshots/ui-candidate-desktop-review-1440x900.png) | 1440×900, 전체 2,310 / 불러온 50; 16:04:05Z | `e2d89e6` | `d87b696` |
| 신규 계획 | [desktop 기준](evidence/screenshots/desktop-plan-1440x900.png) | [desktop 후보](evidence/screenshots/ui-candidate-desktop-plan-1440x900.png) | 1440×900, synthetic prompt/mock preview; 16:04:48Z | `e2d89e6` | `d87b696` |
| 수집 목록 | [mobile 기준](evidence/screenshots/mobile-list-390x844.png) | [mobile 후보](evidence/screenshots/ui-candidate-mobile-list-390x844.png) | 390×844, fixture 21개 mission; 16:04:58Z | `e2d89e6` | `d87b696` |
| 임무 상세 | [mobile 기준](evidence/screenshots/mobile-detail-390x844.png) | [mobile 후보](evidence/screenshots/ui-candidate-mobile-detail-390x844.png) | 390×844, 같은 mission; 16:05:09Z | `e2d89e6` | `d87b696` |
| 검토 | [mobile 기준](evidence/screenshots/mobile-review-390x844.png) | [mobile 후보](evidence/screenshots/ui-candidate-mobile-review-390x844.png) | 390×844, 전체 2,310 / 불러온 50; 16:05:23Z | `e2d89e6` | `d87b696` |
| 신규 계획 | [mobile 기준](evidence/screenshots/mobile-plan-390x844.png) | [mobile 후보](evidence/screenshots/ui-candidate-mobile-plan-390x844.png) | 390×844, synthetic prompt/mock preview; 16:05:50Z | `e2d89e6` | `d87b696` |

기준 캡처는 2026-11-06 15:30–15:31Z, 후보는 16:02–16:05Z다. 기준 review 화면에 보이는 2,306과 이후 GET fixture의 2,310은 관측 시각이 다르다. 계획 입력도 기준의 “웹 접근성…” synthetic 문구와 후보의 synthetic local replay 문구가 다르다. 따라서 시각·수치 차이는 코드만의 효과로 해석할 수 없다.

통합 교정 commit 뒤인 2026-11-06 16:32–16:35Z에 관측 HEAD `4450dac`으로 영향 화면만 재확인·캡처했다. 목록과 계획은 영향이 없어 반복하지 않았다. 예전 부분 캡처는 보존하고 아래 revision-pinned 파일을 최종 비교 증거로 쓴다.

| 영향 화면 / 상태 | viewport | 최종 캡처 | 관측 HEAD / 입력 |
|---|---:|---|---|
| Review 재처리 가능 filter (46/50) | desktop 1440×900 | [desktop Review](evidence/screenshots/ui-post-4450-desktop-review-1440x900.png) | source `4450dac`; repo HEAD `165ea5f`; 16:32:58Z; actual GET |
| Review 재처리 가능 filter (46/50) | mobile 390×844 | [mobile Review](evidence/screenshots/ui-post-4450-mobile-review-390x844.png) | source `4450dac`; repo HEAD `3d2b30e`; 16:33:14Z; actual GET |
| Review duplicate 상세와 dedupe JSON | desktop 1440×900 | [desktop 상세](evidence/screenshots/ui-post-4450-desktop-review-detail-1440x900.png) | source `4450dac`; repo HEAD `3d2b30e`; 16:35:25Z; actual GET |
| Review duplicate 상세와 dedupe JSON | mobile 390×844 | [mobile 상세](evidence/screenshots/ui-post-4450-mobile-review-detail-390x844.png) | source `4450dac`; repo HEAD `3d2b30e`; 16:35:42Z; actual GET |
| ResearchPanel 실제 precise 상태 | desktop 1440×900 | [desktop ResearchPanel](evidence/screenshots/ui-post-4450-desktop-research-1440x900.png) | source `4450dac`; repo HEAD `165ea5f`; 16:32:18Z; actual mission GET |
| ResearchPanel 실제 precise 상태 | mobile 390×844 | [mobile ResearchPanel](evidence/screenshots/ui-post-4450-mobile-research-390x844.png) | source `4450dac`; repo HEAD `3d2b30e`; 16:34:26Z; actual mission GET |

## 시나리오와 화면별 판정

| 화면/기능 | 결과 | 사용자 관점 근거 및 제한 |
|---|---|---|
| 프로젝트 목록: 검색·상태·최근순 | pass | `/collect`; 21개 표시, 검색 `수집 과제 01`로 1행, `attention` 필터로 실패 1행을 확인. recent activity 내림차순 표시. |
| 동일 제목·다른 ID 선택 | unverified | 운영 집계에는 제목 fingerprint 중복 17행(고유 fingerprint 4종)과 별도 mission ID가 있으나, fixture가 제목/요청을 모두 익명화했다. 목록의 개별 행은 보이지만 사람이 같은 제목 사이에서 ID를 구분하는 시각 검증은 불가. |
| 진행 중 적재 0 | pass | running mission 14개 중 12개가 `counts.imported=0`, trace 문서 0; 취소 1, 실패 1도 별도 확인. 빈 결과를 통과로 보지 않았음. |
| 대량 자료/여러 회차 | pass | 선택 상세 mission `e4b02ac0…`은 3회차, discovered 69,851; 별도 mission에서 25,756·38,468, run_seq 3·6도 fixture 집계에 존재. 상세에 회차/단계/자료 집계 표기 확인. |
| 정상 종료 후 목표 미달 | unverified | 실 mission 21개에 succeeded/partial 상태가 없음. 취소·실패 사례로 대체하지 않음. |
| 정책 차단·실패·대기 | pass | 전역 job 집계 policy_blocked 55, queued 142, running 1, failed 33; 선택 mission trace의 실패 3, 접근 제한·실패 표시 확인. 정책/권리 차단을 재처리로 우회하지 말라는 안내 표시. |
| 대형 검토 queue·감사 표본 | pass with scope | review 총 2,310, 페이지 50; 감사 11개 reason group과 sample_count 합 468. fixture에는 감사 item 세부 표본 10개만 남고 집계 전체 468은 별도임. 2,310/50/468은 분모가 다른 값으로 확인. |
| source/runs 상세 항목 | unverified | URL 호환 view는 열렸지만 fixture source 목록이 비어 있고 runs/jobs 상세 응답도 0행이라 비어 있지 않은 실제 표의 정렬·행 조작은 검증할 수 없음. |
| 교정 후 검토 조치 필터 | pass (local replay, desktop/mobile) | revision `4450dac`에서 “재처리 가능” 선택: 양 viewport 모두 50개 중 46개 표시, 행 버튼 표시도 확인. actual GET sample의 held/can_reprocess 46 및 accepted/can_reprocess 4와 일치. 최종 대조에서는 버튼을 눌러 쓰기를 만들지 않음. |
| 교정 후 Review 판정 | pass (actual GET replay, desktop/mobile) | held item detail의 `decision.state=hold`가 양 viewport 모두 “판단 보류”로 표시. synthetic 경계에서 decision을 생략하고 `status=accepted`, `review:low_relevance`를 주자 “적재 대상 · 사유 확인 필요”; 실제 운영 누락 표본은 없음. |
| 교정 후 dedupe 정보 | partial (desktop/mobile) | 목록은 “중복 관계 대상: 미확인”. 기술 JSON에 `dedupe` 객체는 표시되지만 표본에는 `canonical_status`, `algorithm_version`만 있고 `exact_of`, `cluster_id`가 없음. 대상 문서 연결은 여전히 미확인. |
| 교정 후 정밀 평가 | pass for selected detail (desktop/mobile) | 실제 mission detail replay의 raw engine `unavailable`은 양 viewport 모두 “사용 불가”로 표시. 엔진 식별자나 모델명처럼 보이지 않으며 모델명·세부 실행 상태는 미확인. pending 1,353, processing 0, unresolved 0. overview/review 응답의 필드 부재도 미확인으로 표시. |

### 지표 단위 검토

선택 mission에서 `counts.imported=2,939`, trace 문서 1,652, trace events 300, discarded 96, jobs 839, runs 3, requirements 51, targets 36이 서로 다른 필드/원장에서 읽혔다. 화면은 진행 요약/대표자료에 1,652 “도서관 적재 확인 자료”를, 단계 카드에는 2,939 “도서관 적재”를 표시한다. 서로 다른 모수이므로 전환율을 만들지 말라는 안내는 보이지만, 두 곳 모두 도서관 적재라는 표현이라 5초 안에 같은 값인지 별도 값인지 헷갈릴 수 있다. **결함 UI-01(중간)**: 상세 요약과 처리 단계에서 수치를 붙인 원장/모수를 바로 옆에 구분해 표기할 필요가 있다. 재현 URL `/collect?mission=e4b02ac0-3a8d-4fb3-b8ae-52ef9b1e95cb`, desktop/mobile detail.

review에서 서버 전체 2,310과 loaded 50의 차이는 안내문으로 표현되며, 감사 sample 468은 감사 panel의 집계로만 접근된다. 세 수를 합계나 전환율로 읽으면 안 된다. 지시한 절차 `충족`은 운영 집계 기준 표시이고 문서의 사실 정확도/지식 충분성 승인과 다르다는 경고가 보인다.

## 경로·상호작용·접근성

| 확인 경로 | 판정 | 근거 |
|---|---|---|
| 프로젝트 목록/요약/대상/자료/과정/지시문 | pass | `/collect`, `/collect?mission={id}`에서 overview, targets, docs, log, prompt 버튼 조작 및 내용 확인. |
| 호환 URL overview/sources/runs/review/quality | pass for navigation; rows partial | `/collect?view=overview|sources|runs|review|quality` 직접 진입. sources/runs는 fixture 자체가 비어 있어 빈 상태. |
| 신규 계획 URL | pass for navigation | `/collect?new=1`; synthetic 입력 후 preview 실행. 결과 제목에 `Synthetic preview — 격리 재생용`, 내용에 `격리 mock preview`가 드러남. 실제 신규 mission 생성은 하지 않음. |
| keyboard | partial | 목록에서 Tab으로 “새 연구 계획” 이동 후 Enter로 `/collect?new=1` 진입 확인. 모든 탭/모달의 전체 키보드 순환과 Enter/Space는 확인하지 않음. skip link는 snapshot에 노출. |
| 5초 내 상태/성과/문제/다음 행동 | partial | list/detail 첫 화면에는 상태·요약·문제·다음 행동이 있음. 선택 상세에는 15/51 요구, 부족 항목, 실패 3, 마지막 회차와 행동이 표현됨. 지표 원장 이름 혼동(UI-01)과 긴 화면 스크롤은 빠른 발견을 방해. |

모바일 box snapshot에서 콘텐츠 폭은 390px viewport 안쪽 x=16, width=358로 배치되어 좌우 잘림은 관측되지 않았다. desktop 상세 콘텐츠는 main 1,160px 안에서 1,056px 폭을 쓴다. 모바일 review filter는 4개 컨트롤이 세로로 쌓여 높이 318px이며 첫 item은 page y≈1,221부터 시작한다. 상세/목록도 세로로 긴 화면이다. desktop review는 50개 item이 DOM에 모두 렌더되어 page height 약 25.9k CSS px이며, mobile review 약 24.7k px다. 긴 로그/행이 많고 다음 페이지 버튼은 맨 아래라 스크롤 비용이 큼. 브라우저 폭/높이와 snapshot bounding box는 확인했으나 document scrollWidth/clientWidth의 수치 계측은 하지 않음.

모바일 screenshot에서 카드 내용은 세로로 흐르고 버튼은 재처리 다음 기술 상세 순으로 보인다. 검토 필터 밀도는 낮지만 한 번에 화면에 들어오지 않는다. contrast, 터치 타깃 실제 면적, 텍스트 확대, 가로 overflow는 화면 관찰만으로 통과시키지 않았다.

### ui-refine-loop 계측

정량 TS/sweep receipt **미실행**. 지정된 `browser_preflight.py`를 command tool에서 실행했을 때 `status=blocked`, `browser_launched=false`; 관측 오류는 macOS `mach-register`/`mach-lookup` IPC permission denied였다. 따라서 로컬 Chromium/Playwright를 직접 실행하지 않았고 다른 바이너리로 우회하지 않았다. 실제 viewport, screenshot, accessibility snapshot, element bounding box, 버튼/필터 조작은 configured `ttakkari_browser`에서 수동 관찰했다. 축별 수치 영수증이 없어 정량 UI 개선 여부는 판정하지 않았다.

## 결함과 교정 전후

| ID | 위치 / 영향 | 재현 | 현재 판정 |
|---|---|---|---|
| 기존 API/UI-A1: 필터와 재처리 버튼 기준 불일치 | Review 필터 및 행 조치. 승인된 자료가 “재처리 가능”에 들어오지만 버튼이 없어 사용자가 할 수 있는 일과 필터 결과가 달라질 수 있었음. | 교정 전 fixture에서 재처리 가능 50개, accepted 4개는 버튼 없음. 현재 교정 후 같은 filter는 46개, 46개 모두 버튼 확인. | **교정으로 재현 안 됨**(로컬 최신 worktree). 운영 배포 검증 아님. |
| 기존 API/UI-A2: 중복 상세에 dedupe 누락 | Review 기술 상세. 대표 자료·중복 근거 추적이 불가. | `동일한 본문이 이미 있음` 자료 → 근거와 처리 이력 → 원 코드·중복 근거·처리 이력 보기. 현재 상세 JSON에 dedupe 객체가 추가됐으나 표본은 algorithm/canonical status만 제공. | **부분 개선, 관계값 미확인**. exact_of/cluster_id는 replay GET sample에 없음. 목록의 대상 표시는 여전히 “미확인”. |
| 기존 API/UI-A3: decision 누락 fallback | Review detail 판정 영역. API가 decision 없이 status/reason을 줄 때 의미 있는 상태인지 확인. | `COLLECT_SYNTHETIC_MISSING_DECISION=1` mock에서 accepted/delivered/low_relevance, decision omitted. 최종 대조는 `4450dac` frontend. | **synthetic fallback 확인**: “적재 대상 · 사유 확인 필요”. 실제 운영 누락 표본은 없어 unverified. |
| 기존 API/UI-A4: precise_eval 표시 | Mission detail ResearchPanel. 실제 triage 상태를 숨기면 엔진/대기 규모를 찾기 어려움. | actual detail fixture에 `triage.precise_eval`; `4450dac`에서 desktop/mobile 화면과 bounding box 확인. | **교정으로 재현 안 됨**: raw `unavailable`은 “사용 불가” 상태, 모델명/세부 실행 상태는 미확인, pending/processing/unresolved 1,353/0/0. |
| 신규 UI-01: 도서관 적재 수치 레이블 모호함 | Mission 상세의 진행 요약과 단계 카드. `trace documents=1,652`와 `counts.imported=2,939`가 모두 적재 문맥으로 보임. 사용자가 실적/문서 수를 혼동할 수 있음. | 위 선택 mission의 overview snapshot에서 각각 1,652와 2,939, 별도 단위 안내 확인. | **재현됨**, 수정하지 않음(독립 검증 범위). |

## 7개 사용자 질문에 대한 답

아래 질문은 작업 카드의 완료 기준에서 감사자가 7개로 정리한 것이며, 별도 질문 원문이 제공된 것은 아니다.

1. **지금 수집 상태와 다음 행동은?** 목록 및 상세 첫 화면에서 상태/마지막 회차/문제·다음 행동 확인. 해당 mission은 중지됨, 마지막 3회차 수집 5·적재 1, 부족 36개.
2. **목표를 얼마나 채웠나?** `확보 분야`와 상세 요약에서 51개 중 15개가 출처 수 기준 충족. 사실 검증 또는 품질 승인 수치로 해석하면 안 됨.
3. **도서관에 몇 건 들어갔나?** mission 누계 `counts.imported=2,939`; trace 문서 1,652는 별도 원장. 둘의 차이를 전환율로 계산하지 않음.
4. **무엇이 부족하거나 못 읽혔나?** `대상`에서 항목별 상태; `자료·품질`에서 대표 자료; overview에 부족 36, 접근 제한·실패 안내. source 원문은 비식별화돼 실제 URL 확인 불가.
5. **어느 회차/단계에서 진행됐나?** `수집 과정`에서 3 runs/요구별 단계; 탐색·획득·판별·적재·온톨로지 값은 서로 다른 집계 단위.
6. **검토 대기/실패/차단 원인과 가능한 행동은?** Review는 총 2,310 중 50 로드, 사유·출처·가능 조치 필터, 보류 표본 감사 제공. 필터 교정 후 46행이 재처리 가능. 정책 차단은 재처리 우회 금지 안내.
7. **전체 큐와 표본/품질·절차 준수는 무엇이 다른가?** Review 전체 2,310, loaded 50, 감사 표본 468은 서로 다른 모집단. 절차 충족 집계는 문서 지식 충분성이나 사실 정확도와 다름.

## 실행 근거와 미실행 항목

| 방법 | 결과 / evidence |
|---|---|
| Browser navigation/screenshot | `ttakkari_browser`에서 영향 화면만 `?mission=…`, `?view=review`; viewport 1440×900 및 390×844. `4450dac`의 review/action/detail 및 research 캡처 6개를 추가. 기존 후보 8장과 미영향 목록·계획 결과는 보존. |
| actual GET vs synthetic 경계 | 최신 Review/Research 캡처는 비식별 실제 GET fixture를 local mock에서 재생. decision 누락 응답은 `COLLECT_SYNTHETIC_MISSING_DECISION=1` synthetic mock의 별도 browser snapshot에서 `accepted → 적재 대상 · 사유 확인 필요`로 확인. 계획 preview도 예전 local mock에서만 실행한 synthetic 입력/결과이며 production 요청과 무관. 이번 Run에서는 계획 preview를 반복하지 않음. |
| Real-data replay GET | 로컬 replay `GET /missions`, `/missions/{id}`, trace, `/review`, `/review/audit`, `/items/{id}`, `/summary`, `/quality`, `/budgets`, `/runtime`; source가 anonymized GET fixture임을 UI 경로와 `evidence/README.md`에서 확인. 실제 production UI 요청은 없음. |
| Mock writes | local mock POST `/missions/plan` 2회; inert local POST `/items/{id}/reprocess` 1회. mock은 결과만 응답하고 데이터/원장 변경 없음. create, accept/reject/hold, pause/resume, rerun/supplement는 누르지 않음. |
| DOM test | 미실행: 요청이 독립 브라우저 조작/시각 감사이고, DOM 테스트로 사용자 화면 검증을 대체하지 않음. |
| build/test | 미실행: 감사 범위에서 변경 코드 검증을 요구하지 않았고 제품 코드는 수정하지 않음. |
| production UI/write | 미실행: 비식별 로컬 replay만 승인 범위. 제품 API에 쓰기 요청 0건. |
| Quantitative ui-refine-loop | 미실행: preflight blocked 및 정확한 오류는 위 계측 섹션. 영수증 없음. |
| Non-empty sources/runs; succeeded/partial underfill; decision omission from real item; exact dedupe relation; same-title identity usability; full keyboard path; numerical overflow/accessibility axes | 미검증: 실제 fixture 부재/익명화 또는 정량 계측 미실행. |

작업 범위는 감사 문서와 screenshot 증거만이다. baseline/API audit, replay fixture, 교정 코드/테스트 등 타 작업자의 파일은 수정하거나 stage하지 않았다.

## 2026-11-07 KST — 794d0e9 독립 실화면 영향 감사

현재 단계 판정: **부분**. 고정 snapshot `794d0e902dac50d4582ca9ed9582df3de0c49672` (tree `003cf3244b016cc01f8f78d45d534ae54d21bc05`)만 `/private/tmp/collect-audit-794d0e9`에 풀어 Vite로 실행했다. 감사 시작 worktree HEAD는 `67481eecefae0ecdf64e9bec50f6de75e58d7940`였고 다른 작업자의 미커밋 제품 파일은 snapshot에 포함하지 않았다. 기존 node_modules를 symlink로 재사용했다. `pnpm run dev`는 `/private/tmp`에서 hoist 디렉터리가 symlink라 실패했으며, 같은 설치의 `./node_modules/.bin/vite`로 격리 서버를 띄웠다. UI/API는 configured `ttakkari_browser`와 `127.0.0.1:5195` / inert mock `127.0.0.1:5196`뿐이다.

입력은 저장된 비식별 GET fixture의 `observed_at=2026-11-06T15:45:43.416672Z`다. Review 응답 전체 queue 2,310, 첫 페이지 50건이며, 선택 mission `e4b02ac0-3a8d-4fb3-b8ae-52ef9b1e95cb`의 `counts.imported=2,939`, trace 문서 응답 목록 1,652, API 상한 3,000이다. 새 화면 캡처는 2026-11-06 16:53–16:55Z (2026-11-07 01:53–01:55 KST)로 fixture 관측 이후 약 67–70분이다. 기존 `4450dac` 캡처는 16:32–16:35Z이고 같은 저장 fixture 집계(Review 2,310/50, mission 2,939/1,652)를 기준으로 기록되어 있다. 두 시점의 화면 수치는 동일하지만 screenshot 시각은 다르므로 시각 차이를 데이터 변화나 코드 효과로 해석하지 않는다. 4450dac 캡처는 그 당시 결과로 보존하며 794d0e9 통과 증거로 소급하지 않는다.

| 완료 기준 | 현재 판정 | 독립 실화면 근거 / 미완료 |
|---|---|---|
| 1. 고정 revision·관측 시각·replay/mock 범위 | pass | 위 commit/tree와 fixture 시각 고정. 저장 GET을 loopback mock으로 재생했고 503 한 번은 mock에서 `review?offset=50`에만 넣어 재시도 동작을 확인. 로컬 auth refresh POST 이외 조작 POST는 발생하지 않음. 운영 GET/쓰기 없음. |
| 2. 최상위 review, 직접 URL, 뒤로가기, 신규 계획/mission 경로 | partial | 1440×900과 390×844에서 `/collect?view=review`의 최상위 `수집 관리 영역`이 바로 선택되고, `/api/assistant/collect/missions` 요청 없이 review GET만 발생. overview/sources/runs/quality 직접 URL은 모두 열림. mission 상세 직접 URL에서 브라우저 뒤로가기로 review URL 복귀 확인. `/collect?new=1`은 두 viewport에서 직접 열리고 입력 후 mock plan preview도 표시됨. 하지만 프로젝트 목록 기본 URL은 fixture mission의 `plan.coverage` 누락으로 `Cannot read properties of undefined (reading 'map')` 오류가 나 목록에서 새 계획 버튼을 거치는 연결은 미검증. fixture를 보정하지 않음. |
| 3. 동일 50행 입력, 행 밀도·상태/사유/조치와 실제 폼 | pass with scope | 첫 화면 50행에서 출처 `source-redacted`, 상태 보류, 사유, 익명 미리보기, 가능한 조치가 보임. 행 높이는 desktop 274px(기본), 첫 행 430px(폼 펼침); mobile은 기본 304–335px. 개별 폼은 마우스와 Tab→Enter로 실제 열어 입력 필드와 판정 버튼을 표시했으며 mock 쓰기 없이 종료. priority 텍스트도 snapshot에서 보임. |
| 4. 상단 페이지 load/retry, 보존, 정책 차단 우회 | partial | `가능 조치=없음` 필터 후 4/50행을 표시. 다음 페이지 요청 첫 회 503에서 불러온 50행과 필터를 보존했고, 재시도 후 mock이 저장된 50행을 복제해 만든 synthetic 2페이지가 더해져 100 loaded/8 matched, 필터 유지. 이는 pagination 동작만 확인하며 원본 GET fixture에 두 번째 페이지가 있었다는 뜻이 아님. 정책 차단 행은 첫 50개 review sample에 없어 우회 버튼/조치 부재를 검증할 표본 없음. |
| 5. UI-01 모수/3000 상한 구분 | pass | desktop/mobile mission 화면 모두 2,939 옆에 “적재 처리 자료”, 1,652 옆에 “응답 문서 목록”을 붙여 표기하고 trace API 최대 3,000 및 두 응답 모수가 다를 수 있음을 설명. 4450 화면의 기존 2,939/1,652와 새 화면의 숫자는 같고 라벨/경고 표현을 이 run에서 다시 확인. |
| 6. 키보드, bounding boxes, 터치 타깃 | partial | skip link→main, 최상위 navigation, 필터 순회, 상단 페이지 버튼 및 첫 행 검토 폼 진입/Enter를 keyboard로 확인. Snapshot CSS box: desktop nav 각 347×44, 필터 높이 44, 페이지 버튼 143×44; first row action 130×44. Mobile review nav/필터/페이지 버튼/첫 행 조치는 각각 358×44, 필터 영역 높이 318, 143×44, 130×44. 실제 터치 입력/히트 영역 장치 검증은 configured browser가 제공하지 않아 미실행. |
| 7. 전후 screenshot·수치·시점 | pass with scope | 새로운 desktop/mobile review와 mission screenshots 및 synthetic plan preview screenshots를 저장했다. Review/mission screenshots는 같은 saved fixture input. 이전 candidate `d87b696`은 794 교정 전 목록/계획 화면 캡처이며 4450 자료는 중간 회차이다. Review 2,310/50과 mission 2,939/1,652 값·관측 시점은 비교 표 아래와 manifest에 분리. |
| 8. 현재 판정·미완료·후속 범위 | pass | 이 문서와 manifest에 부분 판정, 미검증 표본/경로, 850a825b 정밀 집계 및 canonical type 별도 검증 제외를 기록. |

### 794d0e9 영향 화면 캡처와 계측

| 화면 | viewport / 캡처 UTC | 새 보관 캡처 | 같은 fixture에서 보인 값 |
|---|---|---|---|
| Review 최초 50행 | 1440×900 / 16:53:08Z | [desktop Review](evidence/screenshots/ui-794d0e9-desktop-review-1440x900.png) | 전체 2,310, loaded 50 |
| Review 최초 50행 | 390×844 / 16:55:02Z | [mobile Review](evidence/screenshots/ui-794d0e9-mobile-review-390x844.png) | 전체 2,310, loaded 50 |
| 선택 mission 상세 | 1440×900 / 16:55:46Z | [desktop mission](evidence/screenshots/ui-794d0e9-desktop-mission-1440x900.png) | imported 2,939, trace documents 1,652 / max 3,000 |
| 선택 mission 상세 | 390×844 / 16:55:49Z | [mobile mission](evidence/screenshots/ui-794d0e9-mobile-mission-390x844.png) | imported 2,939, trace documents 1,652 / max 3,000 |
| 신규 계획 mock preview | 1440×900 / 17:04:13Z | [desktop plan preview](evidence/screenshots/ui-794d0e9-desktop-plan-preview-1440x900.png) | 입력은 synthetic 감사 문구, preview 응답은 inert mock |
| 신규 계획 mock preview | 390×844 / 17:04:24Z | [mobile plan preview](evidence/screenshots/ui-794d0e9-mobile-plan-preview-390x844.png) | 같은 synthetic 입력/응답; preview는 viewport 아래로 이어짐 |

기준/후보 변화 기록: 2026-11-06 15:30Z 기준 e2d89e6 Review는 2,306으로 보였고, 후속 saved GET fixture 관측은 15:45:43Z에 2,310/50이다. 2026-11-06 16:32–16:35Z의 4450 교정 화면과 이번 794d0e9 화면은 모두 2,310/50 및 2,939/1,652로 기록된다. 이전 review 숫자는 다른 시각의 별도 baseline이다. 새 fixture 관측 시각은 이전 aggregate와 같지만 screenshot 캡처 시각은 다르다. 이번 UI-01 재확인에서 수치 바로 옆의 서로 다른 이름과 API 상한이 드러난 것을 확인했으며, 동일 수치는 적재 처리의 완료·정합성을 독립 증명하지 않는다.

Keyboard/browser evidence: configured browser snapshot으로 viewport-relative CSS bounding box를 읽었다. first review row의 `판정·적재 검토 열기`를 Tab 순서에서 Enter로 펼쳐 `자료의 유용성 검토` textbox를 실제 표시했다. skip link는 main으로 이동했고 filter controls를 거쳐 pagination까지 도달할 수 있었다. 다만 필터를 키보드로 새 값으로 선택하는 입력과 모바일 물리 터치 면적·히트 테스트는 완료하지 않았다. bounding box를 실제 pointer/touch target 통과로 해석하지 않는다.

로컬 inert mock request log에는 저장 fixture GET, injected page failure GET/retry, synthetic plan preview POST 1회, `/api/auth/refresh` POST가 있다. plan preview 응답은 mock이 생성한 synthetic preview이며 프로젝트 생성 POST가 아니다. Review decision/reprocess 조작 POST는 이번 run에서 전송하지 않았다. `/api/tasks/active`, `/api/health`는 화면 셸용 무데이터 mock 응답이다. Direct `/collect`는 저장 GET fixture의 project entry schema가 candidate가 읽는 `plan.coverage`를 담지 않아 React map 오류로 중단됐다. 해당 경로를 synthetic 목록으로 바꿔 검증하지 않았다. `/collect?new=1` direct entry는 정상 진입해 preview까지 확인했다. Sources/runs 화면은 URL 진입했지만 fixture 상세 목록이 비어 있어 비어 있지 않은 행 조작은 검증하지 않았다.

브라우저/서버 로그에는 Vite dev 서버가 `/sw.js` 요청에 HTML MIME을 반환해 ServiceWorker 등록이 거절된 경고가 반복됐다. Review, mission, direct new-plan 화면과 mock API 조작은 진행됐으며 이 서비스워커 메시지를 제품 경로 성공 근거로 사용하지 않았다. `/collect` 목록의 `plan.coverage` 오류는 별도 화면 렌더 오류로 기록했다.

표본이 없는 정책 차단 Review 행, 정상 종료 후 미달, 실제 dedupe 관계 ID, 실 item의 decision 누락은 이번 전체 제품 판정에 포함하지 않는다. 850a825b의 정밀 집계 및 canonical 타입 교정은 이후 별도 독립 검증이며 이번 감사 범위가 아니다. 제품 수정/빌드/테스트/운영 요청은 하지 않았다.

## 2026-11-07 KST — ai2 Run 재개: e070bc0 표본 UI 및 미완료 범위

현재 판정: **부분**. 이 Run은 outbox `c485886b-769d-4f22-aba7-b0e2febc4084`, worker session `b91696c3-40bf-420c-af53-1be93809b656`다. 첫 명령 `ttk get /api/runs/c485886b-769d-4f22-aba7-b0e2febc4084 | python3 -c 'import json,sys; r=json.load(sys.stdin); print(json.dumps({k:r.get(k) for k in ("id","session_id","status","profile")},ensure_ascii=False))'` 결과는 `{"id":"c485886b-769d-4f22-aba7-b0e2febc4084","session_id":"b91696c3-40bf-420c-af53-1be93809b656","status":"running","profile":"회사 코덱스 ai2 (ai2@hyperez.io)"}`다. Run UUID를 `read_session` 식별자로 사용하지 않았다. 계정/인증 설정은 바꾸지 않았다.

### 기준·입력·실행 범위

| 구분 | 값 |
|---|---|
| 프론트 checkout / 캡처 source | `04eec5da037596b9f9de6765e409711850b0796b` worktree; 제품 변경 영향 commit `78635d328b983b1dbda8dab41450c5ace5607996` 포함 |
| 저장 fixture adapter | `e070bc080a2036e07930ca7856c2dfa7b76213c3`; `python3 -B docs/collect-workspace/evidence/validate_completion_adapter.py` 오프라인 검증 |
| completion fixture 관측 | `2026-11-06T16:40:45.920458+00:00`; baseline mission/review 관측 `2026-11-06T15:45:43.416672+00:00` |
| 브라우저 입력 | configured `ttakkari_browser`; loopback Vite `127.0.0.1:5195` + 저장 fixture 전용 mock `127.0.0.1:5196`; 제품 쓰기 API는 mock에서 405 |
| 캡처 뷰포트 | desktop 1440×900, mobile 390×844; filename 없는 browser 캡처를 이 Run outbox에서 가져와 manifest 이름으로 복사 |

검증 출력: `PASS: offline IDs, mission detail/trace boundary, title groups=12/3/3/3`; `PASS: sources=200, jobs=20, empty job item pages=8, item detail cap recorded exceeded=30/10`; `PASS: observation scopes retained, matching-only details, source fixtures unchanged`. 브라우저는 저장 fixture를 local mock에서 읽었다. 이 Run에서 운영 GET/운영 쓰기, fixture maker, 합성 item·mission 상세는 실행하지 않았다. mission detail/trace는 adapter가 실제 저장 응답과 연결한 선택 mission 하나만 연결했다.

### e070bc0 새 표본 대조

| 화면·행 조작 | 결과 | 경계 / 증거 |
|---|---|---|
| `/collect` missions 목록 | 같은 제목 21행에서 4개 제목 그룹(12·3·3·3)을 렌더하고 서로 다른 mission alias를 보존했다. 1440×900 및 390×844 확인. | 저장 목록에는 일부 `plan.coverage`, `results`, `jobs`, `gaps`, `goal`이 없다. mock은 렌더에 필요한 빈 shape만 주입하고 `SHAPE_DEFAULT`로 기록한다. 따라서 해당 기본값 때문에 결과/문제/목표 셀이 비어 보이는 것은 실제 빈 값 관측이 아니다. 제목·회차·시각·count는 저장 표본이다. |
| `/collect?view=sources` | 200개 출처 행, desktop/mobile 확인. | adapter는 `items`와 응답 키를 유지했다. URL host/path는 `example.test`로 익명화됐다. |
| `/collect?view=runs`와 item | 20개 job 행 표시. 첫 행 `수집 항목 보기`에서 실제 저장 `job-5b9e510edb52a552` item 페이지 확인: GET 200, `items=[]`, `total=0`. | 저장된 8개 job item 페이지가 모두 0행이다. 추가 job 상세는 만들지 않았다. |
| 선택 mission 상세 / trace | `장기 수집 과제`, 상태 `cancelled`; detail·trace 조인 성공. 51개 요구 중 15개 충족, 36개 부족. 확인된 분류명: 디자인 시스템, 업무용 UI, UX 연구·이론, 접근성·표준, 공공 디자인 시스템, 분야. | 요구 원문과 실패·부족의 상세 사유는 익명화돼 있다. trace 문서 목록 1,652는 API 최대 3,000 범위이며 전체 누계나 사실 검증 수가 아니다. |
| canonical 후보 | completion item detail 10건 모두 `canonical_candidate=null`, `canonical_status=unreviewed`; 실제 `exact_of`/`cluster_id` 관계 0. | `candidate-8` 같은 문자열은 별도 synthetic 경계 테스트다. 실제 후보 ID나 확정 관계로 읽지 않는다. |

선택 mission의 saved detail 집계: discovered 69,851, acquired 4,903, accepted/imported 2,939, held 1,244, failed 466, blocked 104, duplicate 483, pending delivery 0, review-needed 2,926, auto-accepted 13. trace 요구 상태는 충족 15, 일부 충족 12, 진행 중 19, 차단 4, pending 1이다. 적재 2,939와 trace 응답 문서 목록 1,652는 다른 원장·범위이므로 전환율이나 동일 문서 수로 해석하지 않는다. 온톨로지 화면도 1,652 대상과 파싱/청킹 1,783, 개념 추출 degraded 1,783, 색인 succeeded 1,782/failed 1, 정본 통합 succeeded 1,782/skipped 1을 별도 집계로 보였다. 동일성·완료율 증명은 아니다.

78635d3 집계 경계는 실제 선택 mission에서 엔진 unavailable, 모델/세부 실행 상태 미확인, triage pending 1,353 / processing 0 / unresolved 0으로 표시됐다. legacy `precise_waiting`도 1,353이지만 그것만으로 triage 개별값을 대체하지 않는다. 별도 저장된 boundary test 입력은 legacy waiting 7/unresolved 0만 제공될 때 “대기·처리 합계 7건 · 개별 대기·처리 미확인 · 결과 확인 불가 0건”, triage의 명시적 0은 각각 0건, triage 일부 값만 제공될 때 빠진 pending을 만들지 않음을 확인한다. 이 숫자들은 synthetic test 입력이며 운영 표본이 아니다. 이 Run에서 제품 테스트는 재실행하지 않고 `independent-final-verification-20261107.md`의 기존 79-test/build 결과를 재사용했다.

### 원래 질문 7개에 대한 저장 표본 답

| 질문 | 화면 경로 | 표본이 답하는 범위 | 미확인 |
|---|---|---|---|
| 지금 어떤 연구를 진행 중인가? | `/collect` → 선택 mission → `요약·진행` | 익명 과제 “장기 수집 과제”는 `cancelled`; 3회차, 마지막 회차 수집 5건·적재 1건. 현재 진행 중으로 표시되지 않는다. | 원요청문은 `[운영 요청문 익명화]`; 취소 결정 맥락은 미확인. |
| 어느 분야의 지식을 확보했는가? | `확보 분야`, `요약·진행` | 디자인 시스템, 업무용 UI, UX 연구·이론, 접근성·표준, 공공 디자인 시스템, 분야 분류가 보인다. 목표량 충족은 15/51 요구다. | 익명 요구 번호 외 세부 문구, 원문 내용의 정확성/품질은 검증되지 않았다. |
| 요구사항 중 무엇이 부족한가? | `요약·진행` 부족 항목, `확보 분야` | 부족 36개. trace 상태는 일부 12, 진행 중 19, 차단 4, pending 1. 보충은 수집 종료 후 가능하다는 안내와 비활성 버튼이 보인다. | 익명화 때문에 개별 요구의 실질 주제와 접근 제한 출처는 미확인. |
| 실제 도서관에 무엇이 저장됐는가? | `요약·진행` 대표 자료 / `자료·품질` | 운영 집계 accepted/imported 2,939; trace 응답 문서 목록 1,652. 화면 대표 자료 3건은 익명 alias로 표시한다. | 전체 2,939 원문·정본 관계를 대조하거나 열람하지 않았다. 1,652는 trace API 응답 목록 수(최대 3,000)다. |
| 수집 품질이 얼마나 검증됐는가? | mission `요약·진행` 품질 판정 / `자료·품질 검토` | 판정 집계 수락 13, 추가 확인 2,926, 보류 1,244. review는 전체 2,310 중 첫 50행. UI는 판정 기준 성능 검증 이력 없음 표시. | 사실성·승인율 증거는 없다. 전체 큐를 로드하지 않았다. 키보드 필터 값 선택도 미통과. |
| 막혔다면 왜인가? | `요약·진행` 문제와 해결 행동 / `자율 조사` | 상태 cancelled. 정밀평가 엔진 사용 불가, 모델/세부 상태 미확인, 종료 사유 확인 필요. 화면은 부족 항목과 제한 출처 대체를 일반 행동으로 제시한다. | 실패·부족 사유가 `[실패·부족 사유 익명화]`라 취소 원인은 단정할 수 없다. |
| 지금 무엇을 해야 하는가? | 선택 mission의 `다시 실행`, `부족한 36개 보충 수집` | 화면은 다시 실행을 제안하며, 보충 수집은 종료 후 가능하다는 안내로 비활성이다. | 실행/보충은 누르지 않았다. 원요구·출처 권한·엔진 가용성·미확인 품질을 검토한 뒤 사용자/운영자가 재개 여부를 결정해야 한다. |

### 남은 상호작용·캡처·미실행

키보드 가능 조치 필터에 focus 후 `ArrowDown`, `Enter`; 재시도 `ArrowDown`; 이어 `r`, `Enter`; `Space`, `ArrowDown`, `Enter`를 보냈다. 매번 접근성 snapshot은 `모든 조치` selected로 남아 실제 값 변경을 확인하지 못했다. `browser_select_option`으로 대신 선택하지 않았다. 이 configured browser 입력 경로에서는 미통과이며 모든 플랫폼에서 필터가 고장 났다고 일반화하지 않는다. Review decision/재처리, 물리 터치, 정량 시각 계측 및 접근성 보조기술 검증은 실행하지 않았다. 물리 터치/계측은 configured browser 도구가 제공하지 않는다. 정책 차단 Review 행은 첫 실제 페이지 표본에서 찾지 못해 미실행이다.

Review는 baseline fixture `2,310 total / 50 loaded`; sources/jobs는 completion fixture `200 / 20`; 8개 실제 job item 응답은 각 0행이다. 첫 review 진입에서 mock에 해당 route가 없어 404가 한 번 났으나 본인 mock에 baseline route를 추가한 뒤 50행 로드에 성공했다. 이 초기 설정 오류와 mock shape default는 제품 결함/저장 fixture 관측으로 계산하지 않는다. `/sw.js` ServiceWorker MIME 경고와 browser snapshot의 console 2 errors는 로컬 환경 로그이며 새 UI 회귀로 분류하지 않았다.

이번 캡처는 2026-11-06 17:17–17:23 UTC (2026-11-07 02:17–02:23 KST), checkout `04eec5d` 및 adapter `e070bc0` 입력이다. 바뀐 mission/source/job sample 및 미완료 keyboard filter 결과만 담았다. 기존 794d0e9 통과 화면을 재사용하고 review form 열기, plan preview, 이전 synthetic pagination은 반복하지 않았다. 캡처와 원본 screenshot 시각은 manifest에서 구분한다. 이 감사는 UX/표본 판정이지 R1–R10 제품 승인이나 배포 완료 증거가 아니다. 제품 파일은 수정하지 않았다.
