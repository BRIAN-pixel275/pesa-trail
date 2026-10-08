import './style.css';
import { CAT, SRC, db, deleteTransaction, getSources, importParsed, needsLabel, restoreDeleted, restoreRules, saveSources, saveTransaction, summary } from './Db.js';
import { parseMessagesDetailed } from './Parser.js';
import { transactionsToCsv } from './export.js';
import { createPinCredential, verifyPin } from './appLock.js';
import { chargeSummary } from './charges.js';
import { monthlySpending } from './trends.js';

const app = document.querySelector('#app');
let installPrompt = null;
const state = {
  view: 'home',
  filter: 'all',
  search: '',
  period: 'month',
  selectedSource: SRC[0],
  sources: SRC,
  transactions: [],
  importDrafts: [],
  importText: '',
  importSkipped: 0,
  transactionDraft: null,
  lockCredential: null,
   lockChecked: false,
  importUnrecognized: [],
  locked: false,
  isInstalled: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
};

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  state.isInstalled = true;
  document.querySelector('#install-dialog')?.close();
  updateInstallButton();
  showToast('Pesa Trail is installed and ready to use.');
});

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);

const money = (value) =>
  new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const dateLabel = (timestamp) =>
  new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'short',
    year: new Date(timestamp).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  }).format(new Date(timestamp));

const localDateTime = (timestamp = Date.now()) => {
  const date = new Date(timestamp);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const sourceFor = (transaction) => {
  if (transaction.type === 'in') return transaction.src ? [transaction.src] : [];
  if (transaction.allocations?.length) {
    return [...new Set(transaction.allocations.map((allocation) => allocation.source))];
  }
  return transaction.src ? [transaction.src] : [];
};

const totalFor = (transaction) =>
  transaction.amt + (transaction.type === 'out' ? transaction.fee || 0 : 0);

const allocationRows = (kind, allocations, total, index = '') => `
  <div class="allocation-editor" data-kind="${kind}" ${kind === 'import' ? `data-index="${index}"` : ''}>
    <div class="allocation-heading"><span>Fund this expense from</span><span>Amount</span></div>
    ${(allocations || []).map((allocation, row) => `
      <div class="allocation-row" data-row="${row}">
        <label class="sr-only" for="${kind}-source-${index}-${row}">Funding source</label>
        <select id="${kind}-source-${index}-${row}" data-alloc-source required>
          ${sourceOptions(allocation.source)}
        </select>
        <label class="sr-only" for="${kind}-amount-${index}-${row}">Amount from this source</label>
        <input id="${kind}-amount-${index}-${row}" data-alloc-amount type="number" min="0" step="0.01" inputmode="decimal" value="${Number(allocation.amount) || 0}" required>
        ${(allocations || []).length > 1 ? `<button class="icon-button remove-allocation" type="button" data-action="remove-allocation" aria-label="Remove funding source">×</button>` : ''}
      </div>
    `).join('')}
    <div class="allocation-footer">
      <button class="text-button" type="button" data-action="add-allocation">+ Split across sources</button>
      <span>Allocated <strong class="allocation-total">${money((allocations || []).reduce((sum, allocation) => sum + (Number(allocation.amount) || 0), 0))}</strong> of ${money(total)}</span>
    </div>
  </div>`;

function sourceOptions(selected) {
  return state.sources.map((source) =>
    `<option value="${escapeHtml(source)}" ${source === selected ? 'selected' : ''}>${escapeHtml(source)}</option>`,
  ).join('');
}

function categoryOptions(selected, includePrompt = false) {
  return `${includePrompt ? `<option value="" disabled ${selected ? '' : 'selected'}>Choose a category</option>` : ''}${CAT.map((category) =>
    `<option value="${escapeHtml(category)}" ${category === selected ? 'selected' : ''}>${escapeHtml(category)}</option>`,
  ).join('')}`;
}

function transactionRow(transaction) {
  const sources = sourceFor(transaction);
  const isIncome = transaction.type === 'in';
  const status = needsLabel(transaction)
    ? '<span class="review-badge">Needs details</span>'
    : '';
  const amount = totalFor(transaction);

  return `
    <button class="transaction-row" type="button" data-action="edit-transaction" data-id="${escapeHtml(transaction.id)}">
      <span class="transaction-icon ${isIncome ? 'income' : 'expense'}" aria-hidden="true">${isIncome ? '↙' : '↗'}</span>
      <span class="transaction-copy">
        <span class="transaction-title">${escapeHtml(transaction.party || (isIncome ? 'Money received' : 'Expense'))}</span>
        <span class="transaction-meta">${escapeHtml(isIncome ? sources.join(', ') || 'Choose a source' : [transaction.cat || 'Choose category', sources.join(', ') || 'Choose a source'].filter(Boolean).join(' · '))} · ${dateLabel(transaction.date)}</span>
        ${status}
      </span>
      <span class="transaction-amount ${isIncome ? 'positive' : ''}">${isIncome ? '+' : '−'}${money(amount)}</span>
    </button>`;
}

function emptyState(title, detail, action = 'new-expense', actionLabel = 'Add an expense') {
  return `
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">↗</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(detail)}</p>
      <button class="button button-primary" type="button" data-action="${action}">${escapeHtml(actionLabel)}</button>
    </div>`;
}

function categoryBreakdown(sourceSummary) {
  const selected = sourceSummary.find((item) => item.src === state.selectedSource);
  const categories = Object.entries(selected?.byCat || {}).sort((left, right) => right[1] - left[1]);
  const total = categories.reduce((sum, [, amount]) => sum + amount, 0);

  return `
    <section class="content-section breakdown-section">
      <div class="section-heading">
        <div><p class="eyebrow">Understand your spending</p><h2>Where it went</h2></div>
        <label class="breakdown-source"><span class="sr-only">Choose source for spending breakdown</span><select id="breakdown-source">${sourceOptions(state.selectedSource)}</select></label>
      </div>
      <div class="breakdown-card">
        ${categories.length ? categories.map(([category, amount]) => `
          <div class="category-row">
            <div class="category-label"><span>${escapeHtml(category)}</span><strong>${money(amount)}</strong></div>
            <div class="category-progress" aria-hidden="true"><span style="width:${total ? Math.round(amount / total * 100) : 0}%"></span></div>
          </div>`).join('') : `<div class="breakdown-empty"><span class="empty-icon" aria-hidden="true">↗</span><p>No spending recorded for <strong>${escapeHtml(state.selectedSource)}</strong> in this period.</p></div>`}
        ${categories.length ? `<p class="breakdown-total">Total from ${escapeHtml(state.selectedSource)} <strong>${money(total)}</strong></p>` : ''}
      </div>
    </section>`;
}

function spendingTrend() {
  const months = monthlySpending(state.transactions, state.selectedSource);
  const max = Math.max(...months.map((month) => month.amount), 0);
  const compactMoney = (amount) => new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);

  return `
    <section class="content-section trend-section">
      <div class="section-heading">
        <div><p class="eyebrow">See how it changes</p><h2>Spending trend</h2></div>
        <label class="breakdown-source"><span class="sr-only">Choose source for spending trend</span><select id="trend-source">${sourceOptions(state.selectedSource)}</select></label>
      </div>
      <div class="trend-card">
        <p class="trend-caption">Monthly money out from ${escapeHtml(state.selectedSource)} · current month is month-to-date</p>
        <div class="trend-chart">
          ${months.map((month) => {
            const percentage = max ? Math.round(month.amount / max * 100) : 0;
            return `
              <div class="trend-column">
                <span class="trend-value">${compactMoney(month.amount)}</span>
                <div class="trend-track" role="progressbar" aria-label="${escapeHtml(month.label)} spending" aria-valuenow="${month.amount}" aria-valuemin="0" aria-valuemax="${max || 1}">
                  <span class="trend-bar" style="height:${percentage}%"></span>
                </div>
                <span class="trend-month">${escapeHtml(month.label)}</span>
              </div>`;
          }).join('')}
        </div>
      </div>
    </section>`;
}
function chargesCard(transactions) {
  const charges = chargeSummary(transactions);
  if (!charges.count) return '';
  const when = state.period === 'month' ? 'this month' : 'overall';
  return `
    <section class="content-section charges-section">
      <div class="section-heading">
        <div><p class="eyebrow">The cost of moving money</p><h2>M-PESA charges</h2></div>
      </div>
      <div class="charges-card">
        <div class="charges-total">
          <strong>${money(charges.total)}</strong>
          <span>${charges.count} charged transaction${charges.count === 1 ? '' : 's'} ${when} · ${(charges.share * 100).toFixed(1)}% of money out</span>
        </div>
        <ul class="charges-list">
          ${charges.top.map((item) => `<li><span>${escapeHtml(item.party)}</span><span>${money(item.fee)} · ${item.count}×</span></li>`).join('')}
        </ul>
      </div>
    </section>`;
}

