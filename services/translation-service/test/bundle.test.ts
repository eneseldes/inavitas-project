import { describe, expect, it } from 'vitest';
import { buildBundle } from '../src/domain/bundle.ts';

describe('buildBundle', () => {
  it('varsayılan ve istenen dil sözlüklerini doğru birleştirir', () => {
    const defaultMap = {
      'common.ok': 'Tamam',
      'common.cancel': 'İptal',
      'outage.status': 'Kesinti Başladı',
    };

    const requestedMap = {
      'common.ok': 'OK',
      'common.cancel': 'Cancel',
      // outage.status İngilizcede henüz çevrilmemiş
    };

    const result = buildBundle(defaultMap, requestedMap);

    expect(result).toEqual({
      'common.ok': 'OK',
      'common.cancel': 'Cancel',
      'outage.status': 'Kesinti Başladı', // fallback varsayılan dilden geldi
    });
  });

  it('istenen dil tamamen boşsa varsayılan dili döner', () => {
    const defaultMap = { 'app.title': 'Başlık' };
    const requestedMap = {};

    const result = buildBundle(defaultMap, requestedMap);

    expect(result).toEqual({ 'app.title': 'Başlık' });
  });

  it('yayınlanmış boş string değeri varsayılanın üzerine yazılır', () => {
    const defaultMap = { 'auth.hero.titleAfter': 'ile yönetin' };
    const requestedMap = { 'auth.hero.titleAfter': '' };

    const result = buildBundle(defaultMap, requestedMap);

    expect(result).toEqual({ 'auth.hero.titleAfter': '' });
  });
});
