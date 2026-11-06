# Creative Studio UI 통합 후보 (2026-11-07)

## 후보와 실행 출처

- 초기 통합 준비 Run: `c9be07d1-d0a8-419c-a130-ccfb20131a53`. 이번 독립 검증 반례 교정 Run: `2555624c-1974-49cf-bdc8-b21e39d1f158`, session `9f82d70e-5836-4e2b-9c94-f35f77f7b2d7`, 상세 GET profile `회사 코덱스 ai2 (ai2@hyperez.io)`.
- Stage3 구현 출처는 `c98013e2-738c-45a1-b7cf-d7a383b7eaf4` (profile `회사 코덱스 ai2 (ai2@hyperez.io)`). 기존 candidate 문서의 `257a80aa-4399-4a99-a12d-02233088fd52` 표기는 runs 목록이 오래된 순서인데 첫 항목을 현재 Run으로 취한 순서 실수였다. 해당 ID는 과거 실행이다. 이 통합·출처 교정 Run `c9be07d1-d0a8-419c-a130-ccfb20131a53`을 Stage3 구현 Run과 혼동하지 않는다. 원문 실행/evidence 문서는 보존했다.
- 고정 원후보: `048f20d205e6086b4d713b9fa893b46c2830bcf8` (`feat/creative-production-ui-20261107`). 기존 worktree 상태는 `ahead 1, behind 10`, tracked/untracked 변경 없음이었다.
- 기존 clean-verify 경로 `/Users/winterholic/development/projects/winterholic-ttakkari/front-creative-production-20261107-clean-verify`는 detached `048f20d205e6086b4d713b9fa893b46c2830bcf8`, clean 상태로 확인했다. 이 경로는 수정하지 않았다.
- 원격은 `https://github.com/winterholic/winterholic-ttakkari-front` (owner `winterholic`). 지원 계정 목록은 `winterholic`(active), `daeseon-dev`이며 `winterholic` per-command credential만 사용했다. 계정 전환은 하지 않았다.

## 원격 통합

- 정상 fetch 명령: `GH_AS_USER=winterholic GH_AS_TOKEN="$(gh auth token --hostname github.com --user winterholic)" git -c credential.helper= -c 'credential.helper=!f() { echo username=$GH_AS_USER; echo password=$GH_AS_TOKEN; }; f' fetch origin main`
- 결과: `origin/main` 당시 full SHA는 `a86544548c006c41bb4a9a49ab0cd0ab8a09713e` (`fix(artcraft): type update job modes`).
- 전용 branch/worktree: `integrate/creative-production-main-20261107` at `/Users/winterholic/development/projects/winterholic-ttakkari/front-creative-production-20261107-integrate`, 최신 main `a86544548c006c41bb4a9a49ab0cd0ab8a09713e`에서 생성.
- 병합 명령: `git merge --no-ff --no-commit 048f20d205e6086b4d713b9fa893b46c2830bcf8`.
- 결과: `Automatic merge went well; stopped before committing as requested` — 충돌 0. 결과 tree에서 최신 main의 Creative 외 변경은 그대로 있고, 후보의 Creative 관련 11개 경로만 추가/변경됐다. Creative 페이지와 API의 통합은 source hash 표를 참조한다.

### 겹친 경로의 보존

- 라우트: `/creative`는 Stage3 스토리보드 생성 흐름으로 연결하고, 기존 프로젝트 편집기 진입은 `/creative/legacy`와 `/creative/:id`에 유지했다. `/creative/plan`, 상세 계획 및 제작 기록 경로도 유지했다.
- API: `src/api/creativeV2.ts`의 기존 계획·제작·검수·부분수정 계약과 Stage3 storyboard run 요청/조회/취소/재개/accept 타입·함수를 함께 보존했다. 지원하지 않는 동작을 추가하거나 자동 승인·dispatch·render를 하지 않는다.
- 스타일: `creativePlan.css`에 기존 계획 상세와 Stage2 품질·부분수정 스타일 및 Stage3 생성/검토 스타일이 같이 남아 있다. Vite `/api` 개발 proxy도 후보 설정대로 복원했다.
- 다른 경로: 병합 diff는 Creative 관련 11개 경로로 제한됐다. 원 main checkout, 048 후보, clean-verify 및 backend worktree는 수정하지 않았다.

## source hash에 따른 기존 근거 재사용

아래 해시는 `ui-stage3-candidate-20261107.md`의 원 후보 fingerprint와 통합 worktree에서 새로 계산한 SHA-256이 같음을 확인했다. 따라서 같은 source에 묶인 기존 39-test·type·build·fixture 관측과 Stage2 근거의 출처 기록을 유지한다. 이 통합 worktree에서도 회귀·type·build는 새로 실행했다.

