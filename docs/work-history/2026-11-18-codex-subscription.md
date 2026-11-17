# Codex 구독 관리 화면 구현 후보 — 2026-11-18

기존 사용량 카드에 `SubscriptionRow`를 추가했다. 사용자 과업은 휴대폰에서 다음 자동 활성화 확인 시각과 마지막 결과를 보고 자동 설정/수동 요청을 제어하는 것이다. 기존 따까리의 색·서체·간격 토큰을 승계하고 모션을 추가하지 않았다. 날짜 4개는 모바일 1열, 넓은 화면 2열이다. 조작 영역은 48px이다.

- provider·계정/단기·주간 사용량은 기존 카드에 유지한다.
- 주간 초기화 예상, 자동 활성화 확인 예약, 다음 확인, 마지막 확인을 초 단위 KST로 표시한다.
- ON/OFF, 상태 확인, 지금 활성화, 실행 전후 비교를 제공한다.
- 0%와 미관측을 혼동하지 않고 unknown을 성공으로 표시하지 않는다. 주간 주기 효과 미검증 문구를 둔다.
- Codex 카드/전체 새로고침은 예약 상태도 갱신한다. 비 Codex 동작은 유지한다.
- 대화상자가 닫히면 예약 메타데이터 조회를 멈춘다. 실제 공급자 조회는 backend의 저빈도 정책이 담당한다.
- loading/empty/error/off/unknown/정상 상태를 구현하고 정상적인 조회 간격을 실패로 표시하지 않는다.

검증:

```
vitest run src/features/accounts/SubscriptionRow.test.tsx src/features/accounts/UsageDialog.test.tsx src/features/accounts/UsageDialog.legacy.test.tsx src/api/accountUsageFallback.test.ts
48 passed (4 files)
```

변경 파일 ESLint, `npm run build`, `design-lint.py SubscriptionRow.tsx` 통과. 테스트는 신규 동작의 실패를 먼저 확인했다. 프로덕션 번들 빌드는 타입 검사와 PWA 생성까지 마쳤다.

실 브라우저는 configured ttakkari_browser를 썼고 390×844/1280×1000의 합성 데이터를 확인했다. 긴 계정 이름·날짜·재시도 버튼이 카드 너비 안에 있고, 48px 버튼/스위치 라벨, 자동 설정 변경, 미확인 결과, 전후 비교, 오류 재시도를 확인했다. 오류 화면 console error 0. 실제 사용자 로그인·구독 요청을 사용한 검증은 아니다. 브라우저는 닫았다.

합성 fixture: `scripts/ui-sweep/subscription-preview.html`, `subscription-preview.tsx`.

- [데스크톱](evidence/2026-11-18-codex-subscription/desktop.png)
- [모바일: 미확인 결과와 자동 설정 꺼짐](evidence/2026-11-18-codex-subscription/mobile.png)

독립 검토·원격 통합·배포 전 후보 상태다. backend와 전체 목표는 backend `docs/work-history/2026-11-18-codex-subscription.md` 및 기획 manage_work R1~R6에서 이어간다.
