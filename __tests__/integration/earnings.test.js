import { describe, it, expect } from '@jest/globals';
import { PAPER_RATES, collectEarnings } from '../../core/earnings.js';

describe('node earnings ledger (E5)', () => {
  it('reports all-0 earnings for a core with no role activity', () => {
    const earnings = collectEarnings({});
    expect(earnings.currency).toBe('paper');
    expect(earnings.total_earned).toBe(0);
    for (const role of Object.keys(PAPER_RATES)) {
      expect(earnings.by_role[role]).toEqual({ units: 0, rate: PAPER_RATES[role], earned: 0 });
    }
  });

  it('reads validate earnings from core.validationsCompleted (E1)', () => {
    const earnings = collectEarnings({ validationsCompleted: 4 });
    expect(earnings.by_role.validate).toEqual({ units: 4, rate: PAPER_RATES.validate, earned: 4 * PAPER_RATES.validate });
  });

  it('reads storage earnings from core.xsc.shardsStored (E2)', () => {
    const earnings = collectEarnings({ xsc: { shardsStored: 7 } });
    expect(earnings.by_role.storage).toEqual({ units: 7, rate: PAPER_RATES.storage, earned: 7 * PAPER_RATES.storage });
  });

  it('reads compute earnings from core.computeNode.computeJobsRun (E3)', () => {
    const earnings = collectEarnings({ computeNode: { computeJobsRun: 3 } });
    expect(earnings.by_role.compute).toEqual({ units: 3, rate: PAPER_RATES.compute, earned: 3 * PAPER_RATES.compute });
  });

  it('lead stays honestly 0 — no core.leadBatchesSealed exists yet (E4 not implemented)', () => {
    const earnings = collectEarnings({ validationsCompleted: 100 });
    expect(earnings.by_role.lead).toEqual({ units: 0, rate: PAPER_RATES.lead, earned: 0 });
  });

  it('aggregates all three implemented roles into total_earned', () => {
    const core = {
      validationsCompleted: 2,
      xsc: { shardsStored: 5 },
      computeNode: { computeJobsRun: 1 },
    };
    const earnings = collectEarnings(core);
    const expectedTotal = 2 * PAPER_RATES.validate + 5 * PAPER_RATES.storage + 1 * PAPER_RATES.compute;
    expect(earnings.total_earned).toBe(expectedTotal);
  });

  it('never throws when core, core.xsc, or core.computeNode is missing/null', () => {
    expect(() => collectEarnings(undefined)).not.toThrow();
    expect(() => collectEarnings(null)).not.toThrow();
    expect(() => collectEarnings({ xsc: null, computeNode: null })).not.toThrow();
  });
});
