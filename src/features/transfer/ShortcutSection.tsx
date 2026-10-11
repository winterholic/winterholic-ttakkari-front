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
 * /api/transfers/simple 에 올리게 한다. 사진 앱·파일 앱 어디서든 공유 → '따까리로 보내기'.
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
  const url = apiUrl("/api/transfers/simple");
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
        사진 앱이나 파일 앱에서 공유 버튼 → "따까리로 보내기" 한 번으로 내 컴퓨터의 받는 폴더(기본 ~/docs/inbox)에 저장돼요. HEIC 변환·위치 정보 지우기도 똑같이 적용돼요.
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
          아래 ⓘ(단축어 정보) → <strong>공유 시트에 보기</strong> 켜기. 받는 유형은 <strong>이미지, 미디어, 파일</strong>.
        </li>
        <li>
          동작 추가 → <strong>URL 콘텐츠 가져오기</strong>. URL 에 아래 주소, 방법 <strong>POST</strong>, 요청 본문 <strong>양식</strong>.
          <span className="shortcut-steps__copy">
            <code className="tk-mono">{url}</code>
            <button className="tk-icon-button tk-icon-button--xs" type="button" aria-label="주소 복사" onClick={() => copy(url, "주소")}>
              <Icon name="copy" />
            </button>
          </span>
        </li>
        <li>
          헤더 추가: 키 <code>Authorization</code>, 값 <code>Bearer 토큰</code>(Bearer 뒤 한 칸 띄우고 위에서 복사한 토큰).
        </li>
        <li>
          양식에 필드 추가: 종류 <strong>파일</strong>, 키 <code>files</code>, 값 <strong>단축어 입력</strong>. 여러 장을 확실히 보내려면 이 동작을 <strong>반복(각 항목)</strong>으로 감싸고 값을 반복 항목으로.
        </li>
        <li>(선택) <strong>알림 보기</strong> 동작으로 "보냈어요"를 띄우면 끝난 걸 알 수 있어요.</li>
      </ol>

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
