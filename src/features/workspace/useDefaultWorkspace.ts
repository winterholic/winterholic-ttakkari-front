import { useQuery } from "@tanstack/react-query";
import { getDefaultWorkspace } from "../../api/client";

export const DEFAULT_WORKSPACE_KEY = ["workspace", "default"] as const;

export function useDefaultWorkspace() {
  return useQuery({ queryKey: DEFAULT_WORKSPACE_KEY, queryFn: getDefaultWorkspace, staleTime: 60_000 });
}
