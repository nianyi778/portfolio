// --- State ---
const state = {
  fx: { JPY: 1 },
  holdings: [], // {id, account, ticker, currency, quantity, costPerUnit, targetWeight, category, overrideTicker}
  market: new Map(), // ticker -> {ticker, currency, price, fxToJPY, overrideTicker}
  thresholdPct: 1,
};

const LS_KEY = 'portfolio_webapp_state_v1';

// --- Utils ---
function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { pushField(); i++; continue; }
    if (c === '\n') { pushField(); pushRow(); i++; continue; }
    if (c === '\r') { if (text[i + 1] === '\n') i++; pushField(); pushRow(); i++; continue; }
    field += c; i++;
  }
  pushField(); if (row.length > 1 || row[0] !== '') pushRow();
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows.shift().map(h => h.trim());
  return { headers, rows };
}

function get(obj, k, def = null) { return k in obj ? obj[k] : def; }
function num(x) { const n = Number(String(x ?? '').trim()); return isFinite(n) ? n : null; }
function fmtJPY(n) { return (n==null||!isFinite(n)) ? '-' : new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(n); }
function fmtNum(n, d=2) { return (n==null||!isFinite(n)) ? '-' : new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(n); }

// --- Market build ---
function upsertMarket(rec) {
  if (!rec || !rec.ticker) return;
  const prev = state.market.get(rec.ticker) || {};
  const merged = {
    ticker: rec.ticker,
    currency: rec.currency ?? prev.currency ?? null,
    price: rec.price ?? prev.price ?? null,
    fxToJPY: rec.fxToJPY ?? prev.fxToJPY ?? null,
    overrideTicker: rec.overrideTicker ?? prev.overrideTicker ?? null,
  };
  state.market.set(rec.ticker, merged);
}

function buildDatalist() {
  const dl = document.getElementById('dlTickers');
  dl.innerHTML = '';
  const tickers = Array.from(state.market.keys()).sort();
  for (const t of tickers) { const o = document.createElement('option'); o.value = t; dl.appendChild(o); }
}

// --- Price in JPY ---
function priceJPYFor(ticker, visited = new Set()) {
  if (!ticker) return null;
  if (visited.has(ticker)) return null; // cycle guard
  visited.add(ticker);
  const m = state.market.get(ticker);
  if (!m) return null;
  if (m.overrideTicker) {
    const over = priceJPYFor(m.overrideTicker, visited);
    if (over != null) return over;
  }
  const cur = m.currency || null;
  const px = m.price ?? null;
  const fx = (cur && cur in state.fx) ? state.fx[cur] : (m.fxToJPY ?? null);
  if (cur === 'JPY') return px ?? null;
  if (px != null && fx != null) return px * fx;
  return null;
}

// --- Compute rows ---
function computeRow(h) {
  // fill currency from market when missing
  const m = state.market.get(h.ticker) || null;
  const currency = h.currency || m?.currency || '';
  const fx = (currency && currency in state.fx) ? state.fx[currency] : (m?.fxToJPY ?? null);

  // allow per-row overrideTicker (falls back to market mapping)
  const overrideTicker = h.overrideTicker || m?.overrideTicker || null;
  const mForCalc = { ticker: h.ticker, currency, price: m?.price ?? null, fxToJPY: fx, overrideTicker };
  state.market.set(h.ticker, { ...(state.market.get(h.ticker)||{}), ...mForCalc });

  const pJPY = priceJPYFor(h.ticker);
  const qty = num(h.quantity) ?? 0;
  const costPer = num(h.costPerUnit);
  const valJPY = (pJPY != null) ? pJPY * qty : null;
  const costJPY = (costPer != null && fx != null) ? costPer * qty * fx : null;
  const pnl = (valJPY != null && costJPY != null) ? (valJPY - costJPY) : null;
  return { currency, fx, priceJPY: pJPY, valueJPY: valJPY, costJPY, pnl };
}

function computeTotals() {
  let total = 0;
  for (const h of state.holdings) {
    const c = computeRow(h);
    if (c.valueJPY != null) total += c.valueJPY;
  }
  return total;
}

// --- Render ---
const els = {
  dataInfo: document.getElementById('dataInfo'),
  fxBody: document.getElementById('fxBody'),
  inpThreshold: document.getElementById('inpThreshold'),
  tbody: document.getElementById('tbody'),
  summary: document.getElementById('summary'),
  pie: null,
  bar: null,
};

