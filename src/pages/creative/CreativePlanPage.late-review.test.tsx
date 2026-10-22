import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { CreativePlanNewPage } from "./CreativePlanPage";
vi.mock("../../shell/PageHeader", () => ({ PageHeader: ({title}: {title:string}) => <h1>{title}</h1> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount() { render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={["/creative/plan"]}><CreativePlanNewPage /></MemoryRouter></QueryClientProvider>); }
const ok = (v: unknown) => new Response(JSON.stringify(v), {status:200});
test("late validation must preserve a newer draft and keep it unconfirmed", async () => {
  let finish!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => {finish=resolve;});
  let validationStarted=false;
  vi.stubGlobal("fetch", vi.fn(async (url:string) => {
    if(url.endsWith("/catalog")) return ok({catalogs:{C01:{name:"콘텐츠 유형",entries:[{id:"C01.tech_explainer",name:"기술 설명"}]}}});
    if(url.endsWith("/intent/validate")) { validationStarted=true; return pending; }
    if(url.endsWith("/plans")) return ok([]);
    throw new Error(`unexpected request ${url}`);
  }));
  mount();
  fireEvent.change(await screen.findByPlaceholderText(/주제, 분위기/),{target:{value:"기술 설명 영상"}});
  fireEvent.click(screen.getByRole("button",{name:"직접 의도 작성"}));
  await screen.findByRole("option",{name:"기술 설명"});
  fireEvent.change(screen.getByRole("combobox",{name:"콘텐츠 형식"}),{target:{value:"C01.tech_explainer"}});
  fireEvent.change(screen.getByRole("textbox",{name:"근거 문구"}),{target:{value:"기술 설명"}});
  fireEvent.click(screen.getByRole("button",{name:"의도 검증 후 확인"}));
  await waitFor(()=>expect(validationStarted).toBe(true));
  fireEvent.change(screen.getByRole("textbox",{name:"근거 문구"}),{target:{value:"기술 설명 영상"}});
  await act(async()=> {finish(ok({valid:true,needs_confirmation:false,errors:[],warnings:[]})); await pending;});
  console.info("LATE_VALIDATION_OBSERVED", JSON.stringify({evidence:(screen.getByRole("textbox",{name:"근거 문구"}) as HTMLInputElement).value, confirmed:Boolean(screen.queryByText("검증을 통과했고 사용자가 확인했습니다.")), createEnabled:!(screen.getByRole("button",{name:"계획 만들기"}) as HTMLButtonElement).disabled}));
  await waitFor(()=>expect(screen.getByRole("textbox",{name:"근거 문구"})).toHaveProperty("value","기술 설명 영상"));
  expect(screen.queryByText("검증을 통과했고 사용자가 확인했습니다.")).toBeNull();
  expect(screen.getByRole("button",{name:"계획 만들기"})).toHaveProperty("disabled",true);
});
