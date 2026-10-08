import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { login as apiLogin, logout as apiLogout, onAuthLost, refresh } from "./api/client";

type AuthState = "loading" | "in" | "out";
interface AuthCtx {
  state: AuthState;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("loading");

  useEffect(() => {
    onAuthLost(() => setState("out"));
    // 새로고침하면 메모리 토큰이 사라지므로 refresh 쿠키로 복구를 시도한다.
    refresh().then(
      () => setState("in"),
      () => setState("out"),
    );
    return () => onAuthLost(null);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      state,
      login: async (password) => {
        await apiLogin(password);
        setState("in");
      },
      logout: async () => {
        // 서버 호출이 실패해도 토큰은 이미 비워졌으므로 화면은 로그아웃 상태로 돌린다.
        try {
          await apiLogout();
        } finally {
          setState("out");
        }
      },
    }),
    [state],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider 밖에서 useAuth 를 썼다");
  return v;
}