function renderFX() {
  els.fxBody.innerHTML = '';
  const curList = Object.keys(state.fx).sort((a,b)=> a==='JPY'?-1:b==='JPY'?1:a.localeCompare(b));
  for (const c of curList) {
    const row = document.createElement('div'); row.className = 'fx-row';
    const d1 = document.createElement('div'); d1.textContent = c; row.appendChild(d1);
    const d2 = document.createElement('div');
    const inp = document.createElement('input'); inp.type='number'; inp.step='any'; inp.className='inp'; inp.value = state.fx[c];
    inp.oninput = () => { state.fx[c] = Number(inp.value || 0); renderAll(); };
    d2.appendChild(inp); row.appendChild(d2);
    const d3 = document.createElement('div');
    if (c !== 'JPY') {
      const btn = document.createElement('button'); btn.textContent = '删除'; btn.className='danger';
      btn.onclick = () => { delete state.fx[c]; renderAll(); };
      d3.appendChild(btn);
    }
    row.appendChild(d3);
    els.fxBody.appendChild(row);
  }
}

function statusFor(devPct, thrPct) {
  if (devPct == null || !isFinite(devPct)) return { label: '—', cls: 'neutral' };
  if (devPct > thrPct) return { label: 'Overweight', cls: 'over' };
  if (devPct < -thrPct) return { label: 'Underweight', cls: 'under' };
  return { label: 'Neutral', cls: 'neutral' };
}

