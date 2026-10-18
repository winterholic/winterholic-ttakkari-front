import { createContext, useContext } from "react";
import type { GhAccount } from "../../api/githubTypes";

export interface GhContextValue {
  /** 이 화면이 쓰는 GitHub 계정 login(`?as=`). 모든 호출·쿼리 키가 이 값을 쓴다. */
  account: string;
  /** 지금 쓸 수 있는(state=success) 계정들. */
  accounts: GhAccount[];
  /** 같은 화면을 다른 계정으로 연다. ref·path·state 같은 나머지 쿼리는 그대로 둔다. */
  switchAccount: (login: string) => void;
}

export const GhContext = createContext<GhContextValue | null>(null);

export function useGh(): GhContextValue {
  const v = useContext(GhContext);
  if (!v) throw new Error("GitHub 화면 밖에서 계정 정보를 읽었어요.");
  return v;
}
