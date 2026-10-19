import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { approveGameLock } from "../../api/client";
import type { Game } from "../../api/gameTypes";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";

/** 잠긴 결정(아트 스타일 등)을 읽기 쉽게 보이고, 승인은 사용자 인증이 필요한 back 의 lock/approve 로만 한다(ADR 0050). */
export function LockedDecisions({ game }: { game: Game }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const approve = useMutation({
    mutationFn: () => approveGameLock(game.id),
    onSuccess: () => {
      toast({ message: "잠긴 결정을 승인했어요", tone: "success" });
      void qc.invalidateQueries({ queryKey: ["games"] });
      setConfirm(false);
    },
  });
  const changed = game.lock_approved && game.lock_matches_repo === false;
  const needsApproval = !game.lock_approved || changed;

  return (
    <section className="game-locks" aria-label="잠긴 결정">
      {!game.lock_approved && (
        <p className="tk-banner tk-banner--warning" role="status">
          <Icon name="lock" />
          <span className="tk-banner__text">아직 승인한 적 없는 결정이에요. 승인하면 AI가 마음대로 바꿔도 빌드가 거절돼요.</span>
        </p>
      )}
      {changed && (
        <p className="tk-banner tk-banner--danger" role="alert">
          <Icon name="shield-alert" />
          <span className="tk-banner__text">승인한 뒤 저장소의 잠긴 결정이 바뀌었어요. 승인 전까지 빌드와 되돌리기가 거절됩니다.</span>
        </p>
      )}
      {game.lock_approved && !changed && (
        <p className="tk-banner tk-banner--neutral" role="status">
          <Icon name="shield" />
          <span className="tk-banner__text">승인된 결정과 같아요 (승인 {game.locked_revision}회째)</span>
        </p>
      )}
      {game.locked_decisions.length === 0 ? (
        <p className="tk-empty tk-empty--boxed">이 게임에는 잠긴 결정이 없어요.</p>
      ) : (
        <ul className="game-locks__list">
          {game.locked_decisions.map((d) => (
            <li key={d}><Icon name="lock" /><span>{d}</span></li>
          ))}
        </ul>
      )}
      {needsApproval && game.locked_decisions.length > 0 && (
        <Button onClick={() => setConfirm(true)}>
          <Icon name="shield" />
          <span>{changed ? "바뀐 결정으로 다시 승인" : "이 결정으로 잠그기"}</span>
        </Button>
      )}
      <Dialog
        open={confirm}
        onClose={() => { approve.reset(); setConfirm(false); }}
        size="sm"
        title="잠긴 결정 승인"
        modal
        footer={
          <div className="tk-button-group tk-button-group--end">
            <Button onClick={() => setConfirm(false)}>취소</Button>
            <Button variant="primary" busy={approve.isPending} onClick={() => approve.mutate()}>승인</Button>
          </div>
        }
      >
        <p>아래 {game.locked_decisions.length}개 결정을 고정해요. 이후 AI가 이 결정을 바꾸면 빌드가 거절돼요.</p>
        <ul className="game-locks__list">{game.locked_decisions.map((d) => <li key={d}><span>{d}</span></li>)}</ul>
        {approve.isError && <p className="tk-error" role="alert">{errorText(approve.error).message}</p>}
      </Dialog>
    </section>
  );
}