function renderTable() {
  els.tbody.innerHTML = '';
  const totalJPY = computeTotals();
  for (const h of state.holdings) {
    const c = computeRow(h);
    const actual = (c.valueJPY != null && totalJPY>0) ? (c.valueJPY/totalJPY*100) : null;
    const dev = (actual != null && h.targetWeight != null) ? (actual - Number(h.targetWeight||0)) : null;
    const st = statusFor(dev, Number(state.thresholdPct || 0));
    const tr = document.createElement('tr');

    const tdAct = document.createElement('td'); const del = document.createElement('button'); del.textContent='删'; del.className='danger'; del.onclick=()=>{ state.holdings=state.holdings.filter(x=>x!==h); renderAll();}; tdAct.appendChild(del); tr.appendChild(tdAct);

    const tdAcc = document.createElement('td'); const iAcc=document.createElement('input'); iAcc.className='inp'; iAcc.value=h.account||''; iAcc.oninput=()=>{h.account=iAcc.value;}; tdAcc.appendChild(iAcc); tr.appendChild(tdAcc);

    const tdT = document.createElement('td'); const iT=document.createElement('input'); iT.className='inp'; iT.setAttribute('list','dlTickers'); iT.value=h.ticker||''; iT.onchange=()=>{h.ticker=iT.value.trim(); renderAll();}; tdT.appendChild(iT); tr.appendChild(tdT);

    const tdCur = document.createElement('td'); const iCur=document.createElement('input'); iCur.className='inp short'; iCur.value=h.currency||state.market.get(h.ticker)?.currency||''; iCur.oninput=()=>{h.currency=iCur.value.trim().toUpperCase(); renderAll();}; tdCur.appendChild(iCur); tr.appendChild(tdCur);

    const tdQty = document.createElement('td'); tdQty.className='num'; const iQty=document.createElement('input'); iQty.type='number'; iQty.step='any'; iQty.className='inp'; iQty.value=h.quantity??0; iQty.oninput=()=>{h.quantity=Number(iQty.value||0); renderAll();}; tdQty.appendChild(iQty); tr.appendChild(tdQty);

    const tdCost = document.createElement('td'); tdCost.className='num'; const iCost=document.createElement('input'); iCost.type='number'; iCost.step='any'; iCost.className='inp'; iCost.value=h.costPerUnit??''; iCost.oninput=()=>{h.costPerUnit=Number(iCost.value); renderAll();}; tdCost.appendChild(iCost); tr.appendChild(tdCost);

    const tdTarget = document.createElement('td'); tdTarget.className='num'; const iTar=document.createElement('input'); iTar.type='number'; iTar.step='any'; iTar.className='inp'; iTar.value=h.targetWeight??''; iTar.oninput=()=>{h.targetWeight=Number(iTar.value); renderAll();}; tdTarget.appendChild(iTar); tr.appendChild(tdTarget);

    const tdCat = document.createElement('td'); const sel=document.createElement('select'); sel.className='inp'; ['','Core','Satellite','Other'].forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v||'—';sel.appendChild(o);}); sel.value=h.category||''; sel.onchange=()=>{h.category=sel.value||null;}; tdCat.appendChild(sel); tr.appendChild(tdCat);

    const tdOv = document.createElement('td'); const iOv=document.createElement('input'); iOv.className='inp'; iOv.setAttribute('list','dlTickers'); iOv.value=h.overrideTicker||state.market.get(h.ticker)?.overrideTicker||''; iOv.onchange=()=>{h.overrideTicker=iOv.value.trim()||null; renderAll();}; tdOv.appendChild(iOv); tr.appendChild(tdOv);

    const tdP = document.createElement('td'); tdP.className='num'; tdP.textContent = fmtNum(c.priceJPY && c.fx ? (c.priceJPY / c.fx) : null); tr.appendChild(tdP);
    const tdFx = document.createElement('td'); tdFx.className='num'; tdFx.textContent = fmtNum(c.fx,4); tr.appendChild(tdFx);
    const tdJPY = document.createElement('td'); tdJPY.className='num'; tdJPY.textContent = fmtNum(c.priceJPY); tr.appendChild(tdJPY);
    const tdVal = document.createElement('td'); tdVal.className='num'; tdVal.textContent = fmtJPY(c.valueJPY); tr.appendChild(tdVal);
    const tdCostJPY = document.createElement('td'); tdCostJPY.className='num'; tdCostJPY.textContent = fmtJPY(c.costJPY); tr.appendChild(tdCostJPY);
    const tdPnL = document.createElement('td'); tdPnL.className='num'; tdPnL.textContent = fmtJPY(c.pnl); if (c.pnl!=null) tdPnL.classList.add(c.pnl>=0?'pos':'neg'); tr.appendChild(tdPnL);
    const tdActPct = document.createElement('td'); tdActPct.className='num'; tdActPct.textContent = (actual!=null)? fmtNum(actual,2):'-'; tr.appendChild(tdActPct);
    const tdDev = document.createElement('td'); tdDev.className='num'; tdDev.textContent = (dev!=null)? ((dev>=0?'+':'')+fmtNum(dev,2)):'-'; if(dev!=null) tdDev.classList.add(dev>=0?'pos':'neg'); tr.appendChild(tdDev);
    const tdSt = document.createElement('td'); const b=document.createElement('span'); b.className='badge '+st.cls; b.textContent=st.label; tdSt.appendChild(b); tr.appendChild(tdSt);

    els.tbody.appendChild(tr);
  }

  const pnlAll = state.holdings.reduce((acc,h)=>{const c=computeRow(h); return { val:(acc.val||0)+(c.valueJPY||0), cost:(acc.cost||0)+(c.costJPY||0) };},{val:0,cost:0});
  const ttl = computeTotals();
  const totalPnl = (pnlAll.val!=null && pnlAll.cost!=null)? (pnlAll.val - pnlAll.cost): null;
  const pct = (totalPnl!=null && pnlAll.cost>0)? (totalPnl/pnlAll.cost*100): null;
  els.summary.innerHTML = '';
  const add = (k,v,cls='')=>{const d=document.createElement('div');d.className='pill '+cls;d.innerHTML=`<b>${k}：</b> ${v}`;els.summary.appendChild(d);};
  add('总市值', fmtJPY(ttl));
  add('总成本', fmtJPY(pnlAll.cost));
  add('总盈亏', fmtJPY(totalPnl), totalPnl!=null?(totalPnl>=0?'pos':'neg'):'' );
  add('盈亏%', pct!=null? ((pct>=0?'+':'')+fmtNum(pct,2)+'%'):'-', pct!=null?(pct>=0?'pos':'neg'):'');
}

// --- Charts ---
function updateCharts() {
  const total = computeTotals();
  const labels = []; const values = []; const devLabels=[]; const devValues=[]; const colors=[];
  for (const h of state.holdings) {
    const c = computeRow(h);
    const act = (c.valueJPY!=null && total>0)? (c.valueJPY/total*100):null;
    if (act!=null && act>0) { labels.push(h.ticker); values.push(Number(act.toFixed(2))); }
    const dev = (act!=null && h.targetWeight!=null)? (act - Number(h.targetWeight)): null;
    if (dev!=null) { devLabels.push(h.ticker); devValues.push(Number(dev.toFixed(2))); colors.push(dev>=0?'#2ea043':'#e5534b'); }
  }
  // pie
  const pieCtx = document.getElementById('pieChart');
  if (els.pie) els.pie.destroy();
  els.pie = new Chart(pieCtx, { type:'pie', data:{ labels, datasets:[{ data: values }] }, options:{ plugins:{ legend:{ position:'bottom' }}}});
  // bar
  const barCtx = document.getElementById('barChart');
  if (els.bar) els.bar.destroy();
  els.bar = new Chart(barCtx, { type:'bar', data:{ labels: devLabels, datasets:[{ label:'偏差(%)', data: devValues, backgroundColor: colors }] }, options:{ scales:{ y:{ ticks:{ callback:(v)=>v+'%' }}}}});
}

