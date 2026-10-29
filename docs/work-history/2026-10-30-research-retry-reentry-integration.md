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

- Push 및 Vercel production 결과는 아래 게시 후속 기록/현재 Run 보고에서 원격 SHA와 함께 보존한다. 원격 반영 확인 전에는 게시 또는 운영 배포 완료로 간주하지 않는다.
