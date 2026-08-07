import { describe, expect, it } from 'vitest';
import { canTransition, WORK_ORDER_STATUSES, type WorkOrderStatus } from '../src/domain/state-machine.ts';

describe('canTransition (work order)', () => {
  it('STARTED → ASSIGNED izinli', () => {
    expect(canTransition('STARTED', 'ASSIGNED')).toBe(true);
  });

  it('STARTED → IN_PROGRESS izinsiz (ASSIGNED atlanamaz)', () => {
    expect(canTransition('STARTED', 'IN_PROGRESS')).toBe(false);
  });

  it('sıralı zincir baştan sona izinli', () => {
    expect(canTransition('ASSIGNED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'ENERGIZED')).toBe(true);
    expect(canTransition('ENERGIZED', 'DONE')).toBe(true);
  });

  it.each(['STARTED', 'ASSIGNED', 'IN_PROGRESS', 'ENERGIZED', 'DONE'] as WorkOrderStatus[])(
    '%s → CANCELLED her zaman izinli',
    (from) => {
      expect(canTransition(from, 'CANCELLED')).toBe(true);
    },
  );

  it('CANCELLED terminal durumdur — hiçbir yere geçilemez', () => {
    for (const to of WORK_ORDER_STATUSES) {
      expect(canTransition('CANCELLED', to)).toBe(false);
    }
  });

  it('aynı duruma "geçiş" izinsiz sayılır', () => {
    for (const status of WORK_ORDER_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('DONE → ASSIGNED (geri geçiş) izinsiz', () => {
    expect(canTransition('DONE', 'ASSIGNED')).toBe(false);
  });
});
