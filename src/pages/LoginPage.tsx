import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router";
import { ApiError } from "../api/client";
import { useAuth } from "../auth";

export function LoginPage() {
  const { state, login } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (state === "in") return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(password);
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : String(err));
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)}>
      <h1>Ttakkari</h1>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      <button type="submit">로그인</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