function renderAll() {
  document.getElementById('inpThreshold').value = state.thresholdPct;
  renderFX();
  buildDatalist();
  renderTable();
  updateCharts();
  updateDataInfo();
}

function updateDataInfo() {
  const nTickers = state.market.size;
  const fxItems = Object.keys(state.fx).length;
  const nHold = state.holdings.length;
  document.getElementById('dataInfo').innerHTML = `已加载：<b>${nHold}</b> 项持仓，<b>${nTickers}</b> 个标的价格，<b>${fxItems}</b> 条汇率。`;
}

// --- Importers ---
function importHoldingsCSV(text) {
  const { headers, rows } = parseCSV(text);
  const idx = {}; headers.forEach((h,i)=> idx[h.trim().toLowerCase()] = i);
  const getC = (r,name)=> r[idx[name]] ?? '';
  const list=[];
  for (const r of rows) {
    const h = {
      id: crypto.randomUUID(),
      account: String(getC(r,'account')||'').trim()||null,
      ticker: String(getC(r,'ticker')||'').trim(),
      currency: String(getC(r,'currency')||'').trim().toUpperCase()||null,
      quantity: num(getC(r,'quantity')) || 0,
      costPerUnit: num(getC(r,'cost_per_unit')),
      targetWeight: num(getC(r,'targetweight')),
      category: String(getC(r,'category')||'').trim()||null,
      overrideTicker: String(getC(r,'override_ticker')||'').trim()||null,
    };
    if (h.ticker) list.push(h);
  }
  state.holdings = list;
}

function importMarketCSV(text) {
  const { headers, rows } = parseCSV(text);
  const idx = {}; headers.forEach((h,i)=> idx[h.trim().toLowerCase()] = i);
  const g = (r, n) => r[idx[n]];
  for (const r of rows) {
    const ticker = String(g(r,'ticker')||'').trim(); if (!ticker) continue;
    const currency = String(g(r,'currency')||'').trim().toUpperCase();
    const current_price = num(g(r,'current_price'));
    const fx_to_jpy = num(g(r,'fx_to_jpy'));
    const ovr = String(g(r,'override_ticker')||'').trim()||null;
    upsertMarket({ ticker, currency, price: current_price, fxToJPY: fx_to_jpy, overrideTicker: ovr });
    if (currency && fx_to_jpy!=null) state.fx[currency] = fx_to_jpy;
  }
}

async function importConfigJSONText(text) {
  const cfg = JSON.parse(text);
  // fx
  if (cfg.fxRates && typeof cfg.fxRates === 'object') {
    for (const [k,v] of Object.entries(cfg.fxRates)) {
      if (v!=null) state.fx[k.toUpperCase()] = Number(v);
    }
    state.fx['JPY'] = 1;
  }
  // assets -> holdings & market
  if (Array.isArray(cfg.assets)) {
    state.holdings = [];
    for (const a of cfg.assets) {
      if (!a.ticker) continue;
      upsertMarket({ ticker: a.ticker, currency: a.currency, price: a.price ?? null, overrideTicker: a.overrideTicker ?? null });
      if (a.currency && a.currency.toUpperCase() in state.fx) {
        // ok
      }
      if (a.quantity != null) {
        state.holdings.push({
          id: crypto.randomUUID(),
          account: a.account || null,
          ticker: a.ticker,
          currency: a.currency || null,
          quantity: Number(a.quantity||0),
          costPerUnit: a.costPerUnit != null ? Number(a.costPerUnit) : null,
          targetWeight: a.targetWeight != null ? Number(a.targetWeight)*100 : null, // config 0-1 → %
          category: a.role || a.category || null,
          overrideTicker: a.overrideTicker || null,
        });
      }
    }
  }
}

