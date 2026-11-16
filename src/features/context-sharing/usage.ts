/**
 * 외부 AI·터미널에서 쓰는 방법. 키 값은 인자로 받지 않는다(받을 수 없게 해서 화면·복사본에 실수로 실리지 않게 한다).
 * 키는 `read -rs` 로 입력받아 환경변수에만 둔다. 키를 1회 교환하면 같은 만료 시각까지 쓰는 세션 토큰이 나온다.
 */
export function buildUsageGuide(publicUrl: string | null): string {
  const url = publicUrl ?? "<Gateway 공개 주소>";
  return [
    `export CONTEXT_GATEWAY_URL='${url}'`,
    "# 발급받은 키를 붙여 넣고 Enter. 화면과 셸 기록에 남지 않는다",
    "read -rs CONTEXT_GATEWAY_KEY && export CONTEXT_GATEWAY_KEY",
    "# 키는 한 번만 교환할 수 있다. 응답의 access_token 이 만료 시각까지 쓰는 세션이다",
    'curl -sS -X POST "$CONTEXT_GATEWAY_URL/api/v1/auth/exchange" -H "Authorization: Bearer $CONTEXT_GATEWAY_KEY"',
    "export CONTEXT_GATEWAY_SESSION='<위 응답의 access_token>'",
    'curl -sS "$CONTEXT_GATEWAY_URL/api/v1/projects" -H "Authorization: Bearer $CONTEXT_GATEWAY_SESSION"',
  ].join("\n");
}
