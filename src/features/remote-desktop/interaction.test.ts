import { describe, expect, it, vi } from 'vitest';
import { pointInDesktop, zoomAt, pointerPacket, TouchInput, textKeysyms } from './interaction';

describe('remote desktop input', () => {
  it('maps zoomed touch coordinates and clamps to desktop edges', () => {
    expect(pointInDesktop(100, 150, { x: -100, y: -50, scale: 2 }, 1920, 1080)).toEqual({ x: 100, y: 100 });
    expect(pointInDesktop(-100, 9999, { x: 0, y: 0, scale: 1 }, 1920, 1080)).toEqual({ x: 0, y: 1079 });
  });
  it('keeps the point under the fingers stationary when zooming', () => {
    const before = { x: -100, y: -50, scale: 1 };
    const after = zoomAt(before, 2, 50, 70);
    expect(pointInDesktop(50, 70, before, 2000, 2000)).toEqual(pointInDesktop(50, 70, after, 2000, 2000));
  });
  it('encodes RFB pointer messages in network order', () => {
    expect([...pointerPacket(1025, 513, 1)]).toEqual([5, 1, 4, 1, 2, 1]);
  });
  it('sends Korean as complete Unicode keysyms without surrogate splitting', () => {
    expect(textKeysyms('가A😀\n')).toEqual([0x100ac00, 65, 0x101f600, 0xff0d]);
  });
  it('clicks on tap, moves a trackpad cursor, and releases drag on cancellation', () => {
    vi.useFakeTimers();
    const pointer = vi.fn(), pan = vi.fn(), zoom = vi.fn();
    const input = new TouchInput({ pointer, pan, zoom });
    input.down(1, 10, 10); input.up(1);
    expect(pointer.mock.calls.map(c => c[2])).toEqual([1, 0]);
    pointer.mockClear();
    input.down(1, 10, 10); input.move(1, 20, 10);
    expect(input.cursor.x).toBeGreaterThan(0);
    input.up(1);
    expect(pointer.mock.calls.every(c => c[2] === 0)).toBe(true);
    pointer.mockClear();
    input.down(1, 20, 10); vi.advanceTimersByTime(450); input.cancel();
    expect(pointer.mock.calls.map(c => c[2])).toEqual([1, 0]);
    vi.useRealTimers();
  });
  it('two fingers scroll without accidental click and pinch zooms locally', () => {
    const pointer = vi.fn(), pan = vi.fn(), zoom = vi.fn();
    const input = new TouchInput({ pointer, pan, zoom });
    input.down(1, 20, 20); input.down(2, 80, 20);
    input.move(1, 20, 45); input.move(2, 80, 45);
    input.up(1); input.up(2);
    expect(pointer.mock.calls.some(c => c[2] === 8 || c[2] === 16)).toBe(true);
    expect(pointer.mock.calls.some(c => c[2] === 1)).toBe(false);
    input.down(1, 20, 20); input.down(2, 80, 20);
    input.move(2, 120, 20);
    expect(zoom).toHaveBeenCalled();
    input.cancel();
  });
});
