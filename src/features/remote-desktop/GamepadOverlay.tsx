import { useEffect, useRef } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../../ui/Icon';
import { joystickSpeed } from './interaction';
import type { WheelDirection } from './interaction';

const capture = (el: Element, id: number) => { try { el.setPointerCapture(id); } catch { /* inactive pointer */ } };

export type PadButton = 'left' | 'right' | 'lock';
interface Props {
  leftHanded: boolean;
  opacity: number;
  scale: number;
  sensitivity: number;
  locked: boolean;
  onNudge: (dx: number, dy: number) => void;
  onButton: (button: PadButton, down: boolean) => void;
  onWheel: (direction: WheelDirection) => void;
}

/** Translucent thumb controls: a joystick that moves the cursor and click, scroll and drag-lock buttons. */
export function GamepadOverlay({ leftHanded, opacity, scale, sensitivity, locked, onNudge, onButton, onWheel }: Props) {
  const style = { '--rd-pad-opacity': opacity, '--rd-pad-scale': scale } as CSSProperties;
  return <div className={`remote-pad${leftHanded ? ' remote-pad--left-handed' : ''}`} style={style} role="group" aria-label="게임패드 조작">
    <Joystick sensitivity={sensitivity} onNudge={onNudge} />
    <div className="remote-pad__buttons">
      <button type="button" className="remote-pad__lock" aria-pressed={locked} onClick={() => onButton('lock', !locked)}>
        <Icon name="lock" /><span>드래그 잠금</span>
      </button>
      <div className="remote-pad__cluster">
        <div className="remote-pad__scroll" role="group" aria-label="스크롤">
          <ScrollButton direction="up" label="위로 스크롤" onWheel={onWheel} />
          <ScrollButton direction="down" label="아래로 스크롤" onWheel={onWheel} />
        </div>
        <div className="remote-pad__clicks">
          <HoldButton className="remote-pad__right" label="우클릭" button="right" onButton={onButton}>R</HoldButton>
          <HoldButton className="remote-pad__left" label="좌클릭" button="left" onButton={onButton}>L</HoldButton>
        </div>
      </div>
    </div>
  </div>;
}

function Joystick({ sensitivity, onNudge }: { sensitivity: number; onNudge: (dx: number, dy: number) => void }) {
  const base = useRef<HTMLDivElement>(null), knob = useRef<HTMLDivElement>(null);
  const state = useRef({ id: -1, dx: 0, dy: 0, frame: 0, last: 0 });
  const live = useRef({ sensitivity, onNudge });
  useEffect(() => { live.current = { sensitivity, onNudge }; });
  function stop() {
    const s = state.current;
    cancelAnimationFrame(s.frame); s.id = -1; s.dx = 0; s.dy = 0; s.frame = 0;
    if (knob.current) knob.current.style.transform = 'translate(0, 0)';
    base.current?.removeAttribute('data-active');
  }
  useEffect(() => stop, []);
  function tick(now: number) {
    const s = state.current;
    if (s.id < 0) return;
    const dt = Math.min(.05, (now - s.last) / 1000); s.last = now;
    const length = Math.hypot(s.dx, s.dy);
    if (length > 0) {
      const speed = joystickSpeed(Math.min(1, length), live.current.sensitivity) * dt;
      live.current.onNudge(s.dx / length * speed, s.dy / length * speed);
    }
    s.frame = requestAnimationFrame(tick);
  }
  function aim(e: ReactPointerEvent) {
    const rect = base.current!.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = (e.clientX - rect.left - radius) / radius, dy = (e.clientY - rect.top - radius) / radius;
    const length = Math.hypot(dx, dy);
    if (length > 1) { dx /= length; dy /= length; }
    const s = state.current; s.dx = dx; s.dy = dy;
    // The knob travels 0.45 of the base so it stays inside the ring.
    if (knob.current) knob.current.style.transform = `translate(${dx * radius * .55}px, ${dy * radius * .55}px)`;
  }
  return <div ref={base} className="remote-pad__stick" role="application" aria-label="커서 조이스틱. 밀어서 커서를 움직입니다"
    onPointerDown={e => {
      e.preventDefault(); capture(e.currentTarget, e.pointerId);
      const s = state.current; s.id = e.pointerId; s.last = performance.now();
      e.currentTarget.setAttribute('data-active', ''); aim(e);
      s.frame = requestAnimationFrame(tick);
    }}
    onPointerMove={e => { if (e.pointerId === state.current.id) aim(e); }}
    onPointerUp={e => { if (e.pointerId === state.current.id) stop(); }}
    onPointerCancel={e => { if (e.pointerId === state.current.id) stop(); }}
    onLostPointerCapture={e => { if (e.pointerId === state.current.id) stop(); }}>
    <div ref={knob} className="remote-pad__knob" />
  </div>;
}

function HoldButton({ button, label, className, children, onButton }: { button: 'left' | 'right'; label: string; className: string; children: string; onButton: Props['onButton'] }) {
  const pointer = useRef(-1);
  const release = (e: ReactPointerEvent) => { if (e.pointerId !== pointer.current) return; pointer.current = -1; e.currentTarget.removeAttribute('data-active'); onButton(button, false); };
  useEffect(() => () => { if (pointer.current >= 0) onButton(button, false); }, [button, onButton]);
  return <button type="button" className={`remote-pad__button ${className}`} aria-label={label}
    onPointerDown={e => { e.preventDefault(); capture(e.currentTarget, e.pointerId); pointer.current = e.pointerId; e.currentTarget.setAttribute('data-active', ''); onButton(button, true); }}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
    onClick={e => { if (e.detail === 0) { onButton(button, true); onButton(button, false); } }}>{children}</button>;
}

function ScrollButton({ direction, label, onWheel }: { direction: 'up' | 'down'; label: string; onWheel: Props['onWheel'] }) {
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval>; id: number }>({ id: -1 });
  function stop() { clearTimeout(timers.current.delay); clearInterval(timers.current.repeat); timers.current.id = -1; }
  useEffect(() => stop, []);
  const wheel = useRef(onWheel);
  useEffect(() => { wheel.current = onWheel; });
  return <button type="button" className="remote-pad__button remote-pad__step" aria-label={label}
    onPointerDown={e => {
      e.preventDefault(); capture(e.currentTarget, e.pointerId); stop(); timers.current.id = e.pointerId;
      e.currentTarget.setAttribute('data-active', ''); wheel.current(direction);
      timers.current.delay = setTimeout(() => { timers.current.repeat = setInterval(() => wheel.current(direction), 70); }, 320);
    }}
    onPointerUp={e => { e.currentTarget.removeAttribute('data-active'); stop(); }}
    onPointerCancel={e => { e.currentTarget.removeAttribute('data-active'); stop(); }}
    onLostPointerCapture={e => { e.currentTarget.removeAttribute('data-active'); stop(); }}
    onClick={e => { if (e.detail === 0) wheel.current(direction); }}>
    <Icon name={direction === 'up' ? 'chevron-up' : 'chevron-down'} />
  </button>;
}
