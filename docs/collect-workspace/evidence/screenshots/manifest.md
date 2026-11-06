# 기준 화면 캡처 manifest

- 기준 프론트: 별도 detached checkout `/private/tmp/front-collect-baseline-e2d89e6`, commit `e2d89e6`; 제품 worktree 파일은 사용하지 않음.
- 실행: Vite local server `127.0.0.1:5194`, sanitized ttk replay fixture. 브라우저는 `ttakkari_browser` 사용, 파일명 인자 없이 캡처; 이 폴더의 이름은 보관용 복사본에 붙임.
- 출처 구분: 운영 UI 직접 로그인 화면이 아니다. 화면 API를 local replay로 공급했고 목록/상세/검토의 데이터는 익명화한 실제 GET fixture다. 계획 preview 응답은 local synthetic sample이다.
- 캡처 시각: 2026-11-06 15:30–15:31 UTC (2026-11-07 00:30–00:31 KST).
- 캡처 때 화면에 보인 review total은 2,306이었다. 화면 캡처 후 운영 응답을 다시 읽어 작성한 최종 aggregate는 2,310 (`2026-11-06T15:45:30Z`)이므로 스크린샷의 시점별 수치와 최종 JSON의 수치가 다르다.
- 후보 반입 전 재검토에서 desktop 캡처 4장은 좌측 계정 영역에 계정 식별자가 보여 보존하지 않았다. 아래 모바일 캡처 4장만 후보에 포함한다.

| 뷰 | 뷰포트 | 보관 파일 | 원본 browser 캡처 | 관측 HEAD |
|---|---:|---|---|---|
| 수집 목록 | 1440×900 | 미보존 (계정 식별자 노출) | `page-2026-11-06T15-30-13-635Z.png` | `e2d89e6` |
| 선택 임무 상세 | 1440×900 | 미보존 (계정 식별자 노출) | `page-2026-11-06T15-30-23-759Z.png` | `e2d89e6` |
| 검토 대기 | 1440×900 | 미보존 (계정 식별자 노출) | `page-2026-11-06T15-30-37-546Z.png` | `e2d89e6` |
| 계획 preview | 1440×900 | 미보존 (계정 식별자 노출) | `page-2026-11-06T15-30-57-723Z.png` | `e2d89e6` |
| 수집 목록 | 390×844 | `mobile-list-390x844.png` | `page-2026-11-06T15-31-05-387Z.png` | `e2d89e6` |
| 선택 임무 상세 | 390×844 | `mobile-detail-390x844.png` | `page-2026-11-06T15-31-11-541Z.png` | `e2d89e6` |
| 검토 대기 | 390×844 | `mobile-review-390x844.png` | `page-2026-11-06T15-31-19-098Z.png` | `e2d89e6` |
| 계획 preview | 390×844 | `mobile-plan-390x844.png` | `page-2026-11-06T15-31-56-082Z.png` | `e2d89e6` |

## 독립 감사 후보 캡처

후보 8장은 detached baseline이 아니라 감사 worktree의 revision `d87b696fbffcb63600b62487a0916d71779b49c8`에서 캡처했다. 모두 2026-11-06 16:02–16:05 UTC이며 실제 fixture GET replay다. 신규 계획 화면의 입력 및 preview만 local synthetic/mock이다. 아래 파일은 별도 Run outbox의 filename 없는 원본 browser 캡처를 저장소 evidence로 복사했다.