function dashboardView(sourceSummary) {
  const now = new Date();
  const monthName = state.period === 'month'
    ? new Intl.DateTimeFormat('en-KE', { month: 'long', year: 'numeric' }).format(now)
    : 'All time';
  const monthTransactions = state.transactions.filter((transaction) => {
    const date = new Date(transaction.date);
    return state.period === 'all' || (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth());
  });
  const income = monthTransactions.filter((transaction) => transaction.type === 'in').reduce((sum, transaction) => sum + transaction.amt, 0);
  const spent = monthTransactions.filter((transaction) => transaction.type === 'out').reduce((sum, transaction) => sum + totalFor(transaction), 0);
  const pendingCount = state.transactions.filter(needsLabel).length;
  const recent = [...state.transactions].sort((a, b) => b.date - a.date).slice(0, 5);

  return `
    <section class="welcome-row">
      <div>
        <p class="eyebrow">${escapeHtml(monthName)}</p>
        <h1>Your money, <span>in view.</span></h1>
        <p class="welcome-copy">Know what came in, where it came from, and what it went toward.</p>
      </div>
      <button class="button button-primary add-main" type="button" data-action="new-expense"><span aria-hidden="true">＋</span> Add transaction</button>
    </section>

    <section class="stats-grid" aria-label="${state.period === 'month' ? "This month's" : 'All-time'} totals">
      <article class="stat-card stat-highlight">
        <span class="stat-label">Money in</span>
        <strong>${money(income)}</strong>
        <span class="stat-note">${state.period === 'month' ? 'Across all sources this month' : 'Across all recorded transactions'}</span>
        <span class="stat-symbol" aria-hidden="true">↙</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">Money out</span>
        <strong>${money(spent)}</strong>
        <span class="stat-note">Including transaction fees ${state.period === 'month' ? 'this month' : 'overall'}</span>
        <span class="stat-symbol expense-symbol" aria-hidden="true">↗</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">Net movement</span>
        <strong>${money(income - spent)}</strong>
        <span class="stat-note">Income minus spending ${state.period === 'month' ? 'this month' : 'overall'}</span>
        <span class="stat-symbol neutral-symbol" aria-hidden="true">＝</span>
      </article>
    </section>

    ${chargesCard(monthTransactions)}

    <section class="content-section">
      <div class="section-heading">
        <div><p class="eyebrow">Follow the money</p><h2>Your sources</h2></div>
        <label class="period-select"><span class="sr-only">Dashboard time period</span><select id="period-select"><option value="month" ${state.period === 'month' ? 'selected' : ''}>This month</option><option value="all" ${state.period === 'all' ? 'selected' : ''}>All time</option></select></label>
        <button class="text-button" type="button" data-action="add-source">＋ Add a source</button>
      </div>
      <div class="source-grid">
        ${sourceSummary.map((item) => {
          const percentage = item.in > 0 ? Math.min(100, Math.round((item.out / item.in) * 100)) : 0;
          return `
            <article class="source-card">
              <div class="source-card-top"><span class="source-dot"></span><h3>${escapeHtml(item.src)}</h3></div>
              <p class="source-net">${money(item.left)} <span>net ${state.period === 'month' ? 'this month' : 'all time'}</span></p>
              <div class="source-progress" role="progressbar" aria-label="${escapeHtml(item.src)} spending compared to income" aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100"><span style="width:${percentage}%"></span></div>
              <div class="source-card-totals"><span>In <strong>${money(item.in)}</strong></span><span>Out <strong>${money(item.out)}</strong></span></div>
            </article>`;
        }).join('')}
        <button class="source-card source-add-card" type="button" data-action="add-source"><span class="add-circle">＋</span><span>Add another source</span></button>
      </div>
      <p class="helper-text">Source totals are based on transactions you have recorded; they are not your M-PESA balance.</p>
    </section>
    ${categoryBreakdown(sourceSummary)}
    ${spendingTrend()}

    <section class="content-section transactions-section">
      <div class="section-heading">
        <div><p class="eyebrow">Your latest activity</p><h2>Recent transactions</h2></div>
        <button class="text-button" type="button" data-view="activity">See all <span aria-hidden="true">→</span></button>
      </div>
      ${pendingCount ? `<button class="review-callout" type="button" data-view="activity"><span class="review-icon" aria-hidden="true">!</span><span><strong>${pendingCount} transaction${pendingCount === 1 ? '' : 's'} need details</strong><small>Add a source or category so your totals tell the full story.</small></span><span aria-hidden="true">→</span></button>` : ''}
      <div class="transaction-list">
        ${recent.length ? recent.map(transactionRow).join('') : emptyState('Start your money trail', 'Add your first transaction or paste M-PESA messages to build a clear picture of your money.')}
      </div>
    </section>`;
}

