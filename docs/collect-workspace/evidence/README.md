# Evidence inventory

- `live-aggregate.json`: 2026-11-06T15:45:30.683372Z의 실제 owner-authenticated GET 상태·집계 증거. 후보 사본은 UUID형 ID를 결정적 `anon-*` 별칭으로 치환했다. mutation 없음.
- `replay-fixture.json`: local UI replay용 실제 mission/trace/review/audit/quality/summary 일부 응답. 후보 사본은 UUID형 ID를 같은 방식으로 치환했고, URL·제목·목표·문맥·본문·source key는 제거 또는 대체했다. 계획 생성 미리보기는 mock 응답이다.
- 기준 수집용 `read_live.py`와 `make_replay_fixture.py`는 저장된 fixture를 재사용할 수 있어 후보에 포함하지 않았다. 이번 통합에서 collection API GET을 실행하지 않았다.
- `scenario-matrix.md`: 데이터 존재 여부 및 보존 체크리스트.
- `screenshots/manifest.md`: 별도 checkout `e2d89e6`의 local replay 기준 목록/상세/검토/계획 화면 캡처를 desktop 1440×900 및 mobile 390×844로 정리한다. 이 캡처는 운영 직접 화면이 아니다.
