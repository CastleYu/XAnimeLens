import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bangumi } from '../src/api/bangumi';
import { Chars } from '../src/core/chars';
import type { BgmChar } from '../src/shared/types';

// 实测数据：SAKAMOTO DAYS（Bangumi 496617）的角色列表与“坂本”搜索结果
const list: BgmChar[] = [
  { id: 130748, name: '坂本太郎', images: { grid: 'g1' } },
  { id: 130752, name: '坂本葵', images: { grid: 'g2' } },
];
const detail: BgmChar = { id: 130752, name: '坂本葵', images: { grid: 'g2' }, infobox: [{ key: '简体中文名', value: '坂本葵' }] };

beforeEach(() => Chars.lists.clear());
afterEach(() => vi.restoreAllMocks());

describe('Chars.find', () => {
  it('优先在作品角色列表中按原名精确匹配，并补拉详情', async () => {
    const chars = vi.spyOn(Bangumi, 'chars').mockResolvedValue(list);
    const search = vi.spyOn(Bangumi, 'searchChar');
    vi.spyOn(Bangumi, 'char').mockResolvedValue(detail);
    const c = await Chars.find('坂本葵', 496617, '');
    expect(c?.id).toBe(130752);
    expect(Chars.cn(c!)).toBe('坂本葵');
    expect(chars).toHaveBeenCalledWith(496617, '');
    expect(search).not.toHaveBeenCalled();
  });

  it('同一作品的角色列表只请求一次', async () => {
    const chars = vi.spyOn(Bangumi, 'chars').mockResolvedValue(list);
    vi.spyOn(Bangumi, 'char').mockImplementation(async (id) => list.find((c) => c.id === id)!);
    await Promise.all([Chars.find('坂本葵', 496617, ''), Chars.find('坂本太郎', 496617, '')]);
    expect(chars).toHaveBeenCalledTimes(1);
  });

  it('列表里没有时全站搜索，只接受名字完全相同的结果', async () => {
    vi.spyOn(Bangumi, 'chars').mockResolvedValue([]);
    vi.spyOn(Bangumi, 'searchChar').mockResolvedValue([
      { id: 1718, name: '坂本' },
      { id: 31219, name: '坂本' },
    ]);
    expect(await Chars.find('坂本葵', 496617, '')).toBeNull();
  });

  it('无作品 ID 时直接搜索；详情失败时沿用搜索结果', async () => {
    const chars = vi.spyOn(Bangumi, 'chars');
    vi.spyOn(Bangumi, 'searchChar').mockResolvedValue([{ id: 130752, name: '坂本葵', images: { grid: 'g2' } }]);
    vi.spyOn(Bangumi, 'char').mockRejectedValue(new Error('HTTP 500'));
    const c = await Chars.find('坂本葵', null, '');
    expect(chars).not.toHaveBeenCalled();
    expect(c?.id).toBe(130752);
    expect(Chars.img(c!)).toBe('g2');
    expect(Chars.cn(c!)).toBe('');
  });
});
