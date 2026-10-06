// Turns pasted M-Pesa SMS text into transaction objects.
// Shape: { id, type: 'in'|'out', amt, fee, party, cat?, date }

const num = (s) => parseFloat(String(s).replace(/,/g, ''));
const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();

// What follows a name in an SMS: a phone number, a masked number, or " on 5/10/26"
const END = '(?:\\s\\d{4}\\*+\\d+|\\s\\+?\\d{9,}|\\.?\\s+on \\d)';

function parseDate(p) {
  const d = p.match(/on (\d{1,2})\/(\d{1,2})\/(\d{2,4}) at (\d{1,2}):(\d{2}) ?(AM|PM)/i);
  if (!d) return Date.now();
  let h = +d[4] % 12;
  if (/pm/i.test(d[6])) h += 12;
  let y = +d[3];
  if (y < 100) y += 2000;
  return new Date(y, +d[2] - 1, +d[1], h, +d[5]).getTime();
}

export function parseMessages(text) {
  const chunks = text.split(/(?=\b[A-Z0-9]{10}\s+Confirmed)/);
  const out = [];
  for (const p of chunks) {
    if (!/Confirmed/i.test(p)) continue;
    const amt = p.match(/Ksh\s?([\d,]+\.?\d*)/i);
    if (!amt) continue;
    const id = (p.match(/^\s*([A-Z0-9]{10})\s+Confirmed/) || [])[1];
    if (!id) continue; // no receipt code = can't dedupe safely
    const fee = p.match(/Transaction cost, Ksh\s?([\d,.]+)/i);
    const base = { id, amt: num(amt[1]), fee: fee ? num(fee[1]) : 0, date: parseDate(p) };

    let m;
    if ((m = p.match(new RegExp('(?:received Ksh\\s?[\\d,.]+ from|Ksh\\s?[\\d,.]+ received from) (.+?)' + END, 'i'))))
      out.push({ ...base, type: 'in', party: title(m[1]) });
    else if ((m = p.match(new RegExp('sent to (.+?)' + END, 'i'))))
      out.push({ ...base, type: 'out', party: title(m[1]) });
    else if ((m = p.match(/paid to (.+?)\.?\s+on \d/i)))
      out.push({ ...base, type: 'out', party: title(m[1]) });
    else if (/airtime/i.test(p))
      out.push({ ...base, type: 'out', party: 'Airtime', cat: 'Airtime & data' });
    else if ((m = p.match(/withdraw\w* from (.+?) on/i)))
      out.push({ ...base, type: 'out', party: title(m[1]), cat: 'Cash out' });
    // anything else (Fuliza, Mshwari, reversals) is skipped for now
  }
  return out;
}