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

이 기록은 이전 독립 UI 감사 Run `anon-268db8a01f56635fe102`의 연속이다. 새 Run `anon-21b6d17e26bb388a44c6`에서는 기존 8개 전후 캡처와 scenario 결과를 보존하고, 통합 교정 `4450dac`이 건드린 Review/ResearchPanel만 다시 확인했다. 목록·계획 재로딩은 영향이 없어서 생략했다. 이 세션의 callable tools 목록에는 `fresh_context`/`reset_my_context`가 없어 reset은 실행하지 않았다. 이 문서와 manifest에 revision·남은 검증 한계를 기록해 다음 재로딩 비용을 줄인다.

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

선택 mission에서 `counts.imported=2,939`, trace 문서 1,652, trace events 300, discarded 96, jobs 839, runs 3, requirements 51, targets 36이 서로 다른 필드/원장에서 읽혔다. 화면은 진행 요약/대표자료에 1,652 “도서관 적재 확인 자료”를, 단계 카드에는 2,939 “도서관 적재”를 표시한다. 서로 다른 모수이므로 전환율을 만들지 말라는 안내는 보이지만, 두 곳 모두 도서관 적재라는 표현이라 5초 안에 같은 값인지 별도 값인지 헷갈릴 수 있다. **결함 UI-01(중간)**: 상세 요약과 처리 단계에서 수치를 붙인 원장/모수를 바로 옆에 구분해 표기할 필요가 있다. 재현 URL `/collect?mission=anon-21eee7a431745b22e649`, desktop/mobile detail.

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
