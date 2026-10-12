const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [autofocus]';
const TEXT_ENTRY = 'textarea, [contenteditable=""], [contenteditable="true"], [autofocus], input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=submit]):not([type=range]):not([type=hidden])';

/**
 * showModal() 직후에 부른다. 브라우저는 첫 포커스 요소(드로어는 로고 링크, 패널·다이얼로그는 닫기 X)에 자동 포커스를 줘서
 * 터치에서도 파란 링이 그려진다. 첫 요소가 글자 입력 칸이면 그대로 두고, 아니면 상자 자신(tabIndex -1)에 포커스를 둔다.
 * 키보드 사용자는 Tab 으로 첫 요소에 들어간다.
 */
export function focusDialogBox(dialog: HTMLDialogElement): void {
  const first = dialog.querySelector(FOCUSABLE);
  if (first?.matches(TEXT_ENTRY)) return;
  dialog.focus({ preventScroll: true });
}
