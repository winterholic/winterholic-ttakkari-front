/* global document */
// KB v3 핵심 플로우를 실제 백엔드(serve_backend.py)와 실제 브라우저(Playwright, Chrome)로 한 번 돈다. 데스크톱·모바일 두 크기.
// 사용: PLAYWRIGHT_CORE=<playwright-core>/index.mjs node scripts/kb-live/e2e_flows.mjs --front http://127.0.0.1:5199 --out <스크린샷 폴더>
// 브라우저가 뜨지 않으면 다시 시도하지 않고 그대로 실패로 끝낸다. 로그인은 백엔드 conftest 가 공개한 시험 비밀번호다.
import { mkdirSync } from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const FRONT = arg("front", "http://127.0.0.1:5199");
const OUT = arg("out", "/tmp/kb-e2e");
const PW = process.env.PLAYWRIGHT_CORE;
if (!PW) { console.error("PLAYWRIGHT_CORE 가 필요해요(playwright-core/index.mjs 경로)."); process.exit(2); }
const { chromium, webkit } = await import(PW);
const ENGINE = arg("engine", "chrome"); // chrome | webkit(iOS Safari 와 같은 엔진)
mkdirSync(OUT, { recursive: true });

const RUN = Date.now().toString(36); // 같은 서버에 여러 번 돌려도 중복·충돌이 나지 않게 올리는 값에 섞는다
const results = [];
let currentSize = "";
async function step(name, fn) {
  const label = `[${currentSize}] ${name}`;
  try { await fn(); results.push({ label, ok: true }); console.log("PASS", label); }
  catch (e) { results.push({ label, ok: false, error: String(e.message).split("\n")[0] }); console.log("FAIL", label, "::", String(e.message).split("\n")[0]); }
}
const expectText = async (page, text, timeout = 8000) => { await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout }); };
const shot = (page, name) => page.screenshot({ path: `${OUT}/${currentSize}-${name}.png`, fullPage: true });