| 화면 | viewport | 저장 파일 | 원본 browser 캡처 | 관측 HEAD |
|---|---:|---|---|---|
| 목록 | 1440×900 | `ui-candidate-desktop-list-1440x900.png` | `page-2026-11-06T16-02-16-494Z.png` | `d87b696` |
| 상세 | 1440×900 | `ui-candidate-desktop-detail-1440x900.png` | `page-2026-11-06T16-03-26-059Z.png` | `d87b696` |
| 검토 | 1440×900 | `ui-candidate-desktop-review-1440x900.png` | `page-2026-11-06T16-04-05-408Z.png` | `d87b696` |
| 신규 계획 | 1440×900 | `ui-candidate-desktop-plan-1440x900.png` | `page-2026-11-06T16-04-48-923Z.png` | `d87b696` |
| 목록 | 390×844 | `ui-candidate-mobile-list-390x844.png` | `page-2026-11-06T16-04-58-521Z.png` | `d87b696` |
| 상세 | 390×844 | `ui-candidate-mobile-detail-390x844.png` | `page-2026-11-06T16-05-09-283Z.png` | `d87b696` |
| 검토 | 390×844 | `ui-candidate-mobile-review-390x844.png` | `page-2026-11-06T16-05-23-393Z.png` | `d87b696` |
| 신규 계획 | 390×844 | `ui-candidate-mobile-plan-390x844.png` | `page-2026-11-06T16-05-50-326Z.png` | `d87b696` |

## 통합 교정 후 1차 부분 캡처

이전 Run에서 저장한 아래 3장도 보존한다. 이 캡처는 시각상 교정 source `4450dac`를 사용했으며, commit 시각을 기준으로 repo HEAD는 파일별로 구분한다.

| 화면 | viewport | 저장 파일 | 원본 browser 캡처 | 화면 source / repo HEAD |
|---|---:|---|---|---|
| Review | 1440×900 | `ui-post-correction-desktop-review-1440x900.png` | `page-2026-11-06T16-22-05-388Z.png` | `4450dac` / `4450dac` |
| 임무 상세 첫 화면 | 390×844 | `ui-post-correction-mobile-detail-390x844.png` | `page-2026-11-06T16-25-09-314Z.png` | `4450dac` / `3b3e764` |
| Review | 390×844 | `ui-post-correction-mobile-review-390x844.png` | `page-2026-11-06T16-25-19-141Z.png` | `4450dac` / `3b3e764` |

## 통합 교정 후 영향 화면 최종 대조

2026-11-06 16:32–16:35 UTC, `4450dac805bc3557bc57bd8093abdd50e8dec06a`에서 Review와 ResearchPanel만 다시 캡처했다. Review 캡처는 actual GET replay fixture로, ResearchPanel은 selected mission의 actual GET detail로 표시된다. 별도 `COLLECT_SYNTHETIC_MISSING_DECISION=1` 경계 응답은 브라우저 snapshot에서 검증했으며, 아래 screenshot을 actual data 캡처로 오해하지 않도록 분리했다. production URL/API는 사용하지 않았다.

| 화면 / 상태 | viewport | 저장 파일 | 원본 browser 캡처 | 화면 source / repo HEAD / 입력 |
|---|---:|---|---|---|
| ResearchPanel precise status | 1440×900 | `ui-post-4450-desktop-research-1440x900.png` | `page-2026-11-06T16-32-18-654Z.png` | `4450dac` / `165ea5f` / actual mission GET |
| Review 재처리 가능 (46/50) | 1440×900 | `ui-post-4450-desktop-review-1440x900.png` | `page-2026-11-06T16-32-58-768Z.png` | `4450dac` / `165ea5f` / actual review GET |
| Review 재처리 가능 (46/50) | 390×844 | `ui-post-4450-mobile-review-390x844.png` | `page-2026-11-06T16-33-14-453Z.png` | `4450dac` / `3d2b30e` / actual review GET |
| ResearchPanel precise status | 390×844 | `ui-post-4450-mobile-research-390x844.png` | `page-2026-11-06T16-34-26-445Z.png` | `4450dac` / `3d2b30e` / actual mission GET |
| Review duplicate 상세 + dedupe JSON | 1440×900 | `ui-post-4450-desktop-review-detail-1440x900.png` | `page-2026-11-06T16-35-25-171Z.png` | `4450dac` / `3d2b30e` / actual item GET |
| Review duplicate 상세 + dedupe JSON | 390×844 | `ui-post-4450-mobile-review-detail-390x844.png` | `page-2026-11-06T16-35-42-118Z.png` | `4450dac` / `3d2b30e` / actual item GET |

