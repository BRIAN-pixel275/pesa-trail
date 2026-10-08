export function monthlySpending(transactions, source, now = new Date(), monthCount = 6) {
  const firstMonth = new Date(now.getFullYear(), now.getMonth() - monthCount + 1, 1);
  const months = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      label: new Intl.DateTimeFormat('en-KE', { month: 'short' }).format(date),
      amount: 0,
    };
  });
  const monthIndex = new Map(months.map((month, index) => [`${month.year}-${month.month}`, index]));

  for (const transaction of transactions) {
    if (transaction.type !== 'out') continue;
    const date = new Date(transaction.date);
    const index = monthIndex.get(`${date.getFullYear()}-${date.getMonth()}`);
    if (index === undefined) continue;

    const allocations = transaction.allocations?.length
      ? transaction.allocations
      : transaction.src
        ? [{ source: transaction.src, amount: transaction.amt + (Number(transaction.fee) || 0) }]
        : [];
    const amount = allocations
      .filter((allocation) => allocation.source === source)
      .reduce((sum, allocation) => sum + (Number(allocation.amount) || 0), 0);
    months[index].amount += amount;
  }

  return months;
}
