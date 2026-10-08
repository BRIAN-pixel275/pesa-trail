import Dexie from 'dexie';

export const SRC = ['Parents', 'Small hustle', 'Other'];
export const CAT = [
  'Food',
  'Transport',
  'Airtime & data',
  'Rent',
  'School',
  'Fun',
  'Savings',
  'Cash out',
  'Other',
];

export const db = new Dexie('pesatrail');
db.version(1).stores({
  tx: 'id, date, type, src, cat, party',
  rules: 'party',
});
db.version(2).stores({
  tx: 'id, date, type, src, cat, party, [type+date]',
  rules: 'party',
  settings: 'key',
});

export async function getSources() {
  const saved = await db.settings.get('sources');
  return Array.isArray(saved?.value) && saved.value.length ? saved.value : SRC;
}

export async function saveSources(sources) {
  const cleaned = [...new Set(sources.map((source) => source.trim()).filter(Boolean))];
  if (!cleaned.length) throw new Error('Keep at least one money source.');
  await db.settings.put({ key: 'sources', value: cleaned });
  return cleaned;
}

export const needsLabel = (transaction) => {
  if (!transaction) return false;
  if (transaction.type === 'in') return !transaction.src;
  return !transaction.cat || !(transaction.allocations?.length || transaction.src);
};

function normalizedTransaction(transaction, defaultSource) {
  const value = { ...transaction };
  value.fee = Number(value.fee) || 0;
  value.amt = Number(value.amt);

  if (value.type === 'in') {
    value.src ||= defaultSource;
    value.allocations = [];
  } else {
    value.cat ||= 'Other';
    value.allocations = value.allocations?.length
      ? value.allocations.map((allocation) => ({
          source: allocation.source || allocation.src || defaultSource,
          amount: Number(allocation.amount) || 0,
        }))
      : [{ source: value.src || defaultSource, amount: value.amt + value.fee }];
    value.src =
      value.allocations.length === 1 ? value.allocations[0].source : undefined;
  }

  return value;
}

export async function importParsed(list, defaultSource = SRC[0]) {
  const ids = [...new Set(list.map((transaction) => transaction.id))];
  const existing = new Set(
    (await db.tx.bulkGet(ids)).filter(Boolean).map((transaction) => transaction.id),
  );
  const fresh = [];

  for (const transaction of list) {
    if (existing.has(transaction.id)) continue;
    const rule = await db.rules.get(transaction.party);
    fresh.push(
      normalizedTransaction(
        {
          ...transaction,
          src: transaction.src || rule?.src,
          cat: transaction.cat || rule?.cat,
          allocations: transaction.allocations || rule?.allocations,
        },
        defaultSource,
      ),
    );
    existing.add(transaction.id);
  }

  await db.tx.bulkAdd(fresh);
  for (const transaction of fresh) {
    if (!needsLabel(transaction)) {
      await db.rules.put({
        party: transaction.party,
        src: transaction.src || transaction.allocations?.[0]?.source,
        cat: transaction.type === 'out' ? transaction.cat : undefined,
      });
    }
  }

  return { added: fresh.length, skipped: list.length - fresh.length };
}

export async function saveTransaction(transaction) {
  const normalized = normalizedTransaction(transaction, SRC[0]);
  await db.tx.put(normalized);

  if (!needsLabel(normalized) && normalized.party) {
    await db.rules.put({
      party: normalized.party,
      src: normalized.src || normalized.allocations?.[0]?.source,
      cat: normalized.type === 'out' ? normalized.cat : undefined,
    });
  }
  return normalized;
}

export async function label(id, patch) {
  const transaction = await db.tx.get(id);
  if (!transaction) throw new Error('That transaction could not be found.');
  return saveTransaction({ ...transaction, ...patch, id });
}

export async function summary(sinceTs = 0) {
  const all = (await db.tx.toArray()).filter((transaction) => transaction.date >= sinceTs);
  const sources = await getSources();

  return sources.map((source) => {
    let income = 0;
    let spent = 0;
    const byCat = {};

    for (const transaction of all) {
      if (transaction.type === 'in') {
        if (transaction.src === source) income += transaction.amt;
        continue;
      }

      const allocations = transaction.allocations?.length
        ? transaction.allocations
        : transaction.src
          ? [{ source: transaction.src, amount: transaction.amt + (transaction.fee || 0) }]
          : [];
      const amount = allocations
        .filter((allocation) => allocation.source === source)
        .reduce((total, allocation) => total + allocation.amount, 0);

      spent += amount;
      if (amount) {
        const category = transaction.cat || 'Unlabelled';
        byCat[category] = (byCat[category] || 0) + amount;
      }
    }

    return { src: source, in: income, out: spent, left: income - spent, byCat };
  });
}

export async function deleteTransaction(id) {
  const transaction = await db.tx.get(id);
  if (!transaction) throw new Error('That transaction could not be found.');
  await db.tx.delete(id);
  return transaction; // keep a copy so the caller can offer Undo
}

export async function restoreDeleted(transaction) {
  await db.tx.put(transaction);
}

export async function restoreRules(rules) {
  const valid = (Array.isArray(rules) ? rules : []).filter(
    (rule) => rule && typeof rule.party === 'string' && rule.party,
  );
  if (valid.length) await db.rules.bulkPut(valid);
  return valid.length;
}
