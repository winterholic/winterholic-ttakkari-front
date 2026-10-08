import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "danger";
type Size = "xs" | "sm" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  /** 진행 중이면 aria-busy 와 disabled. 폭은 유지된다. */
  busy?: boolean;
}

/** docs/06 §1, docs/19 §2: 상태는 클래스가 아니라 ARIA 로 낸다. */
export function Button({ variant, size, block, busy, className, disabled, type = "button", ...rest }: ButtonProps) {
  const cls = [
    "tk-button",
    variant && `tk-button--${variant}`,
    size && `tk-button--${size}`,
    block && "tk-button--block",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <button {...rest} type={type} className={cls} aria-busy={busy || undefined} disabled={busy || disabled} />;
}

type IconVariant = "secondary" | "primary";
type IconSize = "xs" | "sm" | "lg";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 필수. 아이콘 버튼은 이름이 없으면 읽히지 않는다. */
  "aria-label": string;
  variant?: IconVariant;
  size?: IconSize;
  round?: boolean;
}

export function IconButton({ variant, size, round, className, type = "button", ...rest }: IconButtonProps) {
  const cls = [
    "tk-icon-button",
    variant && `tk-icon-button--${variant}`,
    size && `tk-icon-button--${size}`,
    round && "tk-icon-button--round",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <button {...rest} type={type} className={cls} />;
}
