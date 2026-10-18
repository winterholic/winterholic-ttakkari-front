export interface Point { x: number; y: number }
export interface View extends Point { scale: number }
export type InputMode = 'trackpad' | 'touch' | 'move';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function pointInDesktop(x: number, y: number, view: View, width: number, height: number): Point {
  return { x: Math.round(clamp((x - view.x) / view.scale, 0, width - 1)), y: Math.round(clamp((y - view.y) / view.scale, 0, height - 1)) };
}
export function zoomAt(view: View, scale: number, x: number, y: number): View {
  scale = clamp(scale, .15, 3);
  return { scale, x: x - (x - view.x) * scale / view.scale, y: y - (y - view.y) * scale / view.scale };
}
export function pointerPacket(x: number, y: number, buttons: number): Uint8Array<ArrayBuffer> {
  x = Math.round(x); y = Math.round(y);
  return new Uint8Array([5, buttons, x >> 8, x & 255, y >> 8, y & 255]);
}
export function textKeysyms(text: string): number[] {
  return Array.from(text, c => c === '\n' ? 0xff0d : c === '\t' ? 0xff09 : c.codePointAt(0)! <= 255 ? c.codePointAt(0)! : 0x1000000 | c.codePointAt(0)!);
}

interface InputCallbacks {
  pointer: (x: number, y: number, buttons: number) => void;
  pan: (dx: number, dy: number) => void;
  zoom: (factor: number, x: number, y: number) => void;
}
export class TouchInput {
  mode: InputMode = 'trackpad';
  view: View = { x: 0, y: 0, scale: 1 };
  width = 1920;
  height = 1080;
  cursor: Point = { x: 0, y: 0 };
  private points = new Map<number, Point>();
  private start: Point = { x: 0, y: 0 };
  private moved = false;
  private multi = false;
  private held = false;
  private timer?: ReturnType<typeof setTimeout>;
  private wheel = 0;
  private gesture: 'scroll' | 'zoom' | null = null;
  private initialDistance = 0;
  private initialCenter: Point = { x: 0, y: 0 };
  constructor(private cb: InputCallbacks) {}
  private emit(mask: number) { this.cb.pointer(this.cursor.x, this.cursor.y, mask); }
  click(mask = 1) { this.emit(mask); this.emit(0); }
  down(id: number, x: number, y: number) {
    if (this.points.size >= 2) return;
    this.points.set(id, { x, y });
    clearTimeout(this.timer);
    if (this.points.size === 1) {
      this.start = { x, y }; this.moved = false; this.multi = false;
      if (this.mode === 'touch') this.cursor = pointInDesktop(x, y, this.view, this.width, this.height);
      if (this.mode !== 'move') this.timer = setTimeout(() => { this.held = true; this.emit(1); }, 420);
    } else {
      if (this.held) { this.held = false; this.emit(0); }
      this.multi = true; this.gesture = null; this.wheel = 0;
      const [a, b] = [...this.points.values()];
      this.initialDistance = Math.hypot(a.x - b.x, a.y - b.y);
      this.initialCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  move(id: number, x: number, y: number) {
    const old = this.points.get(id);
    if (!old) return;
    this.points.set(id, { x, y });
    const dx = x - old.x, dy = y - old.y;
    if (Math.hypot(x - this.start.x, y - this.start.y) > 5) { this.moved = true; clearTimeout(this.timer); }
    if (this.points.size === 2) {
      const [a, b] = [...this.points.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (!this.gesture) {
        if (Math.abs(distance - this.initialDistance) > 18) this.gesture = 'zoom';
        else if (Math.abs(center.y - this.initialCenter.y) > 8) this.gesture = 'scroll';
      }
      if (this.gesture === 'zoom') {
        this.cb.zoom(distance / Math.max(this.initialDistance, 1), center.x, center.y);
        this.initialDistance = distance;
      } else if (this.gesture === 'scroll') {
        this.wheel += dy;
        while (Math.abs(this.wheel) >= 16) {
          const sign = Math.sign(this.wheel);
          this.click(sign > 0 ? 8 : 16); this.wheel -= sign * 16;
        }
      }
      return;
    }
    if (this.multi) return;
    if (this.mode === 'move' || (this.mode === 'touch' && !this.held)) this.cb.pan(dx, dy);
    else {
      this.cursor = this.mode === 'touch' ? pointInDesktop(x, y, this.view, this.width, this.height) : {
        x: clamp(this.cursor.x + dx * 1.5 / this.view.scale, 0, this.width - 1),
        y: clamp(this.cursor.y + dy * 1.5 / this.view.scale, 0, this.height - 1),
      };
      this.emit(this.held ? 1 : 0);
    }
  }
  up(id: number) {
    if (!this.points.has(id)) return;
    clearTimeout(this.timer);
    this.points.delete(id);
    if (this.held) { this.held = false; this.emit(0); }
    else if (!this.moved && !this.multi && this.mode !== 'move') this.click();
  }
  cancel() {
    clearTimeout(this.timer);
    if (this.held) this.emit(0);
    this.held = false; this.points.clear(); this.multi = false;
  }
}
