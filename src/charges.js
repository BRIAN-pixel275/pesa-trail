// How much M-PESA charged you: total fees, how many transactions carried one,
// their share of money out, and who the costliest payees are.
export function chargeSummary(transactions, topCount = 3) {
  let total = 0;
  let count = 0;
  let spent = 0;
  const byParty = new Map();

  for (const transaction of transactions) {
    if (transaction.type !== 'out') continue;
    const fee = Number(transaction.fee) || 0;
    spent += (Number(transaction.amt) || 0) + fee;
    if (fee <= 0) continue;
    total += fee;
    count += 1;
    const party = transaction.party || 'Unknown';
    const entry = byParty.get(party) || { party, fee: 0, count: 0 };
    entry.fee += fee;
    entry.count += 1;
    byParty.set(party, entry);
  }

  const top = [...byParty.values()].sort((a, b) => b.fee - a.fee).slice(0, topCount);
  return { total, count, share: spent ? total / spent : 0, top };
}