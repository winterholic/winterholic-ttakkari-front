# 2026-10-17 iPhone UI 결함 수정 (WebKit 검증 미확인)

## 한 줄 요약
이 문서의 재현·원인·수정 내용은 선행 작업자의 기록이다. 해당 WebKit 실행 로그나 결과물을 이번 독립 검증에서 찾지 못해, 아래 WebKit 재현과 원인 설명은 검증된 사실로 보지 않는다. 이번 Run에서 직접 확인한 범위와 미검증 항목은 끝의 독립 확인에 기록한다.

## 선행 작업자 기록 (독립 검증 전)
다음 표의 재현·원인 칸은 작업자의 주장 기록이다. WebKit 실행 증거가 없어 독립 확인되지 않았다.

## 재현 결과 주장 (수정 전, WebKit iPhone 14 390 / SE 320, 실데이터 규모 스텁)
| 사용자 지적 | WebKit 재현 | 원인 | 고친 곳 |
|---|---|---|---|
| 맥락 도서관 탭·본문이 왼쪽으로 밀림 | 재현: 본문(.tk-screen__body) scrollWidth 437 > 390(문서 scrollWidth 는 390 이라 기존 검사에 안 잡힘) | 탭 6개 `.tk-segmented--block` 라벨이 nowrap 이라 상자 밖으로 | DS `.tk-segmented--scroll` + `data-fade`, 앱 `useScrollFade`. 비서 관리 탭도 같은 증상이라 같이 |
| 새 메모 흰 띠 | 재현 | sticky 도구 줄에 `surface-default`(흰색)를 줌 | `.memo-page .memo-editor__bar` 배경을 canvas 로, 제목은 상자 없는 글 머리, 태그 입력·추가 버튼 stretch |
| 보관함 여백 | 재현(개수→"오늘"→첫 항목 사이 약 48/44px) | `<p class="tk-list__group">` 의 기본 margin 12×2 + 필터 padding | DS `.tk-list__group { margin: 0 }`, 앱은 필터 아래 padding 만 조정 |
| 알림 여백·부제 잘림 | 재현 | 부제: flex 상자(.tk-header__meta)의 맨 글자는 `text-overflow` 가 안 먹음. 여백: toolbar·day margin 이 겹쳐 쌓임 | DS `.tk-header__meta-text`, `PageHeader` 가 문자열 메타를 span 에 담음, 알림 부제는 "안 읽은 알림 N개", 알림 여백 한 단계 축소 |
| 상단바 | 상태바 영역(safe-area 59) + 헤더 56 = 115. safe-area 는 `.tk-header` 한 곳에서만 더해져 **중복은 아니었다** | 데스크톱 높이를 폰에도 | DS 폭 1023 이하 헤더 안쪽 높이 48 |
| PMS 칸반 | 재현(옆 열이 잘림) | 열을 가로로 나열 | 767 이하는 상태 탭(할 일·진행·검토·완료, 개수) + 한 칸, 끌기 대신 카드 ⋮ 메뉴, 데스크톱 그대로 |
| 채팅 첨부 메뉴 위치 | WebKit 데스크톱에서는 iOS 메뉴 자체가 없어 **재현 불가**. 코드 원인은 확인: 3곳(Composer·TranscriptField·NewMeetingForm)이 `<input type=file hidden>`(display:none) | iOS 가 메뉴를 붙일 상자 없음 | `FileButton`(투명 input 을 버튼 위에 같은 크기로 겹침). TransferPanel 은 이미 같은 방식. WebKit 에서 input 상자 == 버튼 상자 수치로 검증 |
| 회의 날짜 입력 | WebKit 데스크톱에서 **재현 안 됨**(390/390). iOS 네이티브 컨트롤 고유 문제로 추정 | iOS date input 의 자체 폭(추정) | DS `.tk-input` 날짜류 `appearance:none; display:block; min-width:0; max-width:100%`(`:where()` 로 낮은 우선순위) — 방어. **실기기 미검증** |
| (추가 발견) 채팅 헤더 알림 배지 | 99+ 배지가 종 아이콘을 거의 다 덮음 | top/right 0 에 38px 배지 | 배지 16px 높이·오른쪽 위 모서리 |
| (추가 발견) 비서 관리 탭 | 320 에서 라벨이 밀림 | 맥락 도서관과 같음 | `--scroll` |

## 정본(디자인 시스템 ttakkari 1.3.2)
`components/{app,content,form,navigation}.css`, `docs/22`(A8·A9·B6~B8·D7~D9, 검사 규칙·한계·체크리스트 11~13), `CHANGELOG.md`, `scripts/ttakkari-layout.check.mjs`(`--browser=webkit`, 규칙 4종 `scroller-overflow-x` `date-input-overflow` `file-input-hidden` `ellipsis-on-flex-text`). 앱 `src/vendor` 는 `scripts/sync-design-system.sh` 로 동기화.

## 검증 도구
- `scripts/ui-sweep/webkit-shots.mjs`: WebKit 캡처 + document/본문 scrollWidth + 파일 input 상자 수치. WebKit 에는 safe-area 에뮬레이션이 없어 `env(safe-area-inset-*)` 를 px 로 치환(상단 59/20).
- `scripts/ui-sweep/run.sh`(= `pnpm check:layout`): Chrome 5폭 + WebKit 320/390 을 모두 돈다. `--browser=webkit|chrome` 으로 하나만.
- `scripts/ui-sweep/stub.mjs`: 알림 148건·보관함 30건 가득·PMS 14작업·도서관 349/5,175/193/59/15 실제 수치.
- 전후 캡처: 이 실행 outbox `shots/` (`before-*`, `after-*`, `compare-*`, `metrics-summary.md`).

