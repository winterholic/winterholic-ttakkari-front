# Antigravity 추가 계정 관리 프로필 UI (2026-10-17)

## 목표
- Google Antigravity(agy) 다중 계정 지원에 맞춰, 전용 HOME·전용 키체인을 사용하는 관리 프로필의 상태 표시, 전용 로그인 명령 복사, 그리고 로그인한 Google 계정 직접 확인(격리 검증) 단계를 UI에 노출한다.

## 구현 내용
- `src/api/types.ts`: `AccountOut`에 `auth_state`, `auth_error`, `isolation_mode`, `execution_enabled` 필드 추가.
- `src/api/client.ts`: `checkAntigravityAccount(id, body)` API 호출 함수 추가 (`POST /api/accounts/{id}/antigravity/check`).
- `src/features/accounts/AccountsSection.tsx`:
  - `AGY_STATE_TEXT`: `setup_required`, `auth_required`, `auth_expired`, `isolation_unverified`, `keychain_locked`, `keychain_mismatch`, `keychain_unavailable`, `invalid_profile`, `unsafe_path` 상태별 한국어 안내 문구 매핑.
  - `AntigravitySetup` 컴포넌트: 전용 HOME agy 로그인 명령 복사 기능 및 로그인한 Google 계정 이메일 입력 후 확인 요청 폼 제공.
  - 계정 추가 안내 문구 보강: Antigravity 첫 번째 계정(기존 로그인 호스트 유지)과 두 번째 이후 계정(전용 보관함 격리)의 차이점 설명.
- `src/features/accounts/AccountsSection.test.tsx`: 전용 HOME 로그인 안내 노출, 계정 입력 및 `checkAntigravityAccount` 확인 호출, 성공 후 라벨 반영 단위 테스트 추가.

## 검증
- `npx tsc -b`: 타입체크 통과.
- `npx vitest run`: 78 passed, 1 skipped (531 passed, 1 skipped) 전체 통과.
