import { describe, expect, it } from 'vitest';
import { parseSort, toExclusiveUpperBound, toLimitOffset, toPageResult } from '../src/pagination.ts';

describe('toPageResult', () => {
  it('totalPages\'ı yukarı yuvarlar', () => {
    expect(toPageResult([1, 2, 3], 58, 1, 25).totalPages).toBe(3);
  });

  it('sonuç 0 olsa bile en az 1 sayfa gösterir', () => {
    expect(toPageResult([], 0, 1, 25).totalPages).toBe(1);
  });
});

describe('toLimitOffset', () => {
  it('sayfa 1 için offset 0 üretir', () => {
    expect(toLimitOffset({ page: 1, pageSize: 25 })).toEqual({ limit: 25, offset: 0 });
  });

  it('sayfa 3, pageSize 10 için offset 20 üretir', () => {
    expect(toLimitOffset({ page: 3, pageSize: 10 })).toEqual({ limit: 10, offset: 20 });
  });
});

describe('parseSort', () => {
  const fallback = { field: 'createdAt', dir: 'desc' } as const;

  it('geçerli alan+yön ayrıştırır', () => {
    expect(parseSort('startedAt:asc', ['createdAt', 'startedAt'], fallback)).toEqual({
      field: 'startedAt',
      dir: 'asc',
    });
  });

  it('bilinmeyen alanda fallback\'e döner', () => {
    expect(parseSort('password:asc', ['createdAt'], fallback)).toEqual(fallback);
  });

  it('sort verilmemişse fallback\'e döner', () => {
    expect(parseSort(undefined, ['createdAt'], fallback)).toEqual(fallback);
  });

  it('yön eksikse desc varsayar', () => {
    expect(parseSort('createdAt', ['createdAt'], fallback)).toEqual({ field: 'createdAt', dir: 'desc' });
  });
});

describe('toExclusiveUpperBound', () => {
  it('tarih-only değere bir gün ekler (roadmap Faz 2 tuzağı)', () => {
    const bound = toExclusiveUpperBound('2026-01-31');
    expect(bound.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('tam datetime\'ı olduğu gibi kullanır', () => {
    const bound = toExclusiveUpperBound('2026-01-31T10:00:00.000Z');
    expect(bound.toISOString()).toBe('2026-01-31T10:00:00.000Z');
  });
});
