import { describe, expect, it } from 'vitest';
import { canTransition, OUTAGE_STATUSES, type OutageStatus } from '../src/domain/state-machine.ts';

describe('canTransition (outage) — SRS 1.6', () => {
  it('STARTED → ENERGIZED izinli', () => {
    expect(canTransition('STARTED', 'ENERGIZED')).toBe(true);
  });

  it('STARTED → ARCHIVED izinsiz (ENERGIZED atlanamaz)', () => {
    expect(canTransition('STARTED', 'ARCHIVED')).toBe(false);
  });

  it('ENERGIZED → ARCHIVED izinli', () => {
    expect(canTransition('ENERGIZED', 'ARCHIVED')).toBe(true);
  });

  it.each(['STARTED', 'ENERGIZED', 'ARCHIVED'] as OutageStatus[])(
    '%s → CANCELLED her zaman izinli',
    (from) => {
      expect(canTransition(from, 'CANCELLED')).toBe(true);
    },
  );

  it('CANCELLED terminal durumdur — hiçbir yere geçilemez', () => {
    for (const to of OUTAGE_STATUSES) {
      expect(canTransition('CANCELLED', to)).toBe(false);
    }
  });

  it('aynı duruma "geçiş" izinsiz sayılır (no-op bir transition değildir)', () => {
    for (const status of OUTAGE_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('ARCHIVED → ENERGIZED (geri geçiş) izinsiz', () => {
    expect(canTransition('ARCHIVED', 'ENERGIZED')).toBe(false);
  });
});
