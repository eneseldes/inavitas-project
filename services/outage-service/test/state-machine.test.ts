import { describe, expect, it } from 'vitest';
import { canTransition, OUTAGE_STATUSES, type OutageStatus } from '../src/domain/state-machine.ts';

describe('canTransition (outage)', () => {
  it('STARTED → ENERGIZED izinli', () => {
    expect(canTransition('STARTED', 'ENERGIZED')).toBe(true);
  });

  it('STARTED → ARCHIVED izinsiz (ENERGIZED atlanamaz)', () => {
    expect(canTransition('STARTED', 'ARCHIVED')).toBe(false);
  });

  it('ENERGIZED → ARCHIVED izinli', () => {
    expect(canTransition('ENERGIZED', 'ARCHIVED')).toBe(true);
  });

  it('ENERGIZED → CANCELLED izinsiz (yalnızca ARCHIVED geçilebilir)', () => {
    expect(canTransition('ENERGIZED', 'CANCELLED')).toBe(false);
  });

  it('STARTED → CANCELLED izinli', () => {
    expect(canTransition('STARTED', 'CANCELLED')).toBe(true);
  });

  it('ARCHIVED terminal durumdur — hiçbir yere geçilemez (CANCELLED dahil)', () => {
    for (const to of OUTAGE_STATUSES) {
      expect(canTransition('ARCHIVED', to)).toBe(false);
    }
  });

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
