import { describe, expect, it } from 'vitest';
import { toProviderLocale } from '../src/domain/locale-mapping.ts';

describe('toProviderLocale', () => {
  it('bilinen locale kodlarını sağlayıcı formatına çevirir', () => {
    expect(toProviderLocale('tr-TR')).toBe('TR');
    expect(toProviderLocale('en-US')).toBe('EN-US');
    expect(toProviderLocale('de-DE')).toBe('DE');
  });

  it('eşlenemeyen locale için undefined döner', () => {
    expect(toProviderLocale('fr-FR')).toBeUndefined();
  });
});
