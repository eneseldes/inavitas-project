import { describe, expect, it } from 'vitest';
import { interpolate } from '../src/features/i18n/interpolate.ts';

describe('interpolate', () => {
  it('{param} değişkenlerini verilen değerlerle değiştirir', () => {
    const template = 'Merhaba {name}, {count} adet kesinti var.';
    const result = interpolate(template, { name: 'Ahmet', count: 3 });
    expect(result).toBe('Merhaba Ahmet, 3 adet kesinti var.');
  });

  it('parametre verilmezse şablonu aynen döner', () => {
    const template = 'Kesinti Detayı';
    expect(interpolate(template)).toBe('Kesinti Detayı');
  });

  it('regex metakarakteri içeren parametre adlarını güvenle işler', () => {
    const template = 'Değer: {user.name}';
    const result = interpolate(template, { 'user.name': 'Can' });
    expect(result).toBe('Değer: Can');
  });
});
