# Research retry 재진입 여정 frontend 통합 (2026-10-30)

## 범위

- 단일 변경은 retry Run 상세에서 원본 Run으로 돌아가는 링크와 해당 재진입 행동이다. 상세의 run별 query key, `ctx.go(run:id)` navigation, study/experiment URL context 보존은 제품 변경 커밋 `e24abb3f582a58bef84fdd1d0c4ea6be94c193e0`에서 확인했다.
- 이전 안내의 “원본의 설정·반복 번호·시드를 유지”는 과거 설정 값까지 불변임을 보증하는 표현이었다. 확인된 범위는 같은 config ID 참조 및 동일 반복 번호·시드뿐이므로 다음으로 정밀화했다: “이 실행은 원본 Run `<id>`을 참조하는 별도 기록입니다. 반복 번호와 시드는 원본과 같습니다.” 설정 값의 역사적 불변은 검증하지 않았다.
- UI/API 이외 기능, retry 동작, backend/API는 변경하지 않았다.

## 기준과 변경

- 시작 기준 및 push 전 원격 `main`: `7a6e0d009e509b2ba948947ab45909ad7a117596`. 갱신한 `origin/main`이 topic의 조상임을 확인했다.
- 원래 topic: `topic/research-journey-acceptance-20261030`, 최초 제품 commit `e24abb3f582a58bef84fdd1d0c4ea6be94c193e0`.
- 문구 보정 및 assertion 추가 commit: `3b068bd91eeed5a317e119b1c09be443b6c47c7e`.
- 관련 코드 변경은 `RunDetailDialog.tsx`의 문구 1줄과 `research.test.tsx`의 주장 1줄이다. 통합 기록은 이 문서에만 추가했다.

## 검증 근거

- 새 문구 assertion의 RED: `pnpm exec vitest run src/pages/research/research.test.tsx -t "opens the original Run from a retry Run detail after re-entry"`에서 `1 failed | 68 skipped`; 기존의 더 넓은 설정 보장 문구와 기대 문구가 달라 실패했다.
- 같은 명령의 GREEN: `1 passed | 68 skipped (69)`.
- `pnpm exec eslint src/pages/research/components/RunDetailDialog.tsx src/pages/research/research.test.tsx`와 `git diff --check`가 GREEN 실행과 함께 종료 코드 0.
- 제품 commit `e24abb3`에 대한 작성자의 기존 증거: 같은 focused test `1 passed | 68 skipped`, 수정 파일 ESLint exit 0, `pnpm build` exit 0(기존 큰 chunk 경고). 이 단계에서는 build와 전체 suite를 재실행하지 않았다.

## 한계와 미완 범위

- UI 증거는 mock 기반 focused interaction test다. 브라우저 MCP는 열렸지만 `127.0.0.1:5173`이 다른 test app을 제공해 Research 화면으로 검증되지 않았다. 브라우저 및 인증 운영 UI는 미검증이다.
- 원문 `docs/research-lab/refactor-v2-requirements.md`의 §5/§12/§13, PMS Research `664a2c29-b3d1-425c-b016-6c430cb7a7dc`의 7.x·8.3–8.6은 이번 변경에서 갱신하지 않았다. Research UX10 전체, native checkpoint, OS 합산 메모리, legacy 92 및 PMS 미완 항목은 계속 미완이다.
- frontend 전용 변경이다. backend 배포를 예약하거나 backend Run을 재실행하지 않았다.

## 통합·게시

- fast-forward 게시: `git push origin HEAD:main` 결과 `7a6e0d0..a120979 HEAD -> main`. `git ls-remote origin refs/heads/main`과 local HEAD가 모두 `a120979e56f24d785009cc72f09301b3d08d32e2`로 일치했다.
- 이 main commit의 GitHub Vercel check가 처음 `pending`이었고, 후속 조회에서 `success`, description `Deployment has completed`로 바뀌었다. Vercel check 대상은 `ttakkari` 프로젝트의 배포 URL `https://vercel.com/winterholics-projects/ttakkari/CWfaqH6phg4c28XDxBQ3d7cGGeii`다. 저장소의 기존 게시 규약에 따라 main push가 자동 배포를 시작하며, 이 결과는 preview 전용이 아닌 main 대상 Vercel 배포 완료로 기록한다.
- 배포 증거는 Vercel GitHub status에 한정한다. 인증된 실제 Research 화면의 기능 확인은 미검증으로 남긴다.
- 최종 통합 SHA에는 이 기록 문서가 추가되며, 게시 후 `main`과 원격 tip 일치를 다시 확인한다.

## 추가 제품 단계: 채택 기록에서 후속 설계 재진입

- 기존 분석 화면의 조건 비교, 최선 결과 채택, 설정 재사용 기능은 그대로 사용한다. 재진입 후 연구 기록의 채택 결론에서 해당 `experiment_id`, `configuration_id`, `run_id`를 후속 설계실로 전달하는 버튼을 연결했다.
- 설계실은 기존 API payload와 typed lineage 저장 계약을 사용한다. 원본 configuration은 초기값으로 복제되고, 새 experiment 생성 시 source Study/Experiment/Configuration/Run 관계를 보존한다.
- 신규 회귀 `research.test.tsx`는 기록 화면 진입 → 저장된 채택 항목 선택 → 설계실의 원본 설정 확인 → 실험 생성 API payload의 4개 source ID와 파라미터 확인을 검증한다. HTTP 계층은 testkit mock이며 실제 API 증거로 취급하지 않는다.
- 기존 분석 화면의 채택 실패/결정·일반 후속 설정 재사용 계약도 선택 실행했다. 상세 검증 명령과 backend 저장 증거는 backend `docs/work-history/2026-10-30-research-adopted-followup-lineage.md`에 기록한다.
- 브라우저·인증된 실제 UI·운영 API·PostgreSQL·배포는 이 topic에서 검증하지 않았다. e24 retry 재구현·재검증도 수행하지 않았다.
