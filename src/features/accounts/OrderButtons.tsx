import { Icon } from "../../ui/Icon";
import "./orderButtons.css";

export function OrderButtons({ name, index, count, disabled = false, onMove }: {
  name: string;
  index: number;
  count: number;
  disabled?: boolean;
  onMove: (to: number) => void;
}) {
  return (
    <span className="account-order-buttons">
      <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label={`${name} 위로`}
        disabled={disabled || index === 0} onClick={() => onMove(index - 1)}>
        <Icon name="chevron-up" />
      </button>
      <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label={`${name} 아래로`}
        disabled={disabled || index === count - 1} onClick={() => onMove(index + 1)}>
        <Icon name="chevron-down" />
      </button>
    </span>
  );
}
