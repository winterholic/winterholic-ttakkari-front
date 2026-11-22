import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";
import { ResultVideo, downloadUrl } from "./ResultVideo";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const link = (over: Record<string, unknown> = {}) => ({
  url: "/api/creative/v2/plans/p1/production/results/2/final?token=t1", expires_at: "2026-11-22T01:00:00Z", sha256: "abc123abc123abc123", revision: 2, result_id: "final", ...over,
});
function stub(replies: Array<Record<string, unknown> | Response>) {
  const bodies: unknown[] = [];
  let i = 0;
  vi.stubGlobal("fetch", vi.fn(async (_: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const r = replies[Math.min(i++, replies.length - 1)];
    return r instanceof Response ? r : new Response(JSON.stringify(r), { status: 200 });
  }));
  return bodies;
}
const show = (sha: string | null = "abc123abc123abc123") => render(
  <QueryClientProvider client={new QueryClient()}><ResultVideo planId="p1" revision={2} sha256={sha} name="영상.mp4" /></QueryClientProvider>,
);

test("plays the result through a result-link bound to the revision and offers an attachment download of the same token", async () => {
  const bodies = stub([link()]);
  show();
  const video = await screen.findByLabelText("결과 영상");
  expect(video.getAttribute("src")).toContain("/production/results/2/final?token=t1");
  expect(bodies[0]).toEqual({ revision: 2, result_id: "final" });
  const a = screen.getByRole("link", { name: /MP4 다운로드/ });
  expect(a.getAttribute("href")).toContain("results/2/final?token=t1&download=true");
  expect(a.getAttribute("download")).toBe("영상.mp4");
});

test("a link whose SHA differs from the shown result is rejected and nothing is played", async () => {
  stub([link({ sha256: "ffffffffffffffff" })]);
  show();
  expect((await screen.findByRole("alert")).textContent).toMatch(/일치하지 않아/);
  expect(screen.queryByLabelText("결과 영상")).toBeNull();
  expect(screen.queryByRole("link", { name: /다운로드/ })).toBeNull();
});

test("when playback fails because the temporary link expired, a fresh link is issued", async () => {
  const bodies = stub([link(), link({ url: "/api/creative/v2/plans/p1/production/results/2/final?token=t2" })]);
  show();
  fireEvent.error(await screen.findByLabelText("결과 영상"));
  await waitFor(() => expect(screen.getByLabelText("결과 영상").getAttribute("src")).toContain("token=t2"));
  expect(bodies).toHaveLength(2);
});

test("a server error offers a retry instead of an empty player", async () => {
  stub([new Response(JSON.stringify({ detail: "결과가 없습니다." }), { status: 404 }), link()]);
  show();
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(await screen.findByLabelText("결과 영상")).toBeTruthy();
});

test("downloadUrl keeps the token and adds the download flag", () => {
  expect(downloadUrl("/x?token=a")).toBe("/x?token=a&download=true");
  expect(downloadUrl("/x")).toBe("/x?download=true");
});
