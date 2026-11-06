import { explainCollectionError } from "./missionProjects";

export function CollectionErrorNotice({ error }: { error: unknown }) {
  const guide = explainCollectionError(error);
  return <section className="collection-error" role="alert" aria-label="요청 처리 문제">
    <h3>{guide.what}</h3><p>{guide.impact}</p><p><strong>다음 행동</strong> · {guide.next}</p>
    {guide.technical && <details><summary>기술 진단 보기</summary><code>{guide.technical}</code></details>}
  </section>;
}