## 선행 작업자가 못 한 것이라고 기록한 항목
- Xcode iOS 시뮬레이터: `xcrun simctl` 없음(Command Line Tools 만 설치, Xcode 없음). 그래서 iOS Safari 로는 확인하지 못했다.
- iOS 실기기: 날짜 입력 폭, 파일 선택 메뉴 위치는 **미검증**. 원인 코드는 고쳤지만 실기기에서 확인이 필요하다.
- 긴 글자 주입(stress) 모드의 본문 넘침 몇 건(`/resources` 범위 버튼, `.pms-card__pct`, 품질 표 td)은 고정 라벨에 글자를 붙이는 합성 시나리오라 `scroller-overflow-x` 는 평소 모드에서만 본다.

## 이번 Run 독립 확인
- 지정된 사용자 스크린샷 7장을 직접 열어 비교했다. 별도 UI 재설계 없이 요청된 8개 증상만 확인했다.
- configured `ttakkari_browser`로 앱을 렌더링했다. Chrome 기반 viewport 320/390, 가로 844×390, light/dark에서 주요 화면을 캡처했다. 320px의 날짜 입력(상자 x16–304), 메모 태그 입력과 추가 버튼(각 40px 높이), 보관함 30개 데이터의 개수→오늘→첫 파일 간격(상자 y203–221→225–257), 알림 148개 데이터의 메타(91×18px)·날짜/카드 간격을 확인했다. 이 값은 해당 Chrome fixture 렌더링의 CSS 픽셀이다.
- 320px PMS 화면에서 상태 탭 4개와 단일 열이 화면 안에 보였고, 가로 844px에서는 데스크톱 칸반 열을 유지했다. Context Library 본문은 좌우 gutter 안에 보였으며 마지막 탭 선택으로 수평 스크롤되는 것을 확인했다.
- 390px 알림 화면에서 긴 제목은 줄바꿈됐고 카드 폭은 x17–373이었다. 비가시 ‘시스템’ 탭을 자동 클릭하는 브라우저 동작은 선택 후에도 해당 탭을 화면 밖(x445–489)에 두었다. 이 탭은 먼저 가로로 스크롤해야 직접 누를 수 있다. configured browser에는 터치 스와이프 입력이 없어 탭 끝까지의 실제 손가락 스크롤 동작은 미검증으로 남긴다.
- 채팅 첨부 버튼은 Chrome 렌더링에서 32×40px 버튼 상자에 붙어 있었다. OS 파일 선택 메뉴 위치는 이 환경에서 확인되지 않았다.
- 브라우저 도구는 WebKit/iPhone 프리셋을 제공하지 않는다. 디자인 시스템 `check:layout`은 Playwright Core 경로를 찾지 못해 브라우저 실행 전에 멈췄다. 따라서 WebKit 전체 재현, 날짜 네이티브 컨트롤, 파일 선택 메뉴, 실제 iPhone safe-area와 키보드 동작은 미검증이다. 상단 간격의 원인은 확정하지 않는다.
- `pnpm exec vitest run`의 UI 관련 테스트, build와 scoped lint 결과는 마지막 실행 출력으로 확인해 기록한다.

## 첨부 메뉴 위치: 투명 input 이 터치를 직접 받도록 변경 (2026-10-17 22시대)
- 이전 구성은 투명 input 에 `pointer-events:none` 을 주고 버튼 onClick 에서 `input.click()` 을 불렀다. 이 경우 iOS 가 메뉴 기준 상자로 input 을 쓰는지는 근거가 없다(추정이며 실기기 미검증).
- 변경: `.tk-file-slot > input[type=file]` 이 pointer-events 를 받아 손가락이 input 자체를 누른다. 눌린 요소가 file input 이면 iOS 는 그 요소 기준으로 메뉴를 붙이는 것이 일반적인 동작이라는 판단이며, 이 환경에서는 확인하지 못했다. 버튼은 키보드·보조기기 경로로 남아 `click()` 으로 같은 input 을 연다. disabled 일 때는 input 도 터치를 받지 않는다.
- 근거 수준: 코드 구조 판단. WebKit·iOS 시뮬레이터·실기기에서 메뉴 위치를 보지 못했다. 같은 `pointer-events:none` 구조가 `TransferPanel`(`.transfer__file`)에도 남아 있다. input 에 disabled 연동이 필요해 이번에는 건드리지 않았다.
- 경위: iOS 묶음 본체는 53ace03(18:32)으로 이미 origin/main 에 올라가 있었다. 원본 front 작업 트리는 그 커밋 전의 로컬 main(560a21a)에 머물러 있어 같은 변경이 미커밋처럼 보였을 뿐이다. 이 변경은 origin/main(ed94f39) 위에 얹은 후속 한 건이다.
- 실행(origin/main + 이 변경, 깨끗한 worktree): vitest 80파일 통과(541 통과/1 skip), eslint 0, ui-lint 141건(기준선 이내), tsc -b 0, vite build 통과.

## 다른 세션 변경과의 관계
`AccountsSection*`·`UsageDialog*`·`ResourcesPanel*`·`EngineBadge*`·`src/api/types.ts` 는 이 작업이 아니다. 커밋에서 제외한다.