async function run(size, viewport, isMobile) {
  currentSize = ENGINE === "chrome" ? size : ENGINE + "-" + size;
  const browser = ENGINE === "webkit" ? await webkit.launch({ headless: true }) : await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, deviceScaleFactor: isMobile ? 2 : 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const consoleErrors = [];
  const badResponses = [];
  const ignorable = (t) => /ServiceWorker|sw\.js|unsupported MIME type|401 \(Unauthorized\)|404 \(Not Found\)/.test(t); // vite dev 서버에는 sw.js 가 없고, 첫 로드의 refresh 401 과 일부러 연 없는 문서 404 는 기대한 응답이다
  page.on("console", (m) => { if (m.type() === "error" && !ignorable(m.text())) consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => { if (!ignorable(String(e.message))) consoleErrors.push("pageerror: " + String(e.message).slice(0, 200)); });
  page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400 && !r.url().includes("/auth/refresh")) badResponses.push(`${r.status()} ${new URL(r.url()).pathname}${new URL(r.url()).search}`); });

  await step("로그인", async () => {
    await page.goto(`${FRONT}/knowledge-library`, { waitUntil: "networkidle" });
    if (await page.locator("#password").count()) {
      await page.fill("#password", "correct-horse-battery");
      await page.locator("form button[type=submit]").first().click();
    }
    await page.getByRole("navigation", { name: "보기 방식" }).waitFor({ timeout: 15000 });
    // 첫 실행 소개가 화면을 덮는다. 사용자도 같은 단계를 거치므로 건너뛰기를 눌러 닫는다.
    const skip = page.getByRole("button", { name: "건너뛰기" });
    if (await skip.count()) await skip.first().click();
  });

  await step("메인: 현황·처리 오류·최근 자료·주제·개념 패널과 개인/회사 선택 UI 없음", async () => {
    await page.goto(`${FRONT}/knowledge-library`, { waitUntil: "networkidle" });
    for (const t of ["처리 현황", "처리 오류와 보류", "최근 자료", "주제별 분류", "주요 개념과 관계"]) await expectText(page, t);
    await expectText(page, "보류");
    if (await page.getByText("개인 범위", { exact: false }).count()) throw new Error("개인/회사 범위 문구가 보임");
    if (await page.getByRole("button", { name: /^(개인|회사)$/ }).count()) throw new Error("개인/회사 전환 버튼이 보임");
    await shot(page, "01-home");
  });

  await step("통합검색: 정본 카드·근거 배지·원문 위치", async () => {
    await page.goto(`${FRONT}/knowledge-library`, { waitUntil: "networkidle" });
    await page.getByLabel("지식 도서관 검색").fill("디플로이먼트");
    await page.getByRole("button", { name: "검색", exact: true }).click();
    await page.getByRole("article", { name: /개념 Deployment/ }).waitFor({ timeout: 10000 });
    await expectText(page, "정본 근거");
    await expectText(page, "근거 원문 보기");
    await shot(page, "02-search");
    await page.getByRole("button", { name: "근거 원문 보기" }).first().click();
    await expectText(page, "해시 일치");
    await shot(page, "03-evidence");
    await page.keyboard.press("Escape");
  });

  await step("자료 추가: 보류·실패·중복은 성공으로 안 보이고 등록만 처리 대기", async () => {
    await page.goto(`${FRONT}/knowledge-library`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "자료 추가", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.locator("input[type=file]").first().setInputFiles([
      { name: "e2e-note.md", mimeType: "text/markdown", buffer: Buffer.from("# E2E 메모 " + size + RUN + "\n\nPod는 쿠버네티스의 가장 작은 배포 단위이다. (" + size + RUN + ")\n") },
      { name: "old-sheet.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from([0, 1, 2, 3, 250, 251]) },
    ]);
    await page.getByLabel("웹 주소 (한 줄에 하나)").fill("http://127.0.0.1:9/none");
    await page.getByRole("button", { name: "추가", exact: true }).click();
    const list = page.getByRole("list", { name: "접수 결과" });
    await list.waitFor({ timeout: 15000 });
    await expectText(page, "처리 대기 1건");
    const txt = await list.innerText();
    if (!/old-sheet\.xls[\s\S]*보류/.test(txt)) throw new Error("xls 가 보류로 안 보임: " + txt);
    if (!/127\.0\.0\.1:9\/none[\s\S]*실패/.test(txt)) throw new Error("실패 URL 이 실패로 안 보임: " + txt);
    if (/old-sheet\.xls[^\n]*(처리 대기|등록됨)/.test(txt)) throw new Error("보류가 성공처럼 보임");
    await shot(page, "04-ingest-result");
    await page.getByRole("button", { name: "닫기" }).last().click();
  });

  await step("문서 상세: 개요·개념·관계 근거·주장·충돌·원문·버전/처리 이력", async () => {
    await page.goto(`${FRONT}/knowledge-library?view=docs`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^k8s-ko/ }).first().click();
    await page.getByRole("region", { name: "문서 상세" }).waitFor();
    await expectText(page, "AI 가 쓴 요약이 아니에요");
    await shot(page, "05-doc-overview");
    await page.getByRole("button", { name: "개념·관계·주장" }).click();
    await expectText(page, "관계와 근거");
    await expectText(page, "디플로이먼트는 레플리카셋을 관리한다");
    await shot(page, "06-doc-knowledge");
    await page.getByRole("button", { name: "원문 패시지" }).click();
    await expectText(page, "원문 위치 보기");
    await page.getByRole("button", { name: "버전·처리 이력" }).click();
    await expectText(page, "처리 이력");
    await shot(page, "07-doc-history");
  });

  await step("보류 문서: 성공처럼 안 보이고 재시도 대신 안내", async () => {
    await page.goto(`${FRONT}/knowledge-library?view=docs`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^legacy-budget/ }).first().click();
    await expectText(page, "이 문서는 보류 상태예요");
    await shot(page, "08-doc-held");
  });

  await step("처리 현황 드로어: 보류·부분 완료 필터, 재시도 결과 표시", async () => {
    await page.goto(`${FRONT}/knowledge-library`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^처리 / }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("dialog").getByRole("button", { name: "보류", exact: true }).click();
    await page.getByRole("dialog").getByText("legacy-budget").first().waitFor();
    if (await page.getByRole("dialog").getByRole("button", { name: /재시도/ }).count()) throw new Error("영구 보류에 재시도 버튼이 있음");
    await shot(page, "09-jobs-held");
    await page.getByRole("dialog").getByRole("button", { name: "부분 완료", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "심층 추출만 다시" }).first().click();
    await page.getByRole("dialog").getByText("다시 대기열에 넣었어요").first().waitFor();
    await shot(page, "10-jobs-retry");
    await page.keyboard.press("Escape");
  });

  await step("개념 그래프: 허브→이웃 펼치기→상세(별칭 추가, 관계 근거, 문서 이동)", async () => {
    await page.goto(`${FRONT}/knowledge-library?view=graph`, { waitUntil: "networkidle" });
    await expectText(page, "개념 ");
    const deployment = isMobile ? page.getByRole("button", { name: /^Deployment/ }).first() : page.getByRole("button", { name: /^Deployment, / }).first();
    await deployment.click();
    await page.getByRole("complementary", { name: "개념 상세" }).waitFor({ timeout: 10000 });
    await expectText(page, "관계와 근거");
    await shot(page, "11-graph-entity");
    await page.getByLabel("별칭 추가").fill("e2e-alias-" + size + "-" + RUN);
    await page.getByRole("button", { name: "추가", exact: true }).first().click();
    await expectText(page, "별칭을 추가했어요");
    await page.getByRole("button", { name: /^k8s-ko/ }).first().click();
    await page.getByRole("region", { name: "문서 상세" }).waitFor();
    await shot(page, "12-entity-to-doc");
  });

  await step("후보 관계 켜면 점선 후보가 보인다", async () => {
    await page.goto(`${FRONT}/knowledge-library?view=graph`, { waitUntil: "networkidle" });
    await page.getByLabel(/후보 관계도 보기/).click();
    await page.waitForFunction(() => document.querySelector(".kb3-check input")?.checked === true);
    await page.waitForLoadState("networkidle");
    if (!isMobile) await expectText(page, "후보 관계");
    await shot(page, "13-graph-candidates");
  });

  await step("충돌: 두 주장 비교와 확인 단계, 해결 후 결과 표시", async () => {
    await page.goto(`${FRONT}/knowledge-library?view=conflicts`, { waitUntil: "networkidle" });
    await shot(page, "14-conflicts");
    const item = page.getByRole("listitem", { name: /Kubernetes 값이 다른 주장/ });
    if (await item.count()) {
      // 열린 값 충돌이 아직 있으면 직접 해결해 본다(두 번째 크기부터는 이미 해결돼 있어 결과만 확인한다).
      await expectText(page, "refers to");
      await item.getByRole("button", { name: "A를 정본으로 채택" }).click();
      await page.getByRole("group", { name: "해결 확인" }).waitFor();
      await item.getByRole("button", { name: "확정" }).click();
      await page.getByRole("list", { name: "방금 해결한 충돌" }).waitFor();
    }
    await page.getByRole("button", { name: "해결된 것 포함" }).click();
    await page.getByRole("listitem", { name: /Kubernetes 값이 다른 주장/ }).getByText("정본으로 채택").first().waitFor();
    await shot(page, "15-conflicts-resolved");
  });

  await step("오류 상태: 없는 문서 주소", async () => {
    await page.goto(`${FRONT}/knowledge-library?view=docs&doc=00000000-0000-0000-0000-000000000000`, { waitUntil: "networkidle" });
    await expectText(page, "문서를 찾을 수 없어요");
    await shot(page, "16-doc-missing");
  });

  await step("가로 넘침 없음(메인·그래프·충돌)", async () => {
    for (const q of ["", "?view=graph", "?view=docs", "?view=conflicts"]) {
      await page.goto(`${FRONT}/knowledge-library${q}`, { waitUntil: "networkidle" });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 1) throw new Error(`${q || "main"} 가로 넘침 ${over}px`);
    }
  });

  console.log(`[${size}] console errors:`, consoleErrors.length ? consoleErrors : "none");
  console.log(`[${size}] http >= 400:`, badResponses.length ? badResponses : "none");
  results.push({ label: `[${size}] console errors`, ok: consoleErrors.length === 0, error: consoleErrors.join(" | ") });
  await browser.close();
}

await run("desktop", { width: 1280, height: 900 }, false);
await run("mobile", { width: 390, height: 844 }, true);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
