import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSession, listSessions, listWorkspaces } from "../api/client";

export function HomePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [wsId, setWsId] = useState("");
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: () => listWorkspaces() });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => listSessions({ limit: 50 }) });
  const create = useMutation({
    mutationFn: (workspace_id: string) => createSession({ workspace_id }),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      nav(`/s/${s.id}`);
    },
  });

  const selected = wsId || workspaces.data?.[0]?.id || "";

  return (
    <main>
      <h2>워크스페이스</h2>
      {workspaces.isPending && <p>불러오는 중</p>}
      {workspaces.error && <p role="alert">{workspaces.error.message}</p>}
      <select value={selected} onChange={(e) => setWsId(e.target.value)}>
        {workspaces.data?.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name} ({w.root_path})
          </option>
        ))}
      </select>
      <button disabled={!selected || create.isPending} onClick={() => create.mutate(selected)}>
        새 세션
      </button>
      {create.error && <p role="alert">{create.error.message}</p>}

      <h2>세션</h2>
      {sessions.error && <p role="alert">{sessions.error.message}</p>}
      <ul>
        {sessions.data?.map((s) => (
          <li key={s.id}>
            <Link to={`/s/${s.id}`}>{s.title || s.id}</Link> [{s.engine}] {s.active_run_id ? "실행 중" : (s.last_run_status ?? "")}
          </li>
        ))}
      </ul>
    </main>
  );
}
