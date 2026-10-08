import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { listArtifacts } from "../api/client";

export function LibraryPage() {
  const q = useQuery({ queryKey: ["artifacts"], queryFn: () => listArtifacts({ limit: 100 }) });
  return (
    <main>
      <h2>라이브러리</h2>
      {q.isPending && <p>불러오는 중</p>}
      {q.error && <p role="alert">{q.error.message}</p>}
      <ul>
        {q.data?.map((a) => (
          <li key={a.id}>
            <Link to={`/a/${a.id}`}>{a.filename}</Link> [{a.kind}] {a.size_bytes}B
          </li>
        ))}
      </ul>
    </main>
  );
}
