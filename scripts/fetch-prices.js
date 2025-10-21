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

async function readTemplateTickers() {
  // Prefer templates/market_data.example.csv or templates/config.example.json if present
  try {
    const csvPath = new URL('../templates/market_data.example.csv', import.meta.url);
    const csv = await fs.readFile(csvPath, 'utf-8');
    const lines = csv.trim().split(/\r?\n/); lines.shift();
    const tickers = new Set();
    for (const ln of lines) { const t = ln.split(',')[0].trim(); if (t) tickers.add(t); }
    return Array.from(tickers);
  } catch {}
  try {
    const cfgPath = new URL('../templates/config.example.json', import.meta.url);
    const cfg = JSON.parse(await fs.readFile(cfgPath, 'utf-8'));
    const tickers = new Set();
    for (const a of (cfg.assets||[])) if (a.ticker) tickers.add(a.ticker);
    return Array.from(tickers);
  } catch {}
  return [];
}

async function main() {
  const tickers = await readTemplateTickers();
  if (tickers.length === 0) {
    console.error('No tickers found in templates. Edit templates or pass your own list.');
  }
  // FX baseline (can be replaced by API call later)
  const fx = { USD: 150.4, HKD: 19.4, CNY: 21.1, JPY: 1 };
  const now = new Date().toISOString();
  const out = { prices: [], fx };
  for (const t of tickers) {
    if (t.startsWith('Cash_')) { // cash
      const cur = t.split('_')[1] || 'JPY';
      out.prices.push({ ticker: t, currency: cur, price: 1, fetchedAt: now });
      continue;
    }
    const ysym = mapToYahoo(t);
    try {
      const q = await yf.quote(ysym);
      const price = q?.regularMarketPrice ?? null;
      const currency = q?.currency ?? null;
      if (price != null) out.prices.push({ ticker: t, currency, price, fetchedAt: now });
      else console.error('No price for', t);
    } catch (e) {
      console.error('fetch fail', t, e.message);
    }
  }
  await fs.mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await fs.writeFile(new URL('../data/prices.json', import.meta.url), JSON.stringify(out, null, 2));
  console.log('Wrote data/prices.json');
}

main().catch(err => { console.error(err); process.exit(1); });