function activityView() {
  return `
    <section class="page-heading">
      <p class="eyebrow">Every shilling, accounted for</p>
      <h1>Transactions</h1>
      <p>Search and update your income and spending.</p>
    </section>
    <section class="content-section activity-section">
      <div class="activity-tools">
        <label class="search-field"><span aria-hidden="true">⌕</span><span class="sr-only">Search transactions</span><input id="transaction-search" type="search" placeholder="Search a person, place or category" value="${escapeHtml(state.search)}"></label>
        <div class="filter-group" role="group" aria-label="Filter transactions">
          ${[['all', 'All'], ['in', 'Money in'], ['out', 'Money out']].map(([value, label]) => `<button type="button" class="filter-chip ${state.filter === value ? 'selected' : ''}" data-action="filter" data-filter="${value}" aria-pressed="${state.filter === value}">${label}</button>`).join('')}
        </div>
      </div>
      <div id="transaction-list" class="transaction-list"></div>
    </section>`;
}

function importView() {
  return `
    <section class="page-heading">
      <p class="eyebrow">Private by design</p>
      <h1>Bring in your M-PESA messages</h1>
      <p>Paste message text here. Pesa Trail reads it on this device and lets you review every transaction before saving.</p>
    </section>
    <section class="import-layout">
      <article class="import-card">
        <div class="step-number">01</div>
        <h2>Paste messages</h2>
        <p>Copy M-PESA confirmation messages and paste them below. You can paste more than one at a time.</p>
        <label class="field-label" for="sms-text">M-PESA message text</label>
        <textarea id="sms-text" rows="9" placeholder="Example: QWE1234567 Confirmed. Ksh500.00 sent to ...">${escapeHtml(state.importText)}</textarea>
        <label class="field-label compact-label" for="default-import-source">Use this source when a message has no saved match</label>
        <select id="default-import-source">${sourceOptions(state.sources[0])}</select>
        <button class="button button-primary full-button" type="button" data-action="parse-messages">Find transactions</button>
        <p class="privacy-note"><span aria-hidden="true">●</span> Messages are processed locally and are not uploaded.</p>
      </article>
      <aside class="import-help">
        <div class="help-icon" aria-hidden="true">✓</div>
        <h3>Review before saving</h3>
        <p>Imported transactions are only saved after you review the source and category. You can edit them later.</p>
        <div class="help-divider"></div>
        <strong>Good to know</strong>
        <ul><li>Already-imported messages are skipped.</li><li>Your source and category choices can be remembered for the same person or business.</li><li>Messages this version does not recognize can still be entered manually.</li></ul>
      </aside>
    </section>
        <section id="import-review" class="content-section import-review" hidden></section>
    <section id="import-unrecognized" class="content-section import-review" hidden></section>`;
}

function transactionListMarkup() {
  const term = state.search.trim().toLowerCase();
  const filtered = [...state.transactions]
    .filter((transaction) => state.filter === 'all' || transaction.type === state.filter)
    .filter((transaction) => {
      if (!term) return true;
      return [
        transaction.party,
        transaction.cat,
        transaction.src,
        ...sourceFor(transaction),
      ].some((value) => String(value || '').toLowerCase().includes(term));
    })
    .sort((a, b) => b.date - a.date);

  if (!filtered.length) {
    return emptyState(
      state.transactions.length ? 'No matching transactions' : 'Nothing here yet',
      state.transactions.length ? 'Try another search or filter.' : 'Add a transaction or import M-PESA messages to get started.',
      state.transactions.length ? 'new-expense' : 'open-import',
      state.transactions.length ? 'Add an expense' : 'Import messages',
    );
  }

  let lastDay = '';
  return filtered.map((transaction) => {
    const day = new Intl.DateTimeFormat('en-KE', { dateStyle: 'full' }).format(new Date(transaction.date));
    const heading = day === lastDay ? '' : `<h3 class="date-divider">${day}</h3>`;
    lastDay = day;
    return `${heading}${transactionRow(transaction)}`;
  }).join('');
}

function updateTransactionList() {
  const list = document.querySelector('#transaction-list');
  if (list) list.innerHTML = transactionListMarkup();
}

function updateInstallButton() {
  const button = document.querySelector('[data-action="open-install"]');
  if (button) button.hidden = state.isInstalled;
}

function openInstallDialog() {
  const dialog = document.querySelector('#install-dialog');
  if (!dialog) return;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  dialog.innerHTML = `
    <div class="install-dialog-content">
      <button class="dialog-close" type="button" data-action="close-dialog" aria-label="Close">×</button>
      <span class="install-mark" aria-hidden="true">P</span>
      <p class="eyebrow">Your money, one tap away</p>
      <h2>Install Pesa Trail</h2>
      <p class="dialog-copy">Add Pesa Trail to your home screen for a quick, app-like way to track your money. Your records stay on this device.</p>
      ${installPrompt
        ? `<button class="button button-primary full-button" type="button" data-action="install-now"><span aria-hidden="true">↓</span> Install app</button>`
        : `<div class="install-instructions"><strong>${isIos ? 'On iPhone or iPad' : 'Install from your browser'}</strong><p>${isIos
          ? 'Tap the Share button in Safari, then choose “Add to Home Screen”.'
          : 'Open your browser menu and choose “Install app” or “Add to Home Screen”. If that option is not shown, this browser may not support installing web apps.'}</p></div>`
      }
      <button class="button button-quiet full-button install-dismiss" type="button" data-action="close-dialog">Maybe later</button>
    </div>`;
  dialog.showModal();
}

