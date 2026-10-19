import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acceleration, fitScale, joystickSpeed, pointInDesktop, pointerPacket, TouchInput, textKeysyms, zoomAt } from './interaction';

function setup(mode: 'trackpad' | 'touch' | 'move' = 'trackpad') {
  const pointer = vi.fn(), pan = vi.fn(), zoom = vi.fn();
  const input = new TouchInput({ pointer, pan, zoom });
  input.mode = mode; input.cursor = { x: 500, y: 500 };
  const masks = () => pointer.mock.calls.map(c => c[2]);
  return { input, pointer, pan, zoom, masks };
}

describe('coordinates', () => {
  it('maps zoomed touch coordinates and clamps to desktop edges', () => {
    expect(pointInDesktop(100, 150, { x: -100, y: -50, scale: 2 }, 1920, 1080)).toEqual({ x: 100, y: 100 });
    expect(pointInDesktop(-100, 9999, { x: 0, y: 0, scale: 1 }, 1920, 1080)).toEqual({ x: 0, y: 1079 });
  });
  it('keeps the point under the fingers stationary when zooming', () => {
    const before = { x: -100, y: -50, scale: 1 };
    const after = zoomAt(before, 2, 50, 70);
    expect(pointInDesktop(50, 70, before, 2000, 2000)).toEqual(pointInDesktop(50, 70, after, 2000, 2000));
  });
  it('limits zoom to the given range', () => {
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, 10, 0, 0, .1, 4).scale).toBe(4);
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, .001, 0, 0, .1, 4).scale).toBe(.1);
  });
  it('fits the whole desktop without enlarging a small one', () => {
    expect(fitScale(390, 844, 5120, 2880)).toBeCloseTo(390 / 5120);
    expect(fitScale(844, 390, 1920, 1080)).toBeCloseTo(390 / 1080);
    expect(fitScale(1920, 1080, 800, 600)).toBe(1);
  });
});

describe('wire format', () => {
  it('encodes RFB pointer messages in network order', () => {
    expect([...pointerPacket(1025, 513, 1)]).toEqual([5, 1, 4, 1, 2, 1]);
  });
  it('sends Korean as complete Unicode keysyms without surrogate splitting', () => {
    expect(textKeysyms('가A😀\n')).toEqual([0x100ac00, 65, 0x101f600, 0xff0d]);
  });
});

describe('response curves', () => {
  it('speeds the pointer up with finger speed and never goes below a precise minimum', () => {
    expect(acceleration(0)).toBeLessThan(1);
    expect(acceleration(1)).toBeGreaterThan(acceleration(.3));
    expect(acceleration(100)).toBeLessThanOrEqual(3.2);
  });
  it('ignores a resting joystick and ramps smoothly to full speed', () => {
    expect(joystickSpeed(.05)).toBe(0);
    expect(joystickSpeed(.5)).toBeGreaterThan(0);
    expect(joystickSpeed(1)).toBeGreaterThan(joystickSpeed(.5) * 2);
    expect(joystickSpeed(1, 2)).toBeCloseTo(joystickSpeed(1) * 2);
  });
});

