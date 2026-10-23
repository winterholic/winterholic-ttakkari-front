import { useSearchParams } from "react-router";
import type { KbScope } from "../../api/collector";
export function useKbScope(): KbScope {
  const [params] = useSearchParams();
  return params.get("scope") === "work" ? "work" : "personal";
}
