import { useQuery } from "@tanstack/react-query";
import { listGoogleAccounts } from "../../api/client";

export const gaKeys = {
  all: ["google-accounts"] as const,
  list: ["google-accounts", "list"] as const,
};

/** 마지막으로 알려진 계정 상태만 읽는다(브라우저·Google 요청 없음). 로그인 창이 열려 있는 동안만 주기적으로 다시 읽는다. */
export function useGoogleAccounts() {
  return useQuery({
    queryKey: gaKeys.list,
    queryFn: listGoogleAccounts,
    refetchInterval: (q) => (q.state.data?.accounts.some((a) => a.login.active) ? 3000 : false),
  });
}