function renderImportReview() {
  const container = document.querySelector('#import-review');
  if (!container) return;
  if (!state.importDrafts.length) {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <div class="section-heading">
      <div><p class="eyebrow">02 · Check your details</p><h2>${state.importDrafts.length} message${state.importDrafts.length === 1 ? '' : 's'} ready to review</h2></div>
      <button class="button button-primary" type="button" data-action="save-import">Save ${state.importDrafts.length} transaction${state.importDrafts.length === 1 ? '' : 's'}</button>
    </div>
    ${state.importSkipped ? `<p class="helper-text import-skipped">${state.importSkipped} duplicate or unrecognized message${state.importSkipped === 1 ? '' : 's'} will not be imported.</p>` : ''}
    <div class="import-draft-list">
      ${state.importDrafts.map((transaction, index) => {
        const isIncome = transaction.type === 'in';
        return `
          <article class="import-draft">
            <div class="import-draft-top">
              <span class="transaction-icon ${isIncome ? 'income' : 'expense'}" aria-hidden="true">${isIncome ? '↙' : '↗'}</span>
              <div><strong>${escapeHtml(transaction.party || (isIncome ? 'Money received' : 'Expense'))}</strong><small>${dateLabel(transaction.date)} · ${money(totalFor(transaction))}${transaction.fee ? ` including ${money(transaction.fee)} fee` : ''}</small></div>
            </div>
            ${isIncome
              ? `<label class="field-label" for="import-source-${index}">Money came from</label><select id="import-source-${index}" data-import-source="${index}">${sourceOptions(transaction.src)}</select>`
              : `<label class="field-label" for="import-category-${index}">What was it for?</label><select id="import-category-${index}" data-import-category="${index}">${categoryOptions(transaction.cat, true)}</select>${allocationRows('import', transaction.allocations, totalFor(transaction), index)}`
            }
          </article>`;
      }).join('')}
    </div>`;
}
function renderUnrecognized() {
  const container = document.querySelector('#import-unrecognized');
  if (!container) return;
  const items = state.importUnrecognized;
  if (!items.length) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }
  container.hidden = false;
  container.innerHTML = `
    <div class="section-heading">
      <div><p class="eyebrow">Could not read automatically</p><h2>${items.length} message${items.length === 1 ? '' : 's'} need a quick look</h2></div>
    </div>
    <p class="helper-text">Pesa Trail does not recognize these yet (for example Fuliza, M-Shwari or reversals). Add each one by hand. The receipt ID is kept, so it will not be imported twice.</p>
    <div class="import-draft-list">
      ${items.map((item, index) => `
        <article class="import-draft unrecognized-item">
          <p class="unrecognized-text">${escapeHtml(item.text)}</p>
          <div class="unrecognized-actions">
            <button class="button button-primary" type="button" data-action="add-unrecognized" data-index="${index}">Add manually</button>
            <button class="button button-quiet" type="button" data-action="dismiss-unrecognized" data-index="${index}">Dismiss</button>
          </div>
        </article>`).join('')}
    </div>`;
}
async function render() {
  if (!state.lockChecked) {
    const savedLock = await db.settings.get('appLock');
    state.lockCredential = savedLock?.value || null;
    state.locked = Boolean(state.lockCredential);
    state.lockChecked = true;
  }

  if (state.locked) {
    app.innerHTML = `
      <main class="lock-screen">
        <div class="lock-card">
          <span class="brand-mark lock-mark" aria-hidden="true">P</span>
          <p class="eyebrow">Private by design</p>
          <h1>Pesa Trail is locked</h1>
          <p>Enter your six-digit PIN to view your money trail.</p>
          <form id="unlock-form">
            <label class="field-label" for="unlock-pin">App PIN</label>
            <input id="unlock-pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]{6}" minlength="6" maxlength="6" aria-describedby="unlock-error" required autofocus>
            <p id="unlock-error" class="form-error" role="alert"></p>
            <button class="button button-primary full-button" type="submit">Unlock Pesa Trail</button>
          </form>
          <p class="lock-note">This PIN protects the app screen on this device. It does not encrypt your saved data.</p>
        </div>
      </main>`;
    app.querySelector('#unlock-pin').focus();
    return;
  }

  const [sources, transactions, monthSummary, allSummary] = await Promise.all([
    getSources(),
    db.tx.toArray(),
    summary(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()),
  summary(),
  ]);
  state.sources = sources;
  state.transactions = transactions;
  if (!sources.includes(state.selectedSource)) state.selectedSource = sources[0];

  const navigation = [
    ['home', 'Overview', '⌂'],
    ['activity', 'Activity', '↗'],
    ['import', 'Import SMS', '＋'],
  ];
  const body = state.view === 'home'
    ? dashboardView(state.period === 'month' ? monthSummary : allSummary)
    : state.view === 'activity'
      ? activityView()
      : importView();

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#" data-view="home" aria-label="Pesa Trail home"><span class="brand-mark">P</span><span>Pesa<span>Trail</span></span></a>
        <div class="topbar-actions">
          <span class="local-indicator"><span></span> Saved on this device</span>
          <button class="button button-quiet lock-settings" type="button" data-action="${state.lockCredential ? 'lock-now' : 'manage-lock'}" aria-label="${state.lockCredential ? 'Lock Pesa Trail' : 'Set app PIN'}" title="${state.lockCredential ? 'Lock Pesa Trail' : 'Set app PIN'}"><span aria-hidden="true">${state.lockCredential ? '▣' : '⚙'}</span><span class="lock-settings-label">${state.lockCredential ? 'Lock' : 'Set PIN'}</span></button>
          <button class="button button-quiet install-app-button" type="button" data-action="open-install" ${state.isInstalled ? 'hidden' : ''} aria-label="Install Pesa Trail"><span class="install-button-icon" aria-hidden="true">↓</span><span class="install-label">Install app</span></button>
          <button class="button button-quiet export-csv-button" type="button" data-action="export-csv"><span aria-hidden="true">⇩</span><span class="export-csv-label">Export CSV</span></button>
          <button class="button button-quiet backup-button" type="button" data-action="export-backup"><span aria-hidden="true">▣</span><span class="backup-label">JSON backup</span></button>
          <button class="icon-button backup-restore" type="button" data-action="restore-backup" aria-label="Restore a backup" title="Restore backup">↥</button>
        </div>
      </header>
      <main>
        ${body}
      </main>
      <footer class="app-footer"><span>Made for your money story.</span><span>Your transaction data stays in this browser.</span><span class="app-version" title="App version">Version v${escapeHtml(import.meta.env.APP_VERSION)}</span><button class="text-button footer-lock-settings" type="button" data-action="manage-lock">App lock settings</button></footer>
    </div>
    <nav class="bottom-nav" aria-label="Main navigation">
      ${navigation.map(([view, label, icon]) => `<button type="button" data-view="${view}" class="${state.view === view ? 'active' : ''}" aria-current="${state.view === view ? 'page' : 'false'}"><span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('')}
    </nav>
    <dialog id="transaction-dialog" class="app-dialog"></dialog>
    <dialog id="install-dialog" class="app-dialog install-dialog"></dialog>
    <dialog id="lock-dialog" class="app-dialog lock-dialog">
      <form id="lock-form">
        <button class="dialog-close" type="button" data-action="close-dialog" aria-label="Close">×</button>
        <p class="eyebrow">On-device privacy</p>
        <h2>${state.lockCredential ? 'Manage your app PIN' : 'Set an app PIN'}</h2>
        <p class="dialog-copy">Use a six-digit PIN to lock the app manually or whenever it is reopened or reloaded.</p>
        ${state.lockCredential ? '<label class="field-label" for="current-pin">Current PIN</label><input id="current-pin" name="currentPin" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]{6}" minlength="6" maxlength="6" required>' : ''}
        <label class="field-label" for="new-pin">${state.lockCredential ? 'New six-digit PIN' : 'Six-digit PIN'}</label>
        <input id="new-pin" name="newPin" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{6}" minlength="6" maxlength="6" required>
        <label class="field-label" for="confirm-pin">Confirm PIN</label>
        <input id="confirm-pin" name="confirmPin" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{6}" minlength="6" maxlength="6" required>
        <p class="form-error" role="alert"></p>
        <div class="dialog-actions lock-actions">
          ${state.lockCredential ? '<button class="button button-quiet lock-remove" type="button" data-action="remove-lock">Remove PIN</button>' : ''}
          <button class="button button-primary" type="submit">${state.lockCredential ? 'Update PIN' : 'Set PIN'}</button>
        </div>
        <p class="lock-note">Your PIN is stored as a salted verifier, not as plain text. App lock is a privacy screen, not data encryption.</p>
      </form>
    </dialog>
    <dialog id="source-dialog" class="app-dialog source-dialog">
      <form id="source-form" method="dialog">
        <button class="dialog-close" type="button" data-action="close-dialog" aria-label="Close">×</button>
        <p class="eyebrow">Make it yours</p><h2>Add a money source</h2>
        <p class="dialog-copy">Examples: Student upkeep, weekend baking, or family support.</p>
        <label class="field-label" for="new-source">Source name</label><input id="new-source" name="source" maxlength="40" placeholder="e.g. Student upkeep" required>
        <p class="form-error" role="alert"></p>
        <button class="button button-primary full-button" type="submit">Add source</button>
      </form>
    </dialog>
    <input id="backup-file" type="file" accept="application/json,.json" hidden>
    <div class="toast" role="status" aria-live="polite"></div>`;

  updateTransactionList();
  renderImportReview();
  renderUnrecognized();
  updateInstallButton();
}

function renderTransactionDialog() {
  const draft = state.transactionDraft;
  const dialog = document.querySelector('#transaction-dialog');
  if (!draft || !dialog) return;
  const isIncome = draft.type === 'in';
  const allocations = draft.allocations?.length
    ? draft.allocations
    : [{ source: state.sources[0], amount: Number(draft.amt || 0) + Number(draft.fee || 0) }];

  dialog.innerHTML = `
    <form id="transaction-form">
      <button class="dialog-close" type="button" data-action="close-dialog" aria-label="Close">×</button>
      <p class="eyebrow">${draft.id ? 'Update your record' : 'Add to your money trail'}</p>
      <h2>${draft.id ? 'Edit transaction' : 'New transaction'}</h2>
      <div class="form-grid">
        <label class="field-label" for="tx-type">Type
          <select id="tx-type" name="type" required><option value="out" ${!isIncome ? 'selected' : ''}>Money out</option><option value="in" ${isIncome ? 'selected' : ''}>Money in</option></select>
        </label>
        <label class="field-label" for="tx-date">Date and time
          <input id="tx-date" name="date" type="datetime-local" value="${escapeHtml(draft.dateField || localDateTime(draft.date))}" required>
        </label>
        <label class="field-label" for="tx-amount">Amount (KSh)
          <input id="tx-amount" name="amt" type="number" min="0.01" step="0.01" inputmode="decimal" value="${draft.amt || ''}" placeholder="0.00" required>
        </label>
        ${isIncome ? '' : `<label class="field-label" for="tx-fee">M-PESA fee (KSh)
          <input id="tx-fee" name="fee" type="number" min="0" step="0.01" inputmode="decimal" value="${draft.fee || 0}" required>
        </label>`}
        <label class="field-label form-span" for="tx-party">${isIncome ? 'Who sent it? / Note' : 'Where did it go? / Note'}
          <input id="tx-party" name="party" maxlength="100" value="${escapeHtml(draft.party || '')}" placeholder="${isIncome ? 'e.g. Mum · upkeep' : 'e.g. Lunch at campus'}" required>
        </label>
        ${isIncome
          ? `<label class="field-label form-span" for="tx-source">Money came from<select id="tx-source" name="src" required>${sourceOptions(draft.src || state.sources[0])}</select></label>`
          : `<label class="field-label form-span" for="tx-category">What was it for?<select id="tx-category" name="cat" required>${categoryOptions(draft.cat || '', true)}</select></label>
             <div class="form-span">${allocationRows('transaction', allocations, Number(draft.amt || 0) + Number(draft.fee || 0))}</div>`
        }
      </div>
      <p class="form-error" role="alert"></p>
           <div class="dialog-actions">${draft.id ? '<button class="button button-quiet delete-button" type="button" data-action="delete-transaction">Delete</button>' : ''}<button class="button button-quiet" type="button" data-action="close-dialog">Cancel</button><button class="button button-primary" type="submit">Save transaction</button>
           </div>
      <p class="dialog-privacy">This entry is saved only on this device.</p>
    </form>`;
}

function readAllocationRows(container) {
  return [...container.querySelectorAll('.allocation-row')].map((row) => ({
    source: row.querySelector('[data-alloc-source]').value,
    amount: Number(row.querySelector('[data-alloc-amount]').value),
  }));
}

function syncTransactionDraft(form = document.querySelector('#transaction-form')) {
  if (!form || !state.transactionDraft) return;
  const values = new FormData(form);
  const type = values.get('type');
  const editor = form.querySelector('.allocation-editor');
  state.transactionDraft = {
    ...state.transactionDraft,
    type,
    dateField: values.get('date'),
    amt: Number(values.get('amt')) || 0,
    fee: Number(values.get('fee')) || 0,
    party: values.get('party') || '',
    src: values.get('src') || state.transactionDraft.src,
    cat: values.get('cat') || state.transactionDraft.cat,
    allocations: type === 'out'
      ? editor ? readAllocationRows(editor) : state.transactionDraft.allocations
      : [],
  };
}

function showToast(message, isError = false, undo = null) {
  const toast = document.querySelector('.toast');
  if (!toast) return;
  toast.textContent = message;
  showToast.pending = undo?.run || null;
  if (undo) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.dataset.action = 'toast-action';
    button.textContent = undo.label;
    toast.append(' ', button);
  }
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('visible'), undo ? 7000 : 3600);
}

function updateAllocationTotal(editor, total) {
  if (!editor) return;
  const allocated = readAllocationRows(editor).reduce((sum, allocation) => sum + (allocation.amount || 0), 0);
  const footer = editor.querySelector('.allocation-footer span:last-child');
  if (footer) {
    footer.innerHTML = `Allocated <strong class="allocation-total">${money(allocated)}</strong> of ${money(total)}`;
    footer.classList.toggle('allocation-invalid', Math.abs(allocated - total) > 0.01);
  }
}

function openTransaction(transaction = null, type = 'out') {
  state.transactionDraft = transaction
    ? { ...transaction, allocations: transaction.allocations?.map((allocation) => ({ ...allocation })) || [], dateField: localDateTime(transaction.date) }
    : { type, date: Date.now(), amt: '', fee: 0, party: '', src: state.sources[0], cat: 'Other', allocations: [] };
  renderTransactionDialog();
  document.querySelector('#transaction-dialog').showModal();
}
function openUnrecognized(index) {
  const item = state.importUnrecognized[index];
  if (!item) return;
  state.transactionDraft = {
    type: item.type,
    date: item.date,
    amt: item.amt,
    fee: item.type === 'out' ? item.fee : 0,
    party: '',
    src: state.sources[0],
    cat: '',
    allocations: [],
    receiptId: item.id,
  };
  renderTransactionDialog();
  document.querySelector('#transaction-dialog').showModal();
}

function openSourceDialog() {
  const dialog = document.querySelector('#source-dialog');
  dialog.querySelector('.form-error').textContent = '';
  dialog.showModal();
  dialog.querySelector('#new-source').focus();
}

function openLockDialog() {
  const dialog = document.querySelector('#lock-dialog');
  dialog.querySelector('.form-error').textContent = '';
  dialog.showModal();
  dialog.querySelector(state.lockCredential ? '#current-pin' : '#new-pin').focus();
}

async function lockApp() {
  if (!state.lockCredential) return;
  state.locked = true;
  await render();
}

async function parseImportText() {
  const text = document.querySelector('#sms-text')?.value || state.importText;
  state.importText = text;
   const { parsed, unrecognized } = parseMessagesDetailed(text);
  const existingIds = new Set(await db.tx.toCollection().primaryKeys());
  state.importUnrecognized = unrecognized.filter((item) => !existingIds.has(item.id));
  if (!parsed.length) {
    state.importDrafts = [];
    state.importSkipped = 0;
    renderImportReview();
    renderUnrecognized();
    showToast(
      state.importUnrecognized.length
        ? 'These messages need to be added by hand.'
        : 'No supported M-PESA confirmations found. You can add a transaction manually.',
      !state.importUnrecognized.length,
    );
    return;
  }
  const defaultSource = document.querySelector('#default-import-source')?.value || state.sources[0];
  state.importSkipped = 0;
  state.importDrafts = [];

  for (const transaction of parsed) {
    if (existingIds.has(transaction.id)) {
      state.importSkipped += 1;
      continue;
    }
    existingIds.add(transaction.id);
    const rule = await db.rules.get(transaction.party);
    if (transaction.type === 'in') {
      state.importDrafts.push({ ...transaction, src: rule?.src || defaultSource, allocations: [] });
    } else {
      state.importDrafts.push({
        ...transaction,
        src: rule?.src || defaultSource,
        cat: transaction.cat || rule?.cat || '',
        allocations: [{ source: rule?.src || defaultSource, amount: transaction.amt + transaction.fee }],
      });
    }
  }

  state.importSkipped += parsed.length - state.importSkipped - state.importDrafts.length;
  renderImportReview();
  renderUnrecognized();
  if (!state.importDrafts.length) {
    showToast('Those messages are already recorded or could not be recognized.');
  }
}

async function saveImport() {
  const invalid = state.importDrafts.find((transaction) => {
    if (transaction.type === 'in') return !transaction.src;
    const allocated = (transaction.allocations || []).reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0);
    return !transaction.cat || Math.abs(allocated - totalFor(transaction)) > 0.01;
  });
  if (invalid) {
    showToast('Check each category and make sure every expense is fully assigned to a source.', true);
    return;
  }

  const result = await importParsed(state.importDrafts, state.sources[0]);
  state.importDrafts = [];
  state.importText = '';
  state.view = 'activity';
  await render();
  showToast(`${result.added} transaction${result.added === 1 ? '' : 's'} saved${result.skipped ? ` · ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped` : ''}.`);
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportCsv() {
  const transactions = await db.tx.toArray();
  if (!transactions.length) {
    showToast('Add or import transactions before exporting a spreadsheet.', true);
    return;
  }
  const blob = new Blob([transactionsToCsv(transactions)], {
    type: 'text/csv;charset=utf-8',
  });
  downloadFile(blob, `pesa-trail-transactions-${new Date().toISOString().slice(0, 10)}.csv`);
  showToast(`${transactions.length} transaction${transactions.length === 1 ? '' : 's'} exported as CSV.`);
}

async function exportBackup() {
  const payload = {
    format: 'pesa-trail-backup-v1',
    exportedAt: new Date().toISOString(),
    sources: state.sources,
    transactions: await db.tx.toArray(),
    rules: await db.rules.toArray(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadFile(blob, `pesa-trail-backup-${new Date().toISOString().slice(0, 10)}.json`);
  showToast('Your JSON backup was downloaded.');
}

async function restoreBackup(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (
    payload?.format !== 'pesa-trail-backup-v1' ||
    !Array.isArray(payload.transactions) ||
    !payload.transactions.every((transaction) =>
      transaction?.id &&
      ['in', 'out'].includes(transaction.type) &&
      Number.isFinite(Number(transaction.amt)) &&
      Number.isFinite(Number(transaction.date)),
    )
  ) {
    throw new Error('This does not look like a valid Pesa Trail backup.');
  }

    await db.tx.bulkPut(payload.transactions);
  await restoreRules(payload.rules);
  if (Array.isArray(payload.sources) && payload.sources.length) {
    await saveSources(payload.sources);
  }
  await render();
  showToast(`${payload.transactions.length} backed-up transaction${payload.transactions.length === 1 ? '' : 's'} restored. Matching IDs were updated.`);
}

app.addEventListener('click', async (event) => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    event.preventDefault();
    state.view = viewButton.dataset.view;
    await render();
    return;
  }

  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;

  if (action === 'manage-lock') openLockDialog();
  else if (action === 'lock-now') await lockApp();
  else if (action === 'remove-lock') {
    const form = document.querySelector('#lock-form');
    const error = form.querySelector('.form-error');
    const pin = new FormData(form).get('currentPin');
    try {
      if (!await verifyPin(pin, state.lockCredential)) {
        error.textContent = 'The current PIN is incorrect.';
        return;
      }
      await db.settings.delete('appLock');
      state.lockCredential = null;
      document.querySelector('#lock-dialog').close();
      await render();
      showToast('App lock removed.');
    } catch (lockError) {
      error.textContent = `Could not remove app lock: ${lockError.message}`;
    }
  }
  else if (action === 'toast-action') {
    const run = showToast.pending;
    showToast.pending = null;
    document.querySelector('.toast')?.classList.remove('visible');
    await run?.();
  } else if (action === 'delete-transaction') {
    const id = state.transactionDraft?.id;
    if (!id) return;
    try {
      const removed = await deleteTransaction(id);
      document.querySelector('#transaction-dialog').close();
      state.transactionDraft = null;
      await render();
      showToast('Transaction deleted.', false, {
        label: 'Undo',
        run: async () => {
          await restoreDeleted(removed);
          await render();
          showToast('Transaction restored.');
        },
      });
    } catch (deleteError) {
      showToast(`Could not delete transaction: ${deleteError.message}`, true);
    }
  }
  else if (action === 'add-unrecognized') openUnrecognized(Number(button.dataset.index));
  else if (action === 'dismiss-unrecognized') {
    state.importUnrecognized.splice(Number(button.dataset.index), 1);
    renderUnrecognized();
  }
  else if (action === 'new-expense') openTransaction(null, 'out');
  else if (action === 'new-income') openTransaction(null, 'in');
  else if (action === 'edit-transaction') {
    const transaction = state.transactions.find((item) => item.id === button.dataset.id);
    if (transaction) openTransaction(transaction);
  } else if (action === 'add-source') openSourceDialog();
  else if (action === 'open-install') openInstallDialog();
  else if (action === 'install-now') {
    if (!installPrompt) {
      openInstallDialog();
      return;
    }
    try {
      const promptEvent = installPrompt;
      installPrompt = null;
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      document.querySelector('#install-dialog')?.close();
      if (choice.outcome === 'accepted') {
        showToast('Pesa Trail is being installed.');
      } else {
        showToast('No problem — you can install Pesa Trail later.');
      }
    } catch (error) {
      showToast(`Could not open the install prompt: ${error.message}`, true);
      openInstallDialog();
    }
  }
  else if (action === 'close-dialog') button.closest('dialog').close();
  else if (action === 'parse-messages') {
    try {
      await parseImportText();
    } catch (error) {
      showToast(`Could not read messages: ${error.message}`, true);
    }
  } else if (action === 'save-import') {
    try {
      await saveImport();
    } catch (error) {
      showToast(`Could not save imported transactions: ${error.message}`, true);
    }
  } else if (action === 'export-backup') {
    try {
      await exportBackup();
    } catch (error) {
      showToast(`Could not create backup: ${error.message}`, true);
    }
  } else if (action === 'export-csv') {
    try {
      await exportCsv();
    } catch (error) {
      showToast(`Could not export spreadsheet: ${error.message}`, true);
    }
  } else if (action === 'restore-backup') {
    document.querySelector('#backup-file').click();
  } else if (action === 'open-import') {
    state.view = 'import';
    await render();
  } else if (action === 'filter') {
    state.filter = button.dataset.filter;
    app.querySelectorAll('[data-action="filter"]').forEach((chip) => {
      const selected = chip.dataset.filter === state.filter;
      chip.classList.toggle('selected', selected);
      chip.setAttribute('aria-pressed', String(selected));
    });
    updateTransactionList();
  } else if (action === 'add-allocation' || action === 'remove-allocation') {
    const editor = button.closest('.allocation-editor');
    const kind = editor.dataset.kind;
    if (kind === 'transaction') {
      syncTransactionDraft();
      const allocations = state.transactionDraft.allocations;
      if (action === 'add-allocation') allocations.push({ source: state.sources[0], amount: 0 });
      else allocations.splice(Number(button.closest('.allocation-row').dataset.row), 1);
      renderTransactionDialog();
    } else {
      const index = Number(editor.dataset.index);
      const allocations = state.importDrafts[index].allocations;
      const row = Number(button.closest('.allocation-row')?.dataset.row);
      if (action === 'add-allocation') allocations.push({ source: state.sources[0], amount: 0 });
      else allocations.splice(row, 1);
      renderImportReview();
    }
  }
});

app.addEventListener('input', (event) => {
  const target = event.target;
  if (target.id === 'sms-text') state.importText = target.value;
  if (target.id === 'transaction-search') {
    state.search = target.value;
    updateTransactionList();
    const search = document.querySelector('#transaction-search');
    search?.focus();
    search?.setSelectionRange(state.search.length, state.search.length);
  }

  const editor = target.closest('.allocation-editor');
  if (target.form?.id === 'transaction-form') {
    syncTransactionDraft();
    const currentEditor = target.form.querySelector('.allocation-editor');
    if (currentEditor && target.matches('[name="amt"], [name="fee"]')) {
      const rows = currentEditor.querySelectorAll('.allocation-row');
      if (rows.length === 1) {
        rows[0].querySelector('[data-alloc-amount]').value =
          Number(document.querySelector('[name="amt"]')?.value || 0) +
          Number(document.querySelector('[name="fee"]')?.value || 0);
        syncTransactionDraft();
      }
      updateAllocationTotal(
        currentEditor,
        Number(document.querySelector('[name="amt"]')?.value || 0) +
          Number(document.querySelector('[name="fee"]')?.value || 0),
      );
    } else if (currentEditor && target.matches('[data-alloc-amount]')) {
      syncTransactionDraft();
      updateAllocationTotal(
        currentEditor,
        Number(document.querySelector('[name="amt"]')?.value || 0) +
          Number(document.querySelector('[name="fee"]')?.value || 0),
      );
    }
  } else if (editor && editor.dataset.kind === 'import' && target.matches('[data-alloc-amount]')) {
    state.importDrafts[Number(editor.dataset.index)].allocations = readAllocationRows(editor);
    updateAllocationTotal(editor, totalFor(state.importDrafts[Number(editor.dataset.index)]));
  }
});

app.addEventListener('change', async (event) => {
  const target = event.target;
  if (target.id === 'period-select') {
    state.period = target.value;
    await render();
    return;
  }
  if (target.id === 'breakdown-source') {
    state.selectedSource = target.value;
    await render();
    return;
  }
  if (target.id === 'trend-source') {
    state.selectedSource = target.value;
    await render();
    return;
  }
  if (target.name === 'type' && target.form?.id === 'transaction-form') {
    syncTransactionDraft();
    state.transactionDraft.type = target.value;
    if (target.value === 'out' && !state.transactionDraft.allocations.length) {
      state.transactionDraft.allocations = [{ source: state.sources[0], amount: state.transactionDraft.amt }];
    }
    renderTransactionDialog();
    return;
  }

  const editor = target.closest('.allocation-editor');
  if (editor && target.matches('[data-alloc-source], [data-alloc-amount]')) {
    const allocations = readAllocationRows(editor);
    if (editor.dataset.kind === 'transaction') {
      syncTransactionDraft();
      state.transactionDraft.allocations = allocations;
    } else {
      state.importDrafts[Number(editor.dataset.index)].allocations = allocations;
    }
    const total = editor.dataset.kind === 'transaction'
      ? Number(document.querySelector('#tx-amount')?.value || 0) + Number(document.querySelector('#tx-fee')?.value || 0)
      : totalFor(state.importDrafts[Number(editor.dataset.index)]);
    updateAllocationTotal(editor, total);
  }

  if (target.matches('[data-import-source]')) {
    state.importDrafts[Number(target.dataset.importSource)].src = target.value;
  }
  if (target.matches('[data-import-category]')) {
    state.importDrafts[Number(target.dataset.importCategory)].cat = target.value;
  }
});

app.addEventListener('submit', async (event) => {
  if (event.target.id === 'unlock-form') {
    event.preventDefault();
    const form = event.target;
    const error = form.querySelector('.form-error');
    const pin = new FormData(form).get('pin');
    try {
      if (!await verifyPin(pin, state.lockCredential)) {
        error.textContent = 'That PIN is not correct. Try again.';
        form.querySelector('[name="pin"]').value = '';
        form.querySelector('[name="pin"]').focus();
        return;
      }
      state.locked = false;
      await render();
    } catch (lockError) {
      error.textContent = `Could not verify the PIN: ${lockError.message}`;
    }
  } else if (event.target.id === 'lock-form') {
    event.preventDefault();
    const form = event.target;
    const values = new FormData(form);
    const error = form.querySelector('.form-error');
    const currentPin = values.get('currentPin');
    const newPin = values.get('newPin');
    if (!/^\d{6}$/.test(newPin)) {
      error.textContent = 'Choose a six-digit PIN.';
      return;
    }
    if (newPin !== values.get('confirmPin')) {
      error.textContent = 'The PIN entries do not match.';
      return;
    }
    try {
      const hadLock = Boolean(state.lockCredential);
      if (state.lockCredential && !await verifyPin(currentPin, state.lockCredential)) {
        error.textContent = 'The current PIN is incorrect.';
        return;
      }
      const credential = await createPinCredential(newPin);
      await db.settings.put({ key: 'appLock', value: credential });
      state.lockCredential = credential;
      document.querySelector('#lock-dialog').close();
      await render();
      showToast(hadLock ? 'App PIN updated.' : 'App PIN saved. Pesa Trail will lock each time it is reopened.');
    } catch (lockError) {
      error.textContent = `Could not save the app PIN: ${lockError.message}`;
    }
  } else if (event.target.id === 'transaction-form') {
    event.preventDefault();
    const form = event.target;
    syncTransactionDraft(form);
    const draft = state.transactionDraft;
    const total = draft.amt + (draft.type === 'out' ? draft.fee : 0);
    const error = form.querySelector('.form-error');
    const allocated = draft.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (!Number.isFinite(draft.amt) || draft.amt <= 0) error.textContent = 'Enter an amount greater than zero.';
    else if (!Number.isFinite(new Date(draft.dateField).getTime())) error.textContent = 'Choose a valid transaction date and time.';
    else if (!draft.party.trim()) error.textContent = 'Add a person, place, or short note.';
    else if (draft.type === 'out' && Math.abs(allocated - total) > 0.01) error.textContent = 'Funding allocations must add up to the expense and fee.';
    else {
      error.textContent = '';
      const transaction = {
        ...draft,
        id: draft.id || draft.receiptId || `manual-${crypto.randomUUID()}`,
        date: new Date(draft.dateField).getTime(),
        party: draft.party.trim(),
        src: draft.type === 'in'
          ? draft.src
          : draft.allocations.length === 1 ? draft.allocations[0].source : undefined,
        allocations: draft.type === 'out' ? draft.allocations : [],
      };
         delete transaction.dateField;
      delete transaction.receiptId;
      try {
        await saveTransaction(transaction);
        state.importUnrecognized = state.importUnrecognized.filter((item) => item.id !== transaction.id);
        document.querySelector('#transaction-dialog').close();
        state.transactionDraft = null;
        await render();
        showToast('Transaction saved on this device.');
      } catch (saveError) {
        error.textContent = `Could not save transaction: ${saveError.message}`;
      }
    }
  } else if (event.target.id === 'source-form') {
    event.preventDefault();
    const form = event.target;
    const input = form.querySelector('[name="source"]');
    const name = input.value.trim();
    const error = form.querySelector('.form-error');
    if (!name) {
      error.textContent = 'Enter a name for this source.';
      return;
    }
    if (state.sources.some((source) => source.toLowerCase() === name.toLowerCase())) {
      error.textContent = 'That source already exists.';
      return;
    }
    try {
      await saveSources([...state.sources, name]);
      document.querySelector('#source-dialog').close();
      await render();
      showToast(`${name} added as a source.`);
    } catch (saveError) {
      error.textContent = `Could not add source: ${saveError.message}`;
    }
  }
});

app.addEventListener('change', async (event) => {
  if (event.target.id !== 'backup-file' || !event.target.files?.[0]) return;
  try {
    await restoreBackup(event.target.files[0]);
  } catch (error) {
    showToast(`Could not restore backup: ${error.message}`, true);
  } finally {
    event.target.value = '';
  }
});

render().catch((error) => {
  app.innerHTML = `<main class="startup-error"><h1>Could not open Pesa Trail</h1><p>${escapeHtml(error.message)}</p><p>Your saved data has not been changed.</p></main>`;
});
