/*
  Node script: fetch prices and fx, output to data/prices.json
  - Uses yahoo-finance2 (no API key) for equities/ETFs
  - FX rates can be hardcoded or later fetched from exchangerate.host
  - Map tickers from config/templates to Yahoo symbols
*/

import fs from 'fs/promises';
import yf from 'yahoo-finance2';

// Map exchange-prefixed tickers to Yahoo symbols
function mapToYahoo(t) {
  if (!t) return t;
  if (t.startsWith('NASDAQ:') || t.startsWith('NYSE:')) return t.split(':')[1];
  if (t.startsWith('TYO:')) return t.split(':')[1].replace(/^0+/, '') + '.T';
  if (t.startsWith('HKG:')) return t.split(':')[1] + '.HK';
  if (t.startsWith('SHA:')) return t.split(':')[1] + '.SS';
  if (t.startsWith('SHE:')) return t.split(':')[1] + '.SZ';
  return t;
}

async function readTickersAndFX() {
  // Priority 1: data/config.json
  try {
    const cfgPath = new URL('../data/config.json', import.meta.url);
    const cfg = JSON.parse(await fs.readFile(cfgPath, 'utf-8'));
    const tickers = new Set();
    for (const a of (cfg.assets || [])) if (a.ticker) tickers.add(String(a.ticker));
    const fx = { ...(cfg.fxRates || {}) };
    if (!('JPY' in fx)) fx.JPY = 1;
    return { tickers: Array.from(tickers), fx };
  } catch {}

  // Priority 2: data/market-data.csv (kebab-case), fallback to legacy underscore
  try {
    let csvPath = new URL('../data/market-data.csv', import.meta.url);
    let csv;
    try { csv = await fs.readFile(csvPath, 'utf-8'); }
    catch { csvPath = new URL('../data/market_data.csv', import.meta.url); csv = await fs.readFile(csvPath, 'utf-8'); }
    const lines = csv.trim().split(/\r?\n/);
    const header = lines.shift();
    const cols = header.split(',').map(s=>s.trim().toLowerCase());
    const iTicker = cols.indexOf('ticker');
    const iCurrency = cols.indexOf('currency');
    const iFx = cols.indexOf('fx_to_jpy');
    const tickers = new Set();
    const fx = {};
    for (const ln of lines) {
      const parts = ln.split(',');
      const t = (parts[iTicker] || '').trim(); if (t) tickers.add(t);
      if (iCurrency >= 0 && iFx >= 0) {
        const c = (parts[iCurrency] || '').trim();
        const v = Number((parts[iFx] || '').trim());
        if (c && isFinite(v)) fx[c] = v;
      }
    }
    if (!('JPY' in fx)) fx.JPY = 1;
    return { tickers: Array.from(tickers), fx };
  } catch {}

  // Priority 3: data/tickers.json
  try {
    const listPath = new URL('../data/tickers.json', import.meta.url);
    const arr = JSON.parse(await fs.readFile(listPath, 'utf-8'));
    const tickers = Array.isArray(arr) ? arr.map(String) : [];
    return { tickers, fx: { JPY: 1 } };
  } catch {}

  // Fallback: templates/config.example.json
  try {
    const cfgPath = new URL('../templates/config.example.json', import.meta.url);
    const cfg = JSON.parse(await fs.readFile(cfgPath, 'utf-8'));
    const tickers = new Set();
    for (const a of (cfg.assets||[])) if (a.ticker) tickers.add(a.ticker);
    const fx = { ...(cfg.fxRates || {}) };
    if (!('JPY' in fx)) fx.JPY = 1;
    return { tickers: Array.from(tickers), fx };
  } catch {}

  // Fallback: templates/market-data.example.csv (kebab-case), fallback to legacy underscore
  try {
    let csvPath = new URL('../templates/market-data.example.csv', import.meta.url);
    let csv;
    try { csv = await fs.readFile(csvPath, 'utf-8'); }
    catch { csvPath = new URL('../templates/market_data.example.csv', import.meta.url); csv = await fs.readFile(csvPath, 'utf-8'); }
    const lines = csv.trim().split(/\r?\n/); lines.shift();
    const tickers = new Set();
    for (const ln of lines) { const t = ln.split(',')[0].trim(); if (t) tickers.add(t); }
    return { tickers: Array.from(tickers), fx: { JPY: 1 } };
  } catch {}

  return { tickers: [], fx: { JPY: 1 } };
}

async function main() {
  const { tickers, fx: fxFromData } = await readTickersAndFX();
  if (tickers.length === 0) {
    console.error('No tickers found in templates. Edit templates or pass your own list.');
  }
  const now = new Date().toISOString();
  const out = { prices: [], fx: {} };
  const currencies = new Set();
  for (const t of tickers) {
    if (t.startsWith('Cash_')) { // cash
      const cur = t.split('_')[1] || 'JPY';
      out.prices.push({ ticker: t, currency: cur, price: 1, fetchedAt: now });
      currencies.add(cur);
      continue;
    }
    const ysym = mapToYahoo(t);
    try {
      const q = await yf.quote(ysym);
      const price = q?.regularMarketPrice ?? null;
      const currency = q?.currency ?? null;
      if (price != null) out.prices.push({ ticker: t, currency, price, fetchedAt: now });
      if (currency) currencies.add(currency);
      else console.error('No price for', t);
    } catch (e) {
      console.error('fetch fail', t, e.message);
    }
  }
  // Merge currencies known from data fx as well
  Object.keys(fxFromData || {}).forEach(c => currencies.add(c));

  // Fetch FX via exchangerate.host (base=JPY, invert to get FX→JPY)
  async function fetchFXFromApi(curs) {
    try {
      const syms = Array.from(curs).filter(Boolean).map(s=>s.toUpperCase()).join(',');
      const url = `https://api.exchangerate.host/latest?base=JPY&symbols=${encodeURIComponent(syms)}`;
      const res = await fetch(url, { headers: { 'accept': 'application/json' } });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const js = await res.json();
      const rates = js?.rates || {};
      const fx = { JPY: 1 };
      for (const [k, v] of Object.entries(rates)) {
        if (k === 'JPY') { fx.JPY = 1; continue; }
        if (v && isFinite(v)) fx[k] = Number((1 / v).toFixed(6)); // invert: (JPY base → currency per JPY) => JPY per currency
      }
      return fx;
    } catch (e) {
      console.error('FX fetch failed:', e.message);
      return null;
    }
  }

  const fxApi = await fetchFXFromApi(currencies);
  out.fx = { ...(fxFromData || {}), ...(fxApi || {}) };

  await fs.mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await fs.writeFile(new URL('../data/prices.json', import.meta.url), JSON.stringify(out, null, 2));
  console.log('Wrote data/prices.json');
}

main().catch(err => { console.error(err); process.exit(1); });
