# 2026-10-17 디자인 전수 검수 (여백·정렬·크기 비례·모달)

## 한 줄 요약
"계정 추가 모달의 여백이 하마 같다"에서 시작해 모든 페이지와 모달·메뉴 약 30종을 320·390·1440 폭, 라이트·다크로 캡처해 눈으로 판정했다. 원인의 대부분은 **같은 간격이 gap 과 margin 으로 두 번 생기는 것**(필드 사이 36px)이었고, 기존 검사가 조건부로 그려지는 모달을 한 번도 열지 않아 통과해 왔다.

## 발견과 조치
| # | 화면 | 증상(측정) | 원인 | 조치 |
|---|---|---|---|---|
| 1 | 설정 > 계정 추가·설정 | 필드 사이 36px | `.tk-field + .tk-field`(margin 20) + `.account-form` gap 16 | `.tk-stack`, 16 |
| 2 | 캘린더 일정 | 필드 36 · 묶음 32, 모바일에서 한 화면 넘음 | 같은 원인 + `.planner-form__when` | `.tk-stack`, 16 |
| 3 | PMS 작업·이슈 | 32/12 불규칙, 짝 필드 둘째 칸만 20 낮음 | `.pms-form` gap 12 + margin 20, `__pair` grid 안 margin | `.tk-stack`, pair margin 0 |
| 4 | PMS 프로젝트·회의 공유 | 20으로 다른 모달과 다름 | 폼마다 자체 gap | 16 통일 |
| 5 | 일정·PMS 모달 | 라벨이 본문 글자(계정은 medium) | `.tk-label` 누락 | 클래스 추가 |
| 6 | 메모 지우기 확인 | 폭 720(한 줄 내용) | `--tk-_w` 상속(lg 모달 안 중첩) | DS `.tk-dialog` 기본 폭을 자기 선택자에 |
| 7 | 확인 모달 7종 | 폭 560 | 크기 미지정 | `size="sm"`(400) |
| 8 | 모달 푸터 | 전체 폭 반씩 / 오른쪽 작은 둘 / ghost 취소 / size sm 혼재 | 푸터 밖 버튼 줄·래퍼·ghost | 버튼만 푸터에, 윤곽 취소, 모바일 폭 나눔 |
| 9 | 체크리스트 삭제 | 문단 사이 30 | `<p>` margin 14 + gap 16 | margin 0 |
| 10 | 회의 공유·다운로드 | 체크박스 13px | 네이티브 | `.tk-checkbox` 20px |
| 11 | 푸시 알림 모달 | 도움말 아래 24 빔 | `.tk-fieldset__help` 보정 + gap | DS `.tk-choices > .tk-fieldset__help` |
| 12 | 온보딩 모달 | 그림 위 64 빔 | `.tk-empty` padding 48 + 본문 16 | DS `.tk-dialog__body > .tk-empty` |
| 13 | 사용자 메뉴 | 로그아웃이 스크롤 뒤(360px 제한) | `.tk-menu` max-height | 화면 높이 기준 |
| 14 | 서버 리소스 | 카드·제목 사이 2px | 탭 패널에 레이아웃 규칙 없음 | flex column + gap 16 |
| 15 | 날씨 | 빈 상태 padding 소실, 줄간격 상속 | 없는 토큰 `--tk-space-7`·`--tk-font-line-height-tight` | 토큰 교체 + lint `undefined-token` |
| 16 | 320 PMS 작업·일정 모달 | 세그먼트 마지막 칸·진행률 칩·시각 아이콘 잘림 | label content-box(68×4), 칩 스크롤, 한 줄 강제 | DS `box-sizing`, `tk-chips--wrap`, `flex-wrap` |
| 17 | 320 채팅 스레드 | 화면 전체가 405로 넓어짐 | 채팅 열 `min-width: 360` + 헤더 328 | `min(pane-min, 100%)`, 헤더 아이콘화 |
| 18 | 채팅 헤더(390) | 제목 칸 8px, 아이콘 4px 간격 밀집 | 판 보기 글자·회사 아이콘 | 430 이하 글자 숨김 |
| 19 | 모바일 WBS | 제목과 요약 줄 왼쪽 27 어긋남 | 접기 칸만큼 제목만 들어감 | 요약·막대에 같은 들임 |
| 20 | 캘린더 음력 | 라벨이 스위치보다 위 | 스위치 margin 이 md 기준 | align center, margin 0 |
| 21 | 채팅 실행 단계 | "명령 실행ls -la" | 이름과 대상 사이 간격 없음 | DS `.tk-step__target` |
| 22 | 새 회의록 | 범위 세그먼트 34 vs 입력 40 | 높이 불일치 | DS `.tk-field > .tk-segmented` 40 |
| 23 | 탐색 드로어 | 구분선 아래 28 / 위 12 | gap 20 + margin 8 | margin 제거 |
| 24 | 사용량 모달 | 그룹 제목 위 8 중복 | gap + margin | margin 0 |

## 보류
- 메모 목록이 데스크톱에서 전체 폭(보관함도 같은 패턴). 디자인 결정이 필요해 바꾸지 않았다.
- iOS 실기기 동작(날짜·파일·키보드·safe-area)과 WebKit 캡처는 작업 환경 권한으로 막혀 미검증이다.

## 검사 도구(추가)
- `scripts/ui-sweep/modals.mjs`: 대표 모달·메뉴 23종을 320·390·1440 에서 실제로 열어 `gap-plus-margin` · `dialog-width` · `confirm-not-sm` · `label-style` · `native-checkbox` · `body-air` · `menu-clipped` 를 본다. `run.sh` 마지막에 돈다.
- `scripts/ui-sweep/fixtures-detail.mjs`: 회의 상세·PMS 대시보드·이슈·캘린더 일정·채팅 세션·날씨 합성 데이터. 기본 스텁이 `[]` 를 줘서 이 화면들은 "화면을 그리다 멈췄어요" 로 떨어져 검사된 적이 없었다. `run.sh` 경로에 상세 9개를 더했다.
- `scripts/ui-lint.mjs`: `undefined-token`. 앱 코드가 쓰는 `var(--tk-*)` 가 vendor CSS 에 없으면 실패한다.

## 정본
디자인 시스템 ttakkari 1.3.3: 문서 22(A10~A11 · B9~B17 · C8~C14), 03 §8 "모달 안쪽 여백", 06 §14. 앱 `src/vendor` 는 `scripts/sync-design-system.sh` 로 동기화했다.
