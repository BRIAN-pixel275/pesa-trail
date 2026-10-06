import { describe, expect, it } from 'vitest';
import { transactionsToCsv } from './export.js';

describe('transactionsToCsv', () => {
  it('exports income and expenses with fees and per-source split allocations', () => {
    const csv = transactionsToCsv([
      {
        id: 'ABC1234567',
        date: new Date(2026, 9, 6, 9, 5).getTime(),
        type: 'in',
        amt: 5000,
        fee: 0,
        party: 'Mum',
        src: 'Parents',
      },
      {
        id: 'DEF1234567',
        date: new Date(2026, 9, 6, 10, 30).getTime(),
        type: 'out',
        amt: 700,
        fee: 10,
        party: 'Campus lunch',
        cat: 'Food',
        allocations: [
          { source: 'Parents', amount: 400 },
          { source: 'Small hustle', amount: 310 },
        ],
      },
    ]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Date","Transaction ID","Type","Description"');
    expect(csv).toContain('"Money in","Mum","","5000","0","5000","Parents","Parents: 5000"');
    expect(csv).toContain('"Money out","Campus lunch","Food","700","10","710","Parents, Small hustle","Parents: 400; Small hustle: 310"');
  });

  it('escapes quotes and prevents spreadsheet formula execution in text fields', () => {
    const csv = transactionsToCsv([
      {
        id: 'ID12345678',
        date: Date.now(),
        type: 'out',
        amt: 20,
        fee: 0,
        party: '=HYPERLINK("https://example.com")',
        cat: 'Food',
        allocations: [{ source: 'Parents', amount: 20 }],
      },
    ]);

    expect(csv).toContain(`"'=HYPERLINK(""https://example.com"")"`);
  });
});
