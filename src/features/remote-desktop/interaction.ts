export interface Point { x: number; y: number }
export interface View extends Point { scale: number }
export type InputMode = 'trackpad' | 'touch' | 'move';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// RFB pointer button mask bits. Wheel steps are buttons 4-7.
export const BUTTON = { left: 1, middle: 2, right: 4, wheelUp: 8, wheelDown: 16, wheelLeft: 32, wheelRight: 64 } as const;
export type WheelDirection = 'up' | 'down' | 'left' | 'right';
const WHEEL_MASK: Record<WheelDirection, number> = { up: BUTTON.wheelUp, down: BUTTON.wheelDown, left: BUTTON.wheelLeft, right: BUTTON.wheelRight };
const OPPOSITE: Record<WheelDirection, WheelDirection> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export const ZOOM_MAX = 4;

export function pointInDesktop(x: number, y: number, view: View, width: number, height: number): Point {
  return { x: Math.round(clamp((x - view.x) / view.scale, 0, width - 1)), y: Math.round(clamp((y - view.y) / view.scale, 0, height - 1)) };
}
export function zoomAt(view: View, scale: number, x: number, y: number, min = .15, max = 3): View {
  scale = clamp(scale, min, max);
  return { scale, x: x - (x - view.x) * scale / view.scale, y: y - (y - view.y) * scale / view.scale };
}
/** Scale at which the whole desktop is visible. Never enlarges a small desktop past 1:1. */
export function fitScale(boxWidth: number, boxHeight: number, width: number, height: number): number {
  return Math.min(boxWidth / width, boxHeight / height, 1);
}
export function pointerPacket(x: number, y: number, buttons: number): Uint8Array<ArrayBuffer> {
  x = Math.round(x); y = Math.round(y);
  return new Uint8Array([5, buttons, x >> 8, x & 255, y >> 8, y & 255]);
}
export function textKeysyms(text: string): number[] {
  return Array.from(text, c => c === '\n' ? 0xff0d : c === '\t' ? 0xff09 : c.codePointAt(0)! <= 255 ? c.codePointAt(0)! : 0x1000000 | c.codePointAt(0)!);
}

/** Pointer gain by finger speed (px/ms): slow strokes stay precise, quick flicks cross the screen. */
export function acceleration(speed: number): number {
  return clamp(.75 + 1.3 * speed, .75, 3.2);
}
/** Joystick deflection (0..1 of the radius) to cursor speed in screen px/s. Dead zone, then a quadratic ramp for fine control near the center. */
export function joystickSpeed(deflection: number, sensitivity = 1): number {
  const d = clamp((deflection - .12) / .88, 0, 1);
  return d * d * 800 * sensitivity + d * 50 * sensitivity;
}

interface InputCallbacks {
  pointer: (x: number, y: number, buttons: number) => void;
  pan: (dx: number, dy: number) => void;
  zoom: (factor: number, x: number, y: number) => void;
}
export interface InputConfig {
  /** Trackpad cursor gain. 1 moves the cursor as far as the finger moves on screen. */
  sensitivity: number;
  /** Multiplier on how quickly two-finger drags turn into wheel steps. */
  scrollSpeed: number;
  /** Flip the wheel direction when the Mac scrolls opposite to the fingers. */
  scrollReverse: boolean;
}
export const DEFAULT_CONFIG: InputConfig = { sensitivity: 1.3, scrollSpeed: 1, scrollReverse: false };

const SLOP = 6;
const LONG_PRESS_MS = 420;
const TAP_MS = 380;
const DOUBLE_TAP_MS = 320;
const WHEEL_STEP = 22;

