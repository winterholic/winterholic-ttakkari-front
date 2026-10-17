# 2026-10-17 토끼 마스코트 로고·아이콘 적용과 일러스트 연결

## 한 줄
사용자가 확정한 토끼 마스코트(2026-10-17)를 로고·파비콘·PWA 아이콘·스플래시로 바꾸고, 빈 화면·오류·온보딩에 `<Art>`(.tk-art)로 일러스트를 연결했다. 디자인 시스템은 1.3.0(`f02689a`)이다.

## 디자인 시스템 (winterholic-design-system/ttakkari)
- 아이콘 원본: 이미지 생성 세션이 같은 시각에 납품한 작은 크기 전용 아이콘(`brand/generated/icons/icon-mascot-*`, Blue 타일 + 얼굴, 커밋 `2216f6c`). 전신 기반 첫 후보는 16px 에서 읽히지 않아 쓰지 않았다.
- `assets/brand/build-brand-assets.py` 가 모서리 깎기·포맷·크기 선택만 한다. logo-mark·favicon(svg·16·32·48·ico)·app-icon-512·192·maskable·apple-touch·락업·히어로(전신)가 새 파일이다. ICO 는 크기별 손질본을 그대로 담는다. maskable 은 원본의 귀 끝이 80% 원을 약 2% 넘어 가장자리 색을 늘려 한 번 더 줄였다.
- 컷 10종 추가로 웹 파생본 29키 × 2. 문서 16·20·23, CHANGELOG 1.3.0, 브랜드 테스트를 마스코트 계약으로 교체.
- 나머지 시안 3종은 `characters/` 에 보존만 했다.

## 앱 (front)
- 동기화: `scripts/sync-design-system.sh` 가 `art-manifest.json`(납품 키 목록)도 복사한다. `<Art>` 는 목록에 없는 키는 요청하지 않고 `data-pending` 자리만 그린다.
- 로고: 헤더·사이드바·드로어·로그인은 `/brand/logo-mark.svg` 를 쓰므로 자산 교체만으로 바뀐다. `index.html` 파비콘(ico·32 png·svg), apple-touch, manifest 192·512·maskable(`pwa.json`).
- 스플래시: `index.html` 의 `#root` 안 `.tk-boot`(마스코트 로고 타일, `src/boot.css`)가 JS 가 뜨기 전 첫 화면이고, AppShell 의 인증 로딩 화면도 같은 모양이다. iOS 기기별 시작 이미지(apple-touch-startup-image)는 만들지 않았다.
- `src/ui/Art.tsx`: `alt=""`, 480/960 srcset, width·height, lazy, 크기 sm 96·md 154·lg 230, 이미지 오류 시 자리로 바꿈. `EmptyState`·`ErrorState`(art 옵션)·`StatePanel` 이 쓴다. 다크는 `color.art.halo`(디자인 시스템 CSS).
- 온보딩: 앱에 없던 화면이라 새로 만들었다. `features/onboarding/Onboarding.tsx` 3장(onboarding-01~03, lg). 첫 실행(`localStorage tk-onboarded` 없음)에 AppShell 위에 열리고, 건너뛰기·시작하기로 기록한다. 사용자 메뉴 「소개 다시 보기」로 다시 연다.

### 연결 표 (키 → 화면)
| 키 | 화면 |
|---|---|
| state-empty | 대화 빈 스레드, 결과물 미리보기 비어 있음, 작업(지난 작업 없음), 작업 공간(2곳), 보관함 파일 없음, 회의록·메모 빈 목록, 파일 폴더 비어 있음(sm), 비서 기억 없음(sm) |
| state-complete | 실패한 작업 없음 |
| state-no-results | 작업 검색 0건(sm), 보관함·회의록·메모 검색 0건, PMS 필터 0건 |
| state-error | 앱 오류 경계, 판(Canvas) 오류 경계(sm), 뷰어 오류 경계(sm), 따까리/대화 열기 실패, 작업·알림·실패 목록 불러오기 실패, 쪽 단위 ErrorState(작업 공간·보관함·회의록·메모·파일), 뷰어 상태 패널 오류 |
| state-offline | ErrorState·뷰어 패널의 오프라인 분기 |
| state-update-available | 앱·뷰어 오류 경계의 옛 번들(stale chunk) 분기 |
| state-not-found | 지워진 세션(ChatPage) |
| state-forbidden | 민감 자료 열람 차단(뷰어 blocked 패널, sm) |
| state-link-expired | 공유 링크 열 수 없음(PublicMeetingPage, sm) |
| state-notifications-empty | 알림 없음 |
| state-usage-limit | 사용량 대화상자에서 켜진 계정이 모두 한도일 때(sm) |
| onboarding-01·02·03 | 첫 실행 소개 |
| empty-work-visualization | PMS 프로젝트·칸반·간트·WBS 비어 있음 |
| empty-harness-visualization | 맥락 도서관 구조·온톨로지 비어 있음 |

### 연결하지 않은 것 (이유)
- state-approval-wait: 앱에 에이전트 권한 승인 전체 화면이 없다(승인은 회의록 제안 승인뿐이고 Approval 카드에는 쓰지 않는 규칙).
- state-working: 규칙상 Run 카드가 맡는다. state-session-expired, state-unsupported-preview, state-vpn-required, state-diff-clean, 도메인 empty 중 github·notebook·ml·blog·stock·game·remote·work 일부: 해당 화면이 앱에 없다.
- 404: 앱은 모르는 경로를 `/chat` 으로 보낸다(`path="*"` Navigate). 404 화면 자체가 없어 state-not-found 는 지워진 세션에만 붙였다.
- RunCard 의 한도 대기는 채팅 흐름 안 카드라 일러스트를 넣지 않았다.

## 검증 (2026-10-17)
- vitest 515 passed, 1 skipped(78 파일). `Art`·`Onboarding`·UsageDialog 한도 테스트 추가.
- `pnpm lint`: ui-lint ok · 위반 141건(기준선 141건 이하). tsc -b exit 0. `pnpm build` 성공(PWA precache 36).
- `pnpm check:layout --widths=320,390,1440`: 25경로 × 평소/긴 글자 + 가로 모드 위반 0, 첫 실행 소개가 열린 `/chat` 위반 0(run.sh 가 두 번 돈다. 두 번째는 `SWEEP_ONBOARDING=1`).
- 스크린숏(라이트·다크, 390·1440): 소개 3장, 드로어·헤더 로고, 스플래시(프로덕션 빌드, JS 차단), 빈 화면 8종, 오류 3종, 앱 오류 경계. 합성 API 와 Chrome 에뮬레이션이다.

## 확인하지 못한 것
- 실제 iOS Safari·홈 화면 아이콘·OS 마스크(원형·둥근 사각), 실제 계정 데이터, 로그인 화면 렌더(합성 환경이 항상 로그인 상태라 못 찍음. 같은 logo-mark.svg 를 쓴다).
- 파비콘 SVG(PNG 포함)의 Safari 동작은 확인하지 못했다. 그래서 ico·png 를 함께 건다.
- state-forbidden·link-expired·update-available 분기는 화면에서 직접 재현하지 못했고 코드·단위 테스트 수준이다.
- 디자인 시스템 `check:ui` 는 툴팁 항목이 두 번에 한 번꼴로 실패(58/58 ↔ 57/58). 이번 변경과 무관한 기존 불안정으로 보이나 원인은 조사하지 않았다.
- 단색 심볼은 한 덩어리 실루엣이다(알려진 한계).