## 794d0e9 독립 검증 캡처

2026-11-06 16:53–16:55 UTC (2026-11-07 01:53–01:55 KST)에 고정 snapshot `794d0e902dac50d4582ca9ed9582df3de0c49672`을 `/private/tmp/collect-audit-794d0e9`에서 실행했다. 저장된 비식별 GET fixture `observed_at=2026-11-06T15:45:43.416672Z`만 replay했다. 브라우저가 저장한 filename 없는 원본은 이번 Run outbox의 `browser/`에 있고 아래는 그 복사본이다. Mission/review 값은 이전 4450 screenshot의 값과 일치(2,939/1,652 및 2,310/50)하지만 screenshot 시각은 서로 다르다.

| 화면 | viewport | 저장 파일 | 원본 browser 캡처 | 화면 source / 입력 |
|---|---:|---|---|---|
| Review 최초 50행 | 1440×900 | 미보존 (계정 식별자 노출) | `page-2026-11-06T16-53-08-230Z.png` | `794d0e9` / fixture 2,310 total, 50 loaded |
| Review 최초 50행 | 390×844 | `ui-794d0e9-mobile-review-390x844.png` | `page-2026-11-06T16-55-02-628Z.png` | `794d0e9` / same saved fixture |
| 선택 mission 상세 | 1440×900 | 미보존 (계정 식별자 노출) | `page-2026-11-06T16-55-46-326Z.png` | `794d0e9` / imported 2,939, trace documents 1,652, max 3,000 |
| 선택 mission 상세 | 390×844 | `ui-794d0e9-mobile-mission-390x844.png` | `page-2026-11-06T16-55-49-954Z.png` | `794d0e9` / same saved fixture |
| 신규 계획 mock preview | 1440×900 | 미보존 (계정 식별자 노출) | `page-2026-11-06T17-04-13-872Z.png` | `794d0e9` / synthetic audit prompt, inert mock POST response |
| 신규 계획 mock preview | 390×844 | `ui-794d0e9-mobile-plan-preview-390x844.png` | `page-2026-11-06T17-04-24-720Z.png` | `794d0e9` / same prompt and preview; viewport capture |

추가 조작 증거는 `ui-independent-audit.md`에 기록했다. 상단 `review?offset=50` GET의 첫 응답 503과 재시도, 50→100 loaded 및 필터 유지를 configured browser로 실행했다. 두 번째 페이지는 저장된 첫 50행의 익명화 row를 mock에서 복제해 만든 synthetic pagination 데이터로, pagination 조작 확인용이며 fixture의 실제 2페이지를 뜻하지 않는다. Keyboard로 Review 폼을 열고 direct URL/뒤로가기도 확인했다. 신규 계획은 `/collect?new=1` 직접 진입해 synthetic 감사 문구로 inert mock preview POST 1회를 수행했다. 저장 mission 목록의 일부 plan에 `coverage`가 없어 `/collect` 기본 목록 진입은 React `map` 오류로 끝났으며 화면을 임의 synthetic fixture로 바꾸지 않았다. 이 오류 때문에 프로젝트 목록에서 새 계획 버튼으로 이동하는 연결 영향은 미검증이다. UI-01 수치와 모수 설명은 두 viewport에서 확인했다.

2026-11-06 15:30Z baseline e2d89e6 screenshot의 review total 2,306은 당시 다른 시점이다. 15:45:43Z 저장 fixture 관측은 2,310이며, 4450 캡처와 794d0e9 캡처는 모두 후자 fixture 값을 표시한다. 이전 4450 screenshot은 794d0e9 검증 증거로 재분류하지 않았다. 850a825b precision aggregate/canonical type correction의 독립 확인은 후속 범위다.