async function loadPricesJSON(silent = false) {
  try {
    const res = await fetch('../data/prices.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP '+res.status);
    const js = await res.json();
    if (js.fx) { for (const [k,v] of Object.entries(js.fx)) state.fx[k.toUpperCase()] = Number(v); }
    if (Array.isArray(js.prices)) {
      for (const p of js.prices) {
        upsertMarket({ ticker: p.ticker, currency: p.currency, price: p.price });
      }
    }
    if (!silent) alert('已加载 data/prices.json');
  } catch (e) { alert('加载失败：'+e.message); }
}

// --- Local storage ---
function saveLocal() {
  const payload = {
    fx: state.fx,
    holdings: state.holdings,
    market: Array.from(state.market.entries()),
    thresholdPct: state.thresholdPct,
  };
  localStorage.setItem(LS_KEY, JSON.stringify(payload));
}
function loadLocal() {
  const raw = localStorage.getItem(LS_KEY); if (!raw) return false;
  try {
    const js = JSON.parse(raw);
    state.fx = js.fx || { JPY:1 };
    state.holdings = js.holdings || [];
    state.market = new Map(js.market || []);
    state.thresholdPct = js.thresholdPct ?? 1;
    return true;
  } catch { return false; }
}

// --- Export config snapshot ---
function exportConfig() {
  const cfg = {
    baseCurrency: 'JPY',
    fxRates: state.fx,
    assets: state.holdings.map(h=>({
      ticker: h.ticker,
      currency: h.currency,
      quantity: h.quantity,
      costPerUnit: h.costPerUnit ?? null,
      targetWeight: (h.targetWeight!=null? Number(h.targetWeight)/100 : null),
      category: h.category || null,
      role: h.category || null,
      overrideTicker: h.overrideTicker || state.market.get(h.ticker)?.overrideTicker || null,
      price: state.market.get(h.ticker)?.price ?? null,
    }))
  };
  const blob = new Blob([JSON.stringify(cfg,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='config.snapshot.json'; a.click(); URL.revokeObjectURL(a.href);
}

// --- Wiring ---
document.getElementById('inpThreshold').addEventListener('input', (e)=>{ state.thresholdPct = Number(e.target.value||0); renderAll(); });
document.getElementById('btnAddFX').addEventListener('click', ()=>{
  const cur = document.getElementById('fxNewCur').value.trim().toUpperCase();
  const val = Number(document.getElementById('fxNewVal').value||0);
  if (!cur) return; state.fx[cur] = val; document.getElementById('fxNewCur').value=''; document.getElementById('fxNewVal').value=''; renderAll();
});

document.getElementById('btnAddRow').addEventListener('click', ()=>{
  state.holdings.push({ id: crypto.randomUUID(), account: null, ticker:'', currency:'', quantity:0, costPerUnit:null, targetWeight:null, category:null, overrideTicker:null });
  renderAll();
});
document.getElementById('btnClearHoldings').addEventListener('click', ()=>{ if(confirm('确认清空所有持仓？')){ state.holdings=[]; renderAll(); }});

document.getElementById('btnSaveLocal').addEventListener('click', ()=>{ saveLocal(); alert('已保存到本地'); });
document.getElementById('btnLoadLocal').addEventListener('click', ()=>{ if (!loadLocal()) alert('本地无记录'); renderAll(); });
document.getElementById('btnExportConfig').addEventListener('click', ()=> exportConfig());
document.getElementById('btnClearAll').addEventListener('click', ()=>{ if(confirm('将清除汇率/价格/持仓等全部数据，确定？')){ state.fx={JPY:1}; state.market=new Map(); state.holdings=[]; renderAll(); }});

document.getElementById('btnFetchPrices').addEventListener('click', ()=> loadPricesJSON().then(renderAll));

document.getElementById('inpHoldings').addEventListener('change', (e)=>{
  const f = e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ importHoldingsCSV(String(r.result||'')); renderAll(); }catch{ alert('解析 holdings.csv 失败'); } }; r.readAsText(f);
});
document.getElementById('inpMarket').addEventListener('change', (e)=>{
  const f = e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ importMarketCSV(String(r.result||'')); renderAll(); }catch{ alert('解析 market_data.csv 失败'); } }; r.readAsText(f);
});
document.getElementById('inpConfig').addEventListener('change', (e)=>{
  const f = e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ importConfigJSONText(String(r.result||'')); renderAll(); }catch(ex){ alert('解析 config.json 失败: '+ex.message); } }; r.readAsText(f);
});

// --- Init ---
async function init(){
  loadLocal();
  // 自动加载最新 data/prices.json（若存在）
  try { await loadPricesJSON(true); } catch {}
  renderAll();
}
init();
