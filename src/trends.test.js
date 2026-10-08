import { describe, expect, it } from 'vitest';
import { monthlySpending } from './trends.js';

describe('monthlySpending', () => {
  it('returns six calendar months and includes allocated fees in source totals', () => {
    const transactions = [
      {
        type: 'out',
        date: new Date(2026, 7, 3).getTime(),
        amt: 100,
        fee: 5,
        allocations: [
          { source: 'Parents', amount: 60 },
          { source: 'Small hustle', amount: 45 },
        ],
      },
      { type: 'in', date: new Date(2026, 7, 5).getTime(), amt: 500, src: 'Parents' },
      { type: 'out', date: new Date(2026, 2, 1).getTime(), amt: 20, src: 'Parents' },
    ];
    const now = new Date(2026, 9, 8);
    const months = monthlySpending(transactions, 'Parents', now);
    const hustleMonths = monthlySpending(transactions, 'Small hustle', now);

    expect(months).toHaveLength(6);
    expect(months.map(({ label }) => label)).toEqual(['May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct']);
    expect(months[3].amount).toBe(60);
    expect(hustleMonths[3].amount).toBe(45);
    expect(months[4].amount).toBe(0);
  });

  it('uses expense amount plus fee for legacy single-source transactions', () => {
    const months = monthlySpending([
      { type: 'out', date: new Date(2026, 9, 3).getTime(), amt: 80, fee: 5, src: 'Parents' },
    ], 'Parents', new Date(2026, 9, 8));

    expect(months[5].amount).toBe(85);
  });
});