describe('trackpad gestures', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a tap clicks at the cursor without moving it', () => {
    const { input, masks } = setup();
    input.down(1, 100, 100, 0); input.move(1, 103, 102, 16); input.up(1, 90);
    expect(masks()).toEqual([1, 0]);
    expect(input.cursor).toEqual({ x: 500, y: 500 });
  });
  it('a stroke moves the cursor relative to the finger and does not click', () => {
    const { input, masks } = setup();
    input.view = { x: 0, y: 0, scale: 1 };
    input.down(1, 100, 100, 0); input.move(1, 140, 100, 16); input.move(1, 180, 100, 32); input.up(1, 48);
    expect(input.cursor.x).toBeGreaterThan(500);
    expect(input.cursor.y).toBe(500);
    expect(masks().every(m => m === 0)).toBe(true);
  });
  it('moves farther per finger pixel when the desktop is zoomed out', () => {
    const near = setup(), far = setup();
    near.input.view = { x: 0, y: 0, scale: 1 }; far.input.view = { x: 0, y: 0, scale: .25 };
    for (const t of [near, far]) { t.input.down(1, 0, 0, 0); t.input.move(1, 40, 0, 16); t.input.move(1, 80, 0, 32); }
    expect(far.input.cursor.x - 500).toBeCloseTo((near.input.cursor.x - 500) * 4, 0);
  });
  it('double tap sends two clicks at the same place', () => {
    const { input, masks } = setup();
    input.down(1, 50, 50, 0); input.up(1, 60);
    input.down(1, 52, 50, 150); input.up(1, 190);
    expect(masks()).toEqual([1, 0, 1, 0]);
  });
  it('tap then press and drag holds the left button until release', () => {
    const { input, masks } = setup();
    input.down(1, 50, 50, 0); input.up(1, 60);
    input.down(1, 50, 50, 150); input.move(1, 80, 50, 166); input.move(1, 120, 50, 182);
    expect(masks().slice(2)[0]).toBe(1);
    expect(masks().at(-1)).toBe(1);
    input.up(1, 200);
    expect(masks().at(-1)).toBe(0);
  });
  it('long press holds the button while the finger moves, then releases on lift', () => {
    const { input, masks } = setup();
    input.down(1, 20, 10, 0); vi.advanceTimersByTime(450);
    expect(masks()).toEqual([1]);
    input.move(1, 60, 10, 470); input.move(1, 100, 10, 486);
    expect(masks().at(-1)).toBe(1);
    input.up(1, 500);
    expect(masks().at(-1)).toBe(0);
  });
  it('releases a drag when the gesture is cancelled', () => {
    const { input, masks } = setup();
    input.down(1, 20, 10, 0); vi.advanceTimersByTime(450); input.cancel();
    expect(masks()).toEqual([1, 0]);
  });
  it('a two-finger tap is a right click and never a left click', () => {
    const { input, masks } = setup();
    input.down(1, 20, 20, 0); input.down(2, 80, 20, 10);
    input.up(1, 90); input.up(2, 100);
    expect(masks()).toEqual([4, 0]);
  });
  it('two fingers dragging down scrolls up by wheel steps without clicking', () => {
    const { input, masks } = setup();
    input.down(1, 20, 20, 0); input.down(2, 80, 20, 0);
    input.move(1, 20, 60, 16); input.move(2, 80, 60, 16);
    input.move(1, 20, 100, 32); input.move(2, 80, 100, 32);
    input.up(1, 50); input.up(2, 50);
    expect(masks()).toContain(8);
    expect(masks().some(m => m === 1 || m === 4)).toBe(false);
  });
  it('scroll direction and horizontal scrolling follow the config', () => {
    const { input, masks } = setup();
    input.config.scrollReverse = true;
    input.down(1, 20, 20, 0); input.down(2, 80, 20, 0);
    input.move(1, 20, 80, 16); input.move(2, 80, 80, 16);
    expect(masks()).toContain(16);
    const second = setup();
    second.input.down(1, 20, 20, 0); second.input.down(2, 80, 20, 0);
    for (let i = 1; i <= 6; i++) { second.input.move(1, 20 + 10 * i, 20, 16 * i); second.input.move(2, 80 + 10 * i, 20, 16 * i); }
    expect(second.masks()).toContain(32);
  });
  it('pinching zooms around the fingers and moves with their center', () => {
    const { input, zoom, pan } = setup();
    input.down(1, 20, 20, 0); input.down(2, 80, 20, 0);
    input.move(2, 140, 20, 16);
    expect(zoom).toHaveBeenCalled();
    expect(zoom.mock.calls[0][0]).toBeGreaterThan(1);
    expect(pan).toHaveBeenCalled();
    input.cancel();
  });
  it('keeps the left button held by an external control through taps and releases it on demand', () => {
    const { input, masks } = setup();
    input.external = 1; input.sync();
    input.down(1, 10, 10, 0); input.up(1, 50);
    expect(masks()).toEqual([1, 1, 1]);
    input.external = 0; input.sync();
    expect(masks().at(-1)).toBe(0);
  });
  it('nudges the cursor by screen pixels, scaled to the desktop, and stays inside it', () => {
    const { input, masks } = setup();
    input.view = { x: 0, y: 0, scale: .5 };
    input.nudge(10, -5);
    expect(input.cursor).toEqual({ x: 520, y: 490 });
    input.nudge(-1e6, 1e6);
    expect(input.cursor).toEqual({ x: 0, y: 1079 });
    expect(masks()).toEqual([0, 0]);
  });
});

describe('direct touch gestures', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it('a tap clicks exactly where the finger landed', () => {
    const { input, pointer } = setup('touch');
    input.view = { x: -100, y: 0, scale: 2 };
    input.down(1, 300, 200, 0); input.up(1, 50);
    expect(pointer.mock.calls[0]).toEqual([200, 100, 1]);
  });
  it('dragging pans the view instead of the cursor', () => {
    const { input, pan, masks } = setup('touch');
    input.down(1, 100, 100, 0); input.move(1, 130, 100, 16); input.move(1, 160, 100, 32);
    expect(pan).toHaveBeenCalled();
    input.up(1, 60);
    expect(masks()).toEqual([]);
  });
  it('long press then drag moves the pointer under the finger with the button held', () => {
    const { input, pointer } = setup('touch');
    input.down(1, 100, 100, 0); vi.advanceTimersByTime(450);
    input.move(1, 160, 140, 480);
    expect(pointer.mock.calls.at(-1)).toEqual([160, 140, 1]);
    input.up(1, 500);
  });
});

describe('view move mode', () => {
  it('only pans and never clicks', () => {
    const { input, pan, pointer } = setup('move');
    input.down(1, 10, 10, 0); input.move(1, 40, 10, 16); input.up(1, 30);
    input.down(1, 10, 10, 100); input.up(1, 120);
    expect(pan).toHaveBeenCalled();
    expect(pointer).not.toHaveBeenCalled();
  });
});
