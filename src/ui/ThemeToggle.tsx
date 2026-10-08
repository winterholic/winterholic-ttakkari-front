import { Icon } from "./Icon";
import { useTheme } from "./useTheme";

/** docs/06 §18: aria-pressed(다크 = true) + 아이콘 둘. CSS 가 pressed 에 따라 한쪽만 보인다. */
export function ThemeToggle({ size }: { size?: "sm" }) {
  const { isDark, toggle } = useTheme();
  return (
    <button
      className={size ? `tk-icon-button tk-icon-button--${size}` : "tk-icon-button"}
      type="button"
      data-tk-theme-toggle
      aria-label="다크 모드 전환"
      aria-pressed={isDark}
      onClick={toggle}
    >
      <Icon name="moon" className="tk-theme-toggle__to-dark" />
      <Icon name="sun" className="tk-theme-toggle__to-light" />
    </button>
  );
}
