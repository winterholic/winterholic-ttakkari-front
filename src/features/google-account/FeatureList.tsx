import { Link } from "react-router";
import type { GaFeature } from "../../api/googleAccountTypes";
import { Badge } from "../../ui/Badge";
import { featureStateLabel } from "./labels";
import "./googleAccount.css";

/** 이 계정의 로그인을 함께 쓰는 기능 목록. 새 기능은 등록만 하면 여기에 나타난다. */
export function FeatureList({ features }: { features: GaFeature[] }) {
  if (features.length === 0) {
    return <p className="ga-note">이 계정을 쓰는 기능이 아직 없어요.</p>;
  }
  return (
    <section aria-label="이 계정을 쓰는 기능">
      <h3 className="ga-subtitle">이 계정을 쓰는 기능</h3>
      <ul className="ga-features">
        {features.map((f) => {
          const s = featureStateLabel(f.enabled ? f.state : "disabled");
          return (
            <li key={f.id} className="ga-feature" data-feature={f.id}>
              <div className="ga-feature__head">
                <span className="ga-feature__name">{f.label}</span>
                <Badge tone={s.tone}>{s.label}</Badge>
                <Link to={f.path}>열기</Link>
              </div>
              <small>{f.description}</small>
              {f.covered === false && (
                <small className="ga-warn">이 기능이 쓰는 쿠키가 저장된 세션에 없어요. 이 기능 화면에서 로그인을 한 번 더 해 주세요.</small>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