export class TouchInput {
  mode: InputMode = 'trackpad';
  view: View = { x: 0, y: 0, scale: 1 };
  width = 1920;
  height = 1080;
  cursor: Point = { x: 0, y: 0 };
  config: InputConfig = { ...DEFAULT_CONFIG };
  /** Buttons held by something other than a finger on the surface, e.g. the overlay's drag lock or a held click button. */
  external = 0;
  private points = new Map<number, Point>();
  private origins = new Map<number, Point>();
  private start: Point = { x: 0, y: 0 };
  private startAt = 0;
  private lastAt = 0;
  private speed = 0;
  private moved = false;
  private multi = false;
  private dragging = false;
  private armed = false;
  private lastTap: { at: number; x: number; y: number } | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private wheelX = 0;
  private wheelY = 0;
  private gesture: 'scroll' | 'zoom' | null = null;
  private twoMoved = false;
  private twoStartAt = 0;
  private initialDistance = 0;
  private lastDistance = 0;
  private initialCenter: Point = { x: 0, y: 0 };
  private lastCenter: Point = { x: 0, y: 0 };
  constructor(private cb: InputCallbacks) {}

  get dragActive() { return this.dragging; }
  private mask(extra = 0) { return (this.dragging ? BUTTON.left : 0) | this.external | extra; }
  private emit(extra = 0) { this.cb.pointer(this.cursor.x, this.cursor.y, this.mask(extra)); }
  private beginDrag() { this.dragging = true; this.emit(); }
  private endDrag() { this.dragging = false; this.emit(); }
  /** Press and release one button without disturbing buttons already held. */
  click(button: number = BUTTON.left) { this.emit(button); this.emit(); }
  wheel(direction: WheelDirection) {
    const effective = this.config.scrollReverse ? OPPOSITE[direction] : direction;
    this.emit(WHEEL_MASK[effective]); this.emit();
  }
  /** Re-send the pointer state after `external` changed, so the Mac sees the press or release immediately. */
  sync() { this.emit(); }
  /** Move the cursor by screen pixels, as the joystick does. */
  nudge(dx: number, dy: number) {
    this.cursor = { x: clamp(this.cursor.x + dx / this.view.scale, 0, this.width - 1), y: clamp(this.cursor.y + dy / this.view.scale, 0, this.height - 1) };
    this.emit();
  }
  moveTo(x: number, y: number) { this.cursor = { x: clamp(x, 0, this.width - 1), y: clamp(y, 0, this.height - 1) }; }

