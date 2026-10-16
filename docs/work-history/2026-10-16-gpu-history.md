# 서버 리소스 GPU 사용률 기록 — 2026-10-16

- `ResourcesPanel` 아래에 GPU 전체 사용률 시간 그래프를 추가했다. 1시간·24시간·7일로 전환하고, 실패 샘플(`null`)과 수집이 비어 있는 간격은 선을 끊는다. 유휴 `0%`는 0 위치의 점으로 남긴다.
- 1시간은 원본 간격, 24시간은 1분 평균, 7일은 10분 평균이라는 API 집계와 일치한다. 상세 메모리 수치와 함께 기존 GPU 카드의 40코어 정보는 그대로 유지한다. 설명 문구는 전체 사용률 50%를 코어 40개 중 20개 사용으로 해석하지 않도록 명시한다.
- 관련 vitest: `npm test -- --run src/features/system/ResourcesPanel.test.tsx` → **9 passed**. `npx tsc -b`, `npx vite build` 통과. 빌드에는 기존 500KB 초과 청크 경고가 남는다.
- Ttakkari browser에서 데스크톱 1280px·모바일 390px 화면을 확인했다. 샘플 그래프 이미지는 현재 Run outbox의 `gpu-history-desktop.png`, `gpu-history-mobile.png`다. 화면을 열 때만 live 리소스가 아닌지 확인했고, history API는 별도 기간 요청으로 불러온다.
- main 푸시로 기존 Vercel 경로 배포를 시작한다. 실제 Vercel 운영 반영 결과는 완료 기록에 덧붙인다.
