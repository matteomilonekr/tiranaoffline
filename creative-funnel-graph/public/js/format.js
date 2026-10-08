// Number, money and date formatting shared by the UI and the charts.

let currentLocale = 'en-US';

export function setLocale(locale) {
  currentLocale = locale || 'en-US';
}

export function getLocale() {
  return currentLocale;
}

const symbolCache = new Map();
export function currencySymbol(currency = 'USD') {
  const key = currentLocale + ':' + currency;
  if (symbolCache.has(key)) return symbolCache.get(key);
  let symbol = currency;
  try {
    const parts = new Intl.NumberFormat(currentLocale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
    symbol = parts.find((p) => p.type === 'currency')?.value || currency;
  } catch {
    // Unknown currency code: fall back to the code itself.
  }
  symbolCache.set(key, symbol);
  return symbol;
}

function decimal(value, digits) {
  return new Intl.NumberFormat(currentLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** Compact number: 950, 3.1k, 40.7k, 1.2M (lowercase k, as Ads tools write it). */
export function compact(value, digits = 1) {
  const v = Number(value) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e6) return decimal(v / 1e6, abs >= 1e7 ? 0 : digits) + 'M';
  if (abs >= 1e3) return decimal(v / 1e3, abs >= 1e5 ? 0 : digits) + 'k';
  return decimal(v, abs > 0 && abs < 10 && v % 1 ? 1 : 0);
}

export function money(value, currency = 'USD', { exact = false } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const symbol = currencySymbol(currency);
  const v = Number(value);
  const body = exact ? decimal(v, Math.abs(v) < 100 ? 2 : 0) : compact(v);
  const prefixed = !/^[A-Z]{3}$/.test(symbol);
  return prefixed ? symbol + body : body + ' ' + symbol;
}

export function integer(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(currentLocale, { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export function roas(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return decimal(Number(value), 2);
}

export function ratio(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return decimal(Number(value), digits);
}

export function percent(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return decimal(Number(value) * 100, digits) + '%';
}

/** Parses "YYYY-MM-DD" as a local calendar date. */
export function parseDay(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(day, n) {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function shortDate(day) {
  return new Intl.DateTimeFormat(currentLocale, { month: 'short', day: 'numeric' }).format(parseDay(day));
}

export function daysBetween(since, until) {
  return Math.round((parseDay(until) - parseDay(since)) / 86400000) + 1;
}
