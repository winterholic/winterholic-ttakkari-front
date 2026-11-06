# AI Research Lab frontend 실사용 점검

일시: 2026-11-06 (KST)  
Frontend 기준: `origin/main` `e2d89e618be1f290016d2e35c6e1056f3b32eab8`  
Backend API 기준: `origin/main` `521f469aeb27a28a897bcac55fa969b1a5c2323e`  
작업 브랜치: `fix/lab-practical-20261106`

## 운영 화면 확인 범위

`https://ttakkari.winterholic.net/research`를 configured `ttakkari_browser`로 열었다. 로그인 세션이 없는 격리 브라우저여서 `/login?next=%2Fresearch`로 이동했고, `/api/auth/refresh`가 `401`을 반환했다. `/api/health`는 `200`이었다. 이 때문에 운영 Research Lab의 연구 데이터와 화면별 여정은 열지 못했고, 운영 프론트 배포 SHA도 확인하지 못했다. 아래 스크린샷은 연구 화면이 아니라 로그인 화면이며, Lab UI 검증으로 간주하지 않는다.

- Desktop 1280×720: `/Volumes/Backup/ttakkari-data/outbox/6c7d5c0b-9ce0-4b11-b3f4-5bc6f995279d/browser/page-2026-11-06T14-36-25-885Z.png`
- Mobile 390×844: `/Volumes/Backup/ttakkari-data/outbox/6c7d5c0b-9ce0-4b11-b3f4-5bc6f995279d/browser/page-2026-11-06T14-37-06-356Z.png`
- 관찰: 모바일 로그인 화면의 콘텐츠 폭은 358px이고 좌우 여백은 각 16px. 연구 생성·실행·상태·실패 복구·모델 비교·원자료 흐름은 인증 제한으로 미측정.

## 재현한 frontend 결함과 수정

### 결과물 열기에서 새 탭이 팝업 차단됨

- 위치: `src/pages/research/components/ArtifactList.tsx`
- 재현: 연구 결과물의 `열기·내려받기` 버튼을 누른다. 기존 코드는 서명 다운로드 URL을 비동기로 받은 다음 `window.open()`을 호출하므로 호출 시점에는 사용자 클릭 제스처가 끝나 있다.
- 회귀 증거: `ArtifactList.test.tsx`에서 클릭 직후 `window.open` 호출이 0회인 기존 동작을 확인했다. 클릭 핸들러 안에서 빈 탭을 동기적으로 열고 `opener`를 끊은 뒤 URL을 설정하도록 수정했다. URL 발급 실패 시 빈 탭을 닫는다.
- 사용자 영향: 원본 측정표·로그·리포트·입력 데이터 등 연구 근거 파일을 열지 못할 수 있었다.

### 최근 12개 밖에 있는 채택 결과의 설정과 원본 파일이 빠짐

- 위치: `src/pages/research/views/StudyRecordsView.tsx`
- 재현: 연구에 실험 13개를 만들고 13번째 실험 설정을 채택한 뒤 기록 화면을 연다. 화면 요약은 최근 12개 실험만 상세 조회해 채택 결과의 `/experiments/e13`을 요청하지 않았고, 설정 값과 연결된 측정표가 나타나지 않았다.
- 회귀 증거: 새 테스트에서 e13의 설정 `bm25_k1=2.7`과 `e13 원본 측정표`가 기존 코드에서 보이지 않는 것을 확인했다. 이제 채택 결과의 실험 ID를 상세 조회 목록에 포함한다.
- 조회 실패는 결과물이 없는 상태와 구분하고 다시 불러오기 동작을 제공한다.

## 화면별 점검 범위

| 여정 | 코드/자동화 확인 | 운영 브라우저 실측 |
|---|---|---|
| 연구 생성 및 시작 | `StudyFormModal`, 기록 테스트 | 미측정: 로그인 필요 |
| 실행 상태 및 진행 | `ExperimentMonitorView`, research 테스트 | 미측정: 로그인 필요 |
| 실패 원인·재실행 | Run 상세/재실행 경로, research 테스트 | 미측정: 로그인 필요 |
| 설정·모델 비교 | 서버 compare-series 경로, research 테스트 | 미측정: 로그인 필요 |
| 원문·결과물 열람 | artifact 링크·연구 기록 테스트 및 이번 수정 | 미측정: 로그인 필요 |
| 연구 기록·후속 실험 | 채택 설정 계보 테스트 및 이번 수정 | 미측정: 로그인 필요 |

## 검증

- `pnpm exec vitest run src/pages/research` → 9개 파일, 100개 테스트 통과.
- `pnpm build` → `tsc -b` 및 Vite production build 성공. 기존 500KB 초과 번들 경고가 출력됨.
- 최초 동작 RED: 결과물 링크 테스트에서 클릭 당시 팝업 호출 0회; 채택 실험 회귀 테스트에서 e13 결과물을 찾지 못함.
- GREEN: 두 회귀 테스트를 포함한 Research Lab 테스트 100개 통과.
- 브라우저: configured MCP 사용, desktop/mobile 자동 저장 스크린샷 확보, 종료 완료. 인증된 연구 화면 실측은 하지 못함.
- 운영 프론트 SHA, 390px·desktop에서의 연구 핵심 여정 캡처/계측은 미검증이다.
