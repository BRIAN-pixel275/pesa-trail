import { describe, it, expect } from 'vitest';
import { parseMessages, parseMessagesDetailed } from './Parser.js';

// FAKE messages. When testing real formats, remove names and phone numbers first.
const sample = `
UA11BCD222 Confirmed. Ksh5,000.00 received from JANE WANJIKU 0722***123 on 1/10/26 at 9:00 AM. New M-PESA balance is Ksh5,200.00.
UA22CDE333 Confirmed. Ksh350.00 sent to JOHN OTIENO 0712***456 on 2/10/26 at 1:15 PM. New M-PESA balance is Ksh4,850.00. Transaction cost, Ksh7.00.
UA33DEF444 Confirmed. Ksh200.00 paid to NAIVAS SUPERMARKET. on 3/10/26 at 6:40 PM. New M-PESA balance is Ksh4,650.00.
UA44EFG555 Confirmed.You bought Ksh50.00 of airtime on 4/10/26 at 8:05 AM.New M-PESA balance is Ksh4,600.00.
`;

describe('parseMessages', () => {
  const r = parseMessages(sample);
  it('finds all four', () => expect(r).toHaveLength(4));
  it('received', () => expect(r[0]).toMatchObject({ id: 'UA11BCD222', type: 'in', amt: 5000, party: 'Jane Wanjiku' }));
  it('sent with fee', () => expect(r[1]).toMatchObject({ type: 'out', amt: 350, fee: 7, party: 'John Otieno' }));
  it('paid to till', () => expect(r[2]).toMatchObject({ type: 'out', amt: 200, party: 'Naivas Supermarket' }));
  it('airtime', () => expect(r[3]).toMatchObject({ type: 'out', amt: 50, cat: 'Airtime & data' }));
  it('reads dates as d/m/yy', () => expect(new Date(r[0].date).getMonth()).toBe(9));
});

describe('parseMessagesDetailed', () => {
  const fuliza = 'UA55FGH666 Confirmed. Fuliza M-PESA amount is Ksh 300.00 on 5/10/26 at 7:10 PM. Interest charged Ksh 3.00.';
  const text = `${sample}\n${fuliza}`;
  const r = parseMessagesDetailed(text);

  it('still parses the recognized messages', () => expect(r.parsed).toHaveLength(4));
  it('hands back messages it cannot read instead of dropping them', () => {
    expect(r.unrecognized).toHaveLength(1);
    expect(r.unrecognized[0]).toMatchObject({ id: 'UA55FGH666', amt: 300, type: 'out' });
  });
  it('parseMessages keeps its old behaviour', () => expect(parseMessages(text)).toHaveLength(4));
});