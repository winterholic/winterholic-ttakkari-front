# 서버 리소스 GPU 카드 — 2026-10-16

사용자 요청으로 CPU 다음에 GPU 전체 사용률·모델·코어 수·사용/할당 통합 메모리를 표시한다. GPU 코어별 값은 제공하지 않으며, 기존 CPU 코어별 영역 제목을 명확히 했다. gpu 필드가 없는 이전 서버/수집 실패/지원하지 않는 환경은 —와 안내로 표시한다. 0%는 정상 값으로 표시한다. 기존 4초 폴링·토큰·게이지를 재사용했다.

검증: ResourcesPanel 8 tests passed(구현 전 새 검사 5개 실패 확인), tsc -b, Vite build, 변경 파일 ESLint, diff --check 통과. 기존 청크 크기 경고가 남는다. 지정 ttakkari_browser에서 실제 ResourcesPage와 실측 리소스 스냅샷을 사용해 320·390·1280px GPU 카드/수집 실패/이전 서버 응답을 확인했다. 운영 로그인·실기기 PWA는 미검증. 증거 outbox/fa5476ae-6b62-40f7-b5c9-087f0d4fcf8a/browser 및 gpu-sample.json.

상세 수집 계약·검증 경계는 backend docs/work-history/2026-10-16-gpu-resources.md와 docs/api-contract.md의 서버 GPU 리소스 절을 따른다. 독립 worktree /private/tmp/ttakkari-gpu-front에서 작업해 원본 front AccountsSection 미커밋 변경을 보존했다. main push가 Vercel 배포를 시작하며 수락·운영 적용 여부는 기획 세션 보고를 따른다.
