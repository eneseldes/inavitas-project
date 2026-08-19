import { describe, expect, it } from 'vitest';
import {
  canLinkParent,
  computeCustomerMinutes,
  MAX_CASCADE_DEPTH,
  type CascadeNode,
} from '../src/domain/cascade.ts';

/** Zincir taraması için düğüm haritası kurar: `a → b` = a'nın ebeveyni b'dir. */
function nodes(...pairs: [string, string | null][]): Map<string, CascadeNode> {
  return new Map(pairs.map(([id, parentOutageId]) => [id, { id, parentOutageId }]));
}

describe('canLinkParent — kaskad döngü koruması', () => {
  it('bağımsız iki kesinti arasında bağ kurulabilir', () => {
    expect(canLinkParent('child', 'parent', nodes()).allowed).toBe(true);
  });

  it('kesinti kendi kendisinin üstü olamaz', () => {
    const result = canLinkParent('a', 'a', nodes());
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('self_reference');
  });

  it('doğrudan geri bağ (a→b iken b→a) reddedilir', () => {
    // b'nin ebeveyni zaten a; şimdi a'yı b'nin altına almak döngü yaratır.
    const result = canLinkParent('a', 'b', nodes(['b', 'a']));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('cycle');
  });

  it('dolaylı geri bağ (a→b→c iken c→a) reddedilir', () => {
    const result = canLinkParent('a', 'c', nodes(['c', 'b'], ['b', 'a']));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('cycle');
  });

  it('derin ama döngüsüz zincire bağ kurulabilir', () => {
    const chain: [string, string | null][] = [];
    for (let i = 1; i < MAX_CASCADE_DEPTH - 1; i++) chain.push([`n${i}`, `n${i + 1}`]);
    chain.push([`n${MAX_CASCADE_DEPTH - 1}`, null]);

    expect(canLinkParent('yeni', 'n1', nodes(...chain)).allowed).toBe(true);
  });

  it('bozuk veride kendi üstüne kapanan zincir derinlik sınırında kesilir', () => {
    // Veritabanı kısıtları buna izin vermemeli; yine de tarama sonsuza dönmemeli.
    const result = canLinkParent('yeni', 'a', nodes(['a', 'b'], ['b', 'a']));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('max_depth');
  });
});

describe('computeCustomerMinutes — müşteri-dakika çift sayılmaz', () => {
  it('kapsanan kesintinin müşteri-dakikası sıfırdır', () => {
    expect(computeCustomerMinutes(500, 60, 'ust-kesinti')).toBe(0);
  });

  it('kapsamayan kesintide abone × süre hesaplanır', () => {
    expect(computeCustomerMinutes(500, 60, null)).toBe(30_000);
  });

  it('süre henüz bitmemişse hesap yapılamaz', () => {
    expect(computeCustomerMinutes(500, null, null)).toBeNull();
  });

  it('etki henüz hesaplanmadıysa hesap yapılamaz', () => {
    expect(computeCustomerMinutes(null, 60, null)).toBeNull();
  });
});
