import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiUrl, createTransferToken, listTransferTokens, revokeTransferToken } from "../../api/client";
import type { TransferTokenOut } from "../../api/client";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";

const KEY = ["transfer-tokens"] as const;

function copy(text: string, what: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast({ message: `${what}을(를) 복사했어요.` }),
    () => toast({ message: "복사하지 못했어요. 길게 눌러 직접 복사해 주세요.", tone: "danger" }),
  );
}

/**
 * 설정 > 아이폰 단축어. 사파리 웹앱은 공유 시트에 들어갈 수 없어서, 단축어가 업로드 전용 토큰으로
 * /api/transfers/raw 에 파일 본문으로 올린다. 사진 앱·파일 앱 어디서든 공유 → '따까리로 보내기'.
 */
export function ShortcutSection() {
  const qc = useQueryClient();
  const id = useId();
  const q = useQuery({ queryKey: KEY, queryFn: listTransferTokens });
  const [fresh, setFresh] = useState<TransferTokenOut | null>(null);
  const make = useMutation({
    mutationFn: () => createTransferToken("아이폰 단축어"),
    onSuccess: (t) => {
      setFresh(t);
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
  const revoke = useMutation({
    mutationFn: (t: TransferTokenOut) => revokeTransferToken(t.id),
    onSuccess: (_r, t) => {
      if (fresh?.id === t.id) setFresh(null);
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
  const url = apiUrl("/api/transfers/raw?filename=");
  const local = /\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);

  return (
    <section className="tk-section" id="shortcut" aria-labelledby={`${id}-t`}>
      <div className="tk-section__head">
        <h2 className="tk-section__title" id={`${id}-t`}>아이폰 단축어</h2>
        <button className="tk-button tk-button--sm" type="button" aria-busy={make.isPending || undefined} onClick={() => make.mutate()}>
          <Icon name="key" />
          토큰 만들기
        </button>
      </div>
      <p className="tk-fieldset__help">
        사진 앱이나 파일 앱에서 공유 버튼 → "따까리로 보내기" 한 번으로 내 컴퓨터의 받는 폴더(기본 ~/.ttakkari/inbox)에 저장돼요. HEIC 변환·위치 정보 지우기도 똑같이 적용돼요.
      </p>
      {local && (
        <aside className="tk-callout tk-callout--warning" role="status">
          <Icon name="warning" className="tk-callout__icon" />
          <div className="tk-callout__body"><p>지금 주소는 이 컴퓨터 안에서만 열려요. 폰에서 쓰려면 외부 접속 주소(터널)를 연결한 뒤 그 주소로 만들어 주세요.</p></div>
        </aside>
      )}
      {fresh?.token && (
        <div className="shortcut-token" role="status">
          <p className="shortcut-token__title">새 토큰 · 지금만 보여요</p>
          <code className="account-form__cmd">{fresh.token}</code>
          <button className="tk-button tk-button--sm" type="button" onClick={() => copy(fresh.token!, "토큰")}>
            <Icon name="copy" />
            토큰 복사
          </button>
        </div>
      )}
      {make.error && <p className="tk-error" role="alert">{errorText(make.error).message}</p>}

      <ol className="shortcut-steps">
        <li>아이폰 <strong>단축어</strong> 앱 → 오른쪽 위 + → 이름을 <strong>따까리로 보내기</strong>로.</li>
        <li>
          단축어 세부사항 → <strong>공유 시트에 보기</strong> 켜기. 편집기 위쪽에서 받는 유형을 <strong>이미지, 미디어, 파일</strong>로 선택해요.
        </li>
        <li>
          <strong>각 항목 반복</strong> 동작을 추가하고 입력을 <strong>단축어 입력</strong>으로 선택해요. 다음 동작은 모두 반복 안에 넣어요.
        </li>
        <li>
          <strong>이름 가져오기</strong> 동작의 입력을 <strong>반복 항목</strong>으로 선택해요. 이어서 <strong>URL 인코딩</strong> 동작으로 그 이름을 인코딩해요. 확장자를 포함한 이름(예: 보고서.pdf)을 사용해요.
        </li>
        <li>
          <strong>URL</strong> 동작에 아래 주소를 넣고, <code>filename=</code> 바로 뒤에 앞 동작의 <strong>URL 인코딩된 텍스트</strong> 변수를 넣어요. 변수 이름을 직접 타이핑하지 말고 변수 선택으로 넣어요.
          <span className="shortcut-steps__copy">
            <code className="tk-mono">{url}</code>
            <button className="tk-icon-button tk-icon-button--xs" type="button" aria-label="주소 복사" onClick={() => copy(url, "주소")}>
              <Icon name="copy" />
            </button>
          </span>
        </li>
        <li>
          <strong>URL 콘텐츠 가져오기</strong>를 추가해 앞의 URL을 선택해요. 방법 <strong>POST</strong>, <strong>요청 본문 자체를 파일</strong>로 바꾸고, 파일 값은 <strong>반복 항목</strong>을 선택해요.
        </li>
        <li>
          헤더 두 개를 추가해요. <code>Authorization</code> = <code>Bearer 토큰</code>(Bearer 뒤 한 칸 띄우고 복사한 토큰), <code>Content-Type</code> = <code>application/octet-stream</code>.
        </li>
        <li>
          처음에는 <strong>훑어보기</strong> 동작으로 <strong>URL 콘텐츠</strong> 응답을 확인해요. <code>files</code>에 저장된 파일 이름·크기·경로가 나오면 서버가 받은 거예요. 오류 응답이면 보냈다는 알림을 띄우지 않아요.
        </li>
      </ol>
      <p className="tk-fieldset__help">
        파일은 양식의 필드 유형이 아니라 요청 본문 메뉴에서 선택해요. 텍스트·숫자·배열·사전·불리언 목록이 보이면 한 단계 위의 요청 본문으로 돌아가세요. 큰 파일은 파일 탭의 보내기에서 이어 올릴 수 있어요.
        {" "}<a href="https://support.apple.com/ko-kr/guide/shortcuts/apd58d46713f/ios" target="_blank" rel="noreferrer">Apple 요청 본문 안내</a>
      </p>

      {q.isSuccess && q.data.length > 0 && (
        <ul className="tk-list" aria-label="업로드 토큰">
          {q.data.map((t) => (
            <li key={t.id}>
              <div className="tk-list__item">
                <span className="tk-list__body">
                  <span className="tk-list__title">{t.name}</span>
                  <span className="tk-list__meta">
                    <span>만든 날 {new Date(t.created_at).toLocaleDateString("ko-KR")}</span>
                    <span>{t.last_used_at ? `마지막 사용 ${new Date(t.last_used_at).toLocaleString("ko-KR")}` : "아직 안 씀"}</span>
                  </span>
                </span>
                <span className="tk-list__end">
                  <button className="tk-button tk-button--sm tk-button--danger" type="button" onClick={() => revoke.mutate(t)} aria-busy={revoke.isPending || undefined}>
                    끊기
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
