function spreadsheetText(value) {
  const text = String(value ?? '');
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value, isText = false) {
  const safeValue = isText ? spreadsheetText(value) : String(value ?? '');
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function localTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function transactionAllocations(transaction) {
  if (transaction.type === 'in') {
    return transaction.src
      ? [{ source: transaction.src, amount: transaction.amt }]
      : [];
  }
  if (transaction.allocations?.length) return transaction.allocations;
  return transaction.src
    ? [{ source: transaction.src, amount: transaction.amt + (Number(transaction.fee) || 0) }]
    : [];
}

export function transactionsToCsv(transactions) {
  const headers = [
    'Date',
    'Transaction ID',
    'Type',
    'Description',
    'Category',
    'Amount (KSh)',
    'M-PESA fee (KSh)',
    'Total (KSh)',
    'Source(s)',
    'Source allocations',
  ];
  const rows = transactions.map((transaction) => {
    const fee = transaction.type === 'out' ? Number(transaction.fee) || 0 : 0;
    const allocations = transactionAllocations(transaction);
    const sources = [...new Set(allocations.map((allocation) => allocation.source).filter(Boolean))];
    const total = Number(transaction.amt) + fee;
    return [
      csvCell(localTimestamp(transaction.date)),
      csvCell(transaction.id, true),
      csvCell(transaction.type === 'in' ? 'Money in' : 'Money out', true),
      csvCell(transaction.party, true),
      csvCell(transaction.type === 'out' ? transaction.cat || '' : '', true),
      csvCell(Number(transaction.amt)),
      csvCell(fee),
      csvCell(total),
      csvCell(sources.join(', '), true),
      csvCell(allocations.map((allocation) => `${allocation.source}: ${Number(allocation.amount) || 0}`).join('; '), true),
    ];
  });

  return `\uFEFF${[headers.map((header) => csvCell(header)).join(','), ...rows.map((row) => row.join(','))].join('\r\n')}\r\n`;
}