| source | SHA-256 | 재사용 근거 및 통합 검사 |
|---|---|---|
| `src/App.tsx` | `3edb2d43b349b18b12769108b99f1a0776ce628bc3ce1b0ae43cc5dc1b360d51` | 후보와 동일 hash; 기존 route mapping 보존, 새 39-test/build에서 확인 |
| `src/api/creativeV2.ts` | `8ce76eb7aeb40d93482dc760b05c67ec848b90135a10b63d7b77203698b37c52` | 후보와 동일 hash; 지원 API 계약 관련 테스트 포함 |
| `src/pages/creative/CreativePlanPage.tsx` | `9f90ee7a9745af45e7d8912d4ac63427e9145e4902d1945b21550a841458e781` | 후보와 동일 hash; 39-test 및 type/build 재검사 |
| `src/pages/creative/CreativePlanPage.test.tsx` | `e080f95770a50813f680d92bb15b5b3b5700108f63e27182a19d204442a5d5c9` | 후보와 동일 hash; 통합 worktree에서 관련 묶음 실행 |
| `src/pages/creative/StoryboardCreateFlow.tsx` | 원후보 `f4bb3cb7777515143715c0b3dd642f22bdef0e6dbcdf7f1ca136e1347025e701` → follow-up `ac74e7410f3399fb46fe22d7ca33c80e9f2879248a13f5d42d611a4a900496d5` | 아래 새 작성 key 교정 1곳; 재시도 동안 같은 key 유지 |
| `src/pages/creative/StoryboardCreateFlow.test.tsx` | 원후보 `fde74acaa7d7b8f56442e8c31fa0240beb410189185028fd816d6fd70e2daefd` → follow-up `6ba3987d456be548dab000024c184fcf091c1192252ce2e58303a05ddc0d568d` | 같은 brief 새 작성은 다른 key, 503 재시도는 같은 key/body인지 전용 회귀 |
| `src/pages/creative/creativePlan.css` | `a5e3b1264d2cd996a0a382a9550e86529baebe48351ff49bea043eb5d816aa76` | 후보와 동일 hash; 기존·Stage3 스타일 세트 보존 |
| `vite.config.ts` | `9bfcf190e827c128907f3a1d712e0d4278151606370e089b48251dddb29dcde4` | 후보와 동일 hash; 동일-origin local API proxy 설정 보존 |

기존 관측 출처는 [`ui-stage3-candidate-20261107.md`](ui-stage3-candidate-20261107.md)의 39 passed, typecheck, 325ms build, fixture 상호작용과 캡처 기록 및 [`ui-integration-evidence-20261107.md`](ui-integration-evidence-20261107.md)의 기존 Stage2 근거다. fixture 화면/응답은 운영 API나 실제 모델 성공 근거가 아니다. 독립 검증의 API 이벤트 `GET /api/runs/a09fad44-d7d1-43b6-a9d5-e827004327c1/events` seq 41/45에서 새 작성이 같은 key를 재사용하는 반례와 backend의 같은 key/body → 이전 Run 반환 동작을 확인했다. 이벤트만 조회했으며 다른 Run outbox는 읽지 않았다.

## 통합 후보 검증

작업 경로: `/Users/winterholic/development/projects/winterholic-ttakkari/front-creative-production-20261107-integrate`.

```text
pnpm exec vitest --run src/pages/creative/StoryboardCreateFlow.test.tsx src/pages/creative/CreativePlanPage.test.tsx src/pages/CreativePage.test.tsx --reporter=dot
Test Files  3 passed (3)
Tests       39 passed (39)
```

```text
pnpm exec tsc --noEmit
exit 0 (진단 없음)
```

```text
pnpm build
tsc -b && vite build — exit 0
✓ built in 428ms; PWA precache 95 entries
```

기존 대형 chunk 경고(870.35 kB main bundle, 1,264.34 kB PDF worker)는 남아 있다. `git diff --check`도 통과했다.

## 아직 검증하지 않은 것과 남은 단계

- 독립 검증에서 보고된 반례는 새 작성 동작의 idempotency key 재사용이었다. terminal Run에서 “다른 요청 작성”을 누를 때만 새 key를 발급하고, brief 변경이나 새 작성으로 key가 바뀐 후에는 HTTP 오류 재시도 동안 기존 key/body를 유지한다.
- 회귀 RED는 같은 brief 재제출의 두 POST key가 같다는 assertion 실패로 확인했다. 수정 후 `pnpm exec vitest --run src/pages/creative/StoryboardCreateFlow.test.tsx --reporter=dot`은 6 tests passed, `pnpm exec tsc --noEmit`은 exit 0이다. 새 source hash는 표에 기록했다.
- 이 follow-up 수정 이후 별도의 독립 재검증은 아직 받지 않았다. 이전 독립 결과를 기다리거나 폴링하지 않는다.
- 실제 배포 backend의 인증된 Stage3 여정, 실제 모델 Run, 실제 승인/dispatch/render는 수행하지 않았다. 운영 성공은 미검증이다.
- push와 배포는 하지 않았다. 독립 재검증 완료 전까지 원격에 보내지 않는다.
- 기존 048 verify worktree는 계속 읽기 전용으로 유지한다. 최종 follow-up commit은 동일 전용 branch/worktree에 경로 지정으로 추가한다.
