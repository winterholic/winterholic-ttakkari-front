import { afterEach, expect, it, vi } from "vitest";
import * as api from "./client";

afterEach(() => { vi.unstubAllGlobals(); api.setAccessToken(null); });
const selection = { sections: ["transcript"] as const, include_people: false, include_evidence: false };

it("private export sends the exact reviewed selection and revision with owner authentication", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("선택한 전사"));
  vi.stubGlobal("fetch", fetcher);
  api.setAccessToken("owner-test-token");
  expect(api.exportMeetingDocument).toBeTypeOf("function");
  const blob = await api.exportMeetingDocument({ resource: { type: "meeting", id: "m1" }, selection: { ...selection, sections: [...selection.sections] }, format: "txt", part: "document", expected_source_revision: "sha256:reviewed" });
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toContain("/api/exports");
  expect(init.headers.Authorization).toBe("Bearer owner-test-token");
  expect(JSON.parse(init.body).selection.sections).toEqual(["transcript"]);
  expect(JSON.parse(init.body).expected_source_revision).toBe("sha256:reviewed");
  expect(await blob.text()).toBe("선택한 전사");
});

it("public requests use only the capability, omit cookies and never refresh on failure", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "share_unavailable", message: "공유를 사용할 수 없습니다." }), { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  api.setAccessToken("owner-test-token");
  expect(api.getPublicMeetingShare).toBeTypeOf("function");
  await expect(api.getPublicMeetingShare("share-id", "ps1_test")).rejects.toMatchObject({ status: 404 });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toMatch(/\/api\/public\/shares\/share-id$/);
  expect(url).not.toContain("ps1_test");
  expect(init).toMatchObject({ credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", headers: { Authorization: "Bearer ps1_test" } });
});

it("public downloads bind the viewed publication revision and CSV part", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("csv"));
  vi.stubGlobal("fetch", fetcher);
  expect(api.downloadPublicMeetingShare).toBeTypeOf("function");
  await api.downloadPublicMeetingShare("s1", "ps1_test", "csv", "actions", 3);
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(Object.fromEntries(url.searchParams)).toEqual({ format: "csv", part: "actions", revision: "3" });
  expect(fetcher.mock.calls[0][1].credentials).toBe("omit");
});
