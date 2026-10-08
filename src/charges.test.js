import { describe, expect, it } from 'vitest';
import { chargeSummary } from './charges.js';

describe('chargeSummary', () => {
  const list = [
    { type: 'out', amt: 1000, fee: 28, party: 'John' },
    { type: 'out', amt: 500, fee: 15, party: 'John' },
    { type: 'out', amt: 200, fee: 0, party: 'Naivas' },
    { type: 'out', amt: 300, fee: 7, party: 'Mama Mboga' },
    { type: 'in', amt: 5000, fee: 0, party: 'Mum' },
  ];

  it('totals fees on money out only and ranks the costliest payees', () => {
    const r = chargeSummary(list);
    expect(r.total).toBe(50);
    expect(r.count).toBe(3);
    expect(r.top[0]).toEqual({ party: 'John', fee: 43, count: 2 });
    expect(r.top).toHaveLength(2);
  });

  it('reports the share of money out (amount plus fees)', () => {
    expect(chargeSummary(list).share).toBeCloseTo(50 / 2050, 5);
  });

  it('handles an empty list', () => {
    expect(chargeSummary([])).toEqual({ total: 0, count: 0, share: 0, top: [] });
  });
});