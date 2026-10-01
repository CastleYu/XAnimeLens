import { describe, expect, it } from 'vitest';
import { Capture } from '../src/content/capture';

describe('Capture.box', () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };

  it('按比例缩放 rect', () => {
    expect(Capture.box(rect, 2, 1000, 800)).toEqual({ x: 200, y: 100, w: 400, h: 200 });
  });

  it('与图片边界取交集（右下越界）', () => {
    expect(Capture.box(rect, 2, 300, 400)).toEqual({ x: 200, y: 100, w: 100, h: 200 });
  });

  it('与图片边界取交集（左上越界）', () => {
    expect(Capture.box({ left: -50, top: -20, width: 100, height: 60 }, 1, 500, 500)).toEqual({
      x: 0,
      y: 0,
      w: 50,
      h: 40,
    });
  });

  it('完全在图片外返回零矩形', () => {
    expect(Capture.box({ left: 600, top: 10, width: 50, height: 50 }, 1, 500, 500)).toEqual({
      x: 500,
      y: 10,
      w: 0,
      h: 50,
    });
  });
});

describe('Capture.scale', () => {
  it('不放大', () => {
    expect(Capture.scale(320, 240, 1280)).toEqual({ w: 320, h: 240 });
  });

  it('等比缩到最长边', () => {
    expect(Capture.scale(2560, 1440, 1280)).toEqual({ w: 1280, h: 720 });
  });
});
