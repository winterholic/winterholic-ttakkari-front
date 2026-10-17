# 사용량 분리·CPU와 메모리 이력 그래프 — 2026-10-17

사용자 요청에 따라 별도 로컬 Flash Next 모델을 접수 경량 Qwen과 분리한다. 백엔드의 같은 날짜 작업 기록과 연결된다.

- 사용량 대화상자의 기존 카드를 `Qwen 접수 · 경량 모델`로 명시하고, 별도 `Qwen Flash Next` 카드를 추가했다. 입력/cache 재사용/출력 토큰, 처리 중·대기 요청, 서버/계측 상태를 30초마다 갱신한다. 대화상자를 닫으면 관측이 멈춘다.
- Flash 토큰은 현재 llama.cpp 서버 실행 누적(재시작 시 초기화)으로 설명하고, 입력에 cache가 제외됨을 명시했다. 접수의 KST 일간·주간과 합산하지 않는다. 미연결·모델 불일치·계측 누락은 —이며 유휴 0과 다르다.
- 서버 리소스의 GPU 이력 위에 CPU 전체 사용률과 메모리 사용량 그래프를 추가했다. 현재 값 카드 바로 아래에 배치하고 한 기간 선택기로 1시간·24시간·7일을 함께 전환한다. 메모리는 GiB/물리 용량 기준 축이며 CPU/GPU는 0~100%다. 표본 결측과 누락 간격에서는 각 지표의 선을 끊는다.
- 그래프 SVG 폭을 ResizeObserver로 맞춰 모바일에서 축 글자가 눌리지 않게 했다. 값별 시각·수치는 점의 title에서 확인할 수 있다. 기존 디자인 토큰을 유지했다.

## 검증 및 한계

- 초기 관련 테스트: 5 failed / 18 passed(신규 카드·그래프 부재). 최종 `npm test -- --run src/features/accounts/UsageDialog.test.tsx src/features/system/ResourcesPanel.test.tsx` → 23 passed.
- `npm run build`(tsc+Vite/PWA)·변경 TS/TSX ESLint·git diff --check 통과. 빌드의 기존 500KB chunk 경고는 남는다. 디자인 정적검사 ERROR 0/WARN 2(기존 코어 인덱스 및 그래프 경로 인덱스 key; 재정렬되는 상태 컴포넌트 아님).
- 지정 ttakkari_browser에서 390×844, 320×740, 1280×900 실제 컴포넌트를 확인했다. Flash는 실제 서버에서 GET으로 읽은 스냅샷, 자원 이력은 운영 DB를 READ ONLY 조회한 117개 표본, 접수는 이력 없음 fixture다. 기간 버튼의 24h/7d API 요청을 확인했지만 프리뷰는 각 기간에 같은 1시간 표본을 재사용하므로 실제 장기간 이력 렌더링 증거로 해석하지 않는다.
- 초기 favicon 404 이후 최종 fresh 페이지 콘솔 오류 0. 별도 프리뷰에 로그인 정보는 사용하지 않았다. 운영 로그인/PWA·실기기 Safari·새 API 운영 연결은 미검증이다.
- 최초 보정 확인에서 Vite가 이전 변환 코드를 계속 제공했다. HTTP 응답에 ResizeObserver가 없음을 확인하고 해당 프리뷰 서버만 재시작하자 최신 코드를 제공했다. fresh browser에서 SVG viewBox와 CSS 폭 모두 332px을 확인했다. 운영 backend 재시작과 무관하다.
- 증거는 Run outbox `795b8234-b1ec-4b1f-a505-ccaa1fea56bc/frontend-tests.txt`, `frontend-build.txt`, `browser/`에 보존했다. 최종 모바일 그래프 캡처 `browser/element-2026-10-17T03-29-28-195Z.png`.

독립 worktree에서 변경하여 canonical front의 다른 세션 미커밋 변경을 포함하지 않는다. main push는 Vercel 자동배포를 유발하지만 운영 반영 완료 여부는 별도 확인이 필요하다.