  down(id: number, x: number, y: number, at = Date.now()) {
    if (this.points.size >= 2) return;
    this.points.set(id, { x, y }); this.origins.set(id, { x, y });
    clearTimeout(this.timer);
    if (this.points.size === 1) {
      this.start = { x, y }; this.startAt = at; this.lastAt = at; this.speed = 0;
      this.moved = false; this.multi = false; this.gesture = null;
      this.armed = !!this.lastTap && at - this.lastTap.at < DOUBLE_TAP_MS && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 48 && this.mode !== 'move';
      if (this.mode === 'touch') this.cursor = pointInDesktop(x, y, this.view, this.width, this.height);
      if (this.mode !== 'move') this.timer = setTimeout(() => { this.timer = undefined; if (!this.dragging && !this.multi) this.beginDrag(); }, LONG_PRESS_MS);
    } else {
      if (this.dragging) this.endDrag();
      this.armed = false; this.multi = true; this.gesture = null; this.twoMoved = false; this.twoStartAt = at;
      this.wheelX = 0; this.wheelY = 0;
      const [a, b] = [...this.points.values()];
      this.initialDistance = this.lastDistance = Math.hypot(a.x - b.x, a.y - b.y);
      this.initialCenter = this.lastCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }

  move(id: number, x: number, y: number, at = this.lastAt + 16) {
    const old = this.points.get(id);
    if (!old) return;
    this.points.set(id, { x, y });
    const dx = x - old.x, dy = y - old.y;
    if (this.points.size === 2) { this.moveTwo(id, x, y); return; }
    if (this.multi) return;
    if (!this.moved) {
      // Below the slop nothing moves, so finger jitter during a tap never nudges the cursor.
      if (Math.hypot(x - this.start.x, y - this.start.y) <= SLOP) return;
      this.moved = true; clearTimeout(this.timer);
      if (this.armed && !this.dragging) this.beginDrag();
    }
    const dt = Math.max(1, at - this.lastAt);
    this.speed = this.speed * .6 + (Math.hypot(dx, dy) / dt) * .4;
    this.lastAt = at;
    if (this.mode === 'move' || (this.mode === 'touch' && !this.dragging)) { this.cb.pan(dx, dy); return; }
    if (this.mode === 'touch') this.cursor = pointInDesktop(x, y, this.view, this.width, this.height);
    else {
      const gain = this.config.sensitivity * acceleration(this.speed) / this.view.scale;
      this.cursor = { x: clamp(this.cursor.x + dx * gain, 0, this.width - 1), y: clamp(this.cursor.y + dy * gain, 0, this.height - 1) };
    }
    this.emit();
  }

  private moveTwo(id: number, x: number, y: number) {
    const origin = this.origins.get(id);
    if (origin && Math.hypot(x - origin.x, y - origin.y) > 10) this.twoMoved = true;
    const [a, b] = [...this.points.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const cdx = center.x - this.lastCenter.x, cdy = center.y - this.lastCenter.y;
    if (!this.gesture) {
      const spread = Math.abs(distance - this.initialDistance), travel = Math.hypot(center.x - this.initialCenter.x, center.y - this.initialCenter.y);
      // Pointer events arrive one finger at a time, so until both fingers have moved the distance briefly changes even in a plain scroll.
      const both = [...this.points].every(([pid, p]) => { const o = this.origins.get(pid); return !!o && Math.hypot(p.x - o.x, p.y - o.y) > 4; });
      if (both) { if (spread > 16 && spread > travel * .7) this.gesture = 'zoom'; else if (travel > 10) this.gesture = 'scroll'; }
      else if (spread > 40) this.gesture = 'zoom';
      else if (travel > 24) this.gesture = 'scroll';
    }
    if (this.gesture === 'zoom') {
      this.cb.zoom(distance / Math.max(this.lastDistance, 1), center.x, center.y);
      this.cb.pan(cdx, cdy);
    } else if (this.gesture === 'scroll') {
      const step = WHEEL_STEP / Math.max(.25, this.config.scrollSpeed);
      this.wheelY += cdy; this.wheelX += cdx;
      // Fingers moving down reveal earlier content, which is the wheel turning up.
      while (Math.abs(this.wheelY) >= step) { const s = Math.sign(this.wheelY); this.wheel(s > 0 ? 'up' : 'down'); this.wheelY -= s * step; }
      while (Math.abs(this.wheelX) >= step) { const s = Math.sign(this.wheelX); this.wheel(s > 0 ? 'left' : 'right'); this.wheelX -= s * step; }
    }
    this.lastDistance = distance; this.lastCenter = center;
  }

  up(id: number, at = Date.now()) {
    if (!this.points.has(id)) return;
    clearTimeout(this.timer);
    this.points.delete(id);
    if (this.points.size > 0) return;
    if (this.dragging) { this.endDrag(); this.lastTap = null; return; }
    if (this.multi) {
      if (!this.gesture && !this.twoMoved && at - this.twoStartAt < TAP_MS) this.click(BUTTON.right);
      this.lastTap = null;
      return;
    }
    if (this.mode !== 'move' && !this.moved && at - this.startAt < TAP_MS) {
      this.click();
      this.lastTap = { at, x: this.start.x, y: this.start.y };
    } else this.lastTap = null;
  }

  cancel() {
    clearTimeout(this.timer);
    if (this.dragging) { this.dragging = false; this.emit(); }
    this.points.clear(); this.origins.clear(); this.multi = false; this.armed = false; this.lastTap = null;
  }
}
