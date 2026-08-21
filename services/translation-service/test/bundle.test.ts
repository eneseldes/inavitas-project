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
    // Boş string bir eksiklik değil, kasıtlı bir çeviri: bu anahtar Türkçede
    // "ile yönetin", İngilizcede boştur. Boşu "çevrilmemiş" sayıp varsayılana düşmek
    // İngilizce giriş ekranına Türkçe metin sızdırıyordu.
    const defaultMap = { 'auth.hero.titleAfter': 'ile yönetin' };
    const requestedMap = { 'auth.hero.titleAfter': '' };

    const result = buildBundle(defaultMap, requestedMap);

    expect(result).toEqual({ 'auth.hero.titleAfter': '' });
  });

  it('hiç çevrilmemiş anahtar varsayılandan gelir — ayrım BOŞLUK değil, YOKLUK', () => {
    // "Hiç çevrilmedi" bilgisini `published_value IS NULL` taşır ve o satır repository'de
    // elendiği için anahtar `requestedMap`'e HİÇ girmez. Fallback'i tetikleyen budur.
    const defaultMap = { 'auth.hero.titleAfter': 'ile yönetin', 'app.title': 'Başlık' };
    const requestedMap = { 'app.title': 'Title' };

    const result = buildBundle(defaultMap, requestedMap);

    expect(result).toEqual({ 'auth.hero.titleAfter': 'ile yönetin', 'app.title': 'Title' });
  });
});
