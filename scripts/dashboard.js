#!/usr/bin/env node
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT     = 3001;
const LOG_FILE = path.join(__dirname, '..', 'copy-trades.json');

// ── CLI helper ────────────────────────────────────────────────────────────────

function bullpen(args) {
  try {
    return JSON.parse(execSync(`bullpen ${args}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  } catch {
    return null;
  }
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function loadLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  } catch {
    return { trades: [], errors: [], stats: { totalCopied: 0, totalBuys: 0, totalSells: 0 }, lastUpdated: null };
  }
}

function getOpenPositions(trades) {
  const pos = {};
  for (const t of trades) {
    if (t.copy_status === 'failed' || t.copy_status === 'skipped-no-position') continue;
    const key = `${t.trader_address}::${t.market_slug}::${t.outcome}`;
    if (t.side === 'BUY') {
      if (!pos[key]) pos[key] = [];
      pos[key].push(t);
    } else if (t.side === 'SELL' && pos[key]?.length) {
      pos[key].shift();
      if (!pos[key].length) delete pos[key];
    }
  }
  return pos;
}

function fetchPricesForSlugs(slugs) {
  const prices = {};
  for (const slug of slugs.slice(0, 8)) { // cap at 8 calls per request
    const data = bullpen(`polymarket price ${slug} --output json`);
    if (data?.outcomes) prices[slug] = data;
  }
  return prices;
}

function getPriceForOutcome(priceData, outcome) {
  if (!priceData?.outcomes) return null;
  const o = priceData.outcomes.find(x => x.outcome === outcome);
  if (!o) return null;
  return o.midpoint ?? o.last_trade ?? null;
}

function computeStats(trades, prices) {
  const buys  = trades.filter(t => t.side === 'BUY' && t.copy_status !== 'failed');
  const sells = trades.filter(t => t.side === 'SELL');
  const openPos = getOpenPositions(trades);

  let unrealizedPnL = 0;
  let realizedPnL   = 0;
  let resolvedWins  = 0;
  let resolvedLosses = 0;

  // Unrealized PnL for open positions
  for (const entries of Object.values(openPos)) {
    for (const entry of entries) {
      const priceData    = prices[entry.market_slug];
      const currentPrice = getPriceForOutcome(priceData, entry.outcome);
      if (currentPrice != null && entry.trader_price > 0) {
        const shares       = entry.our_amount_usd / entry.trader_price;
        const currentValue = shares * currentPrice;
        unrealizedPnL     += currentValue - entry.our_amount_usd;

        // Treat near-resolved as decided
        if (currentPrice >= 0.95) resolvedWins++;
        else if (currentPrice <= 0.05) resolvedLosses++;
      }
    }
  }

  // Realized PnL for sold positions
  for (const sell of sells) {
    const matchingBuys = buys.filter(b =>
      b.trader_address === sell.trader_address &&
      b.market_slug    === sell.market_slug    &&
      b.outcome        === sell.outcome
    );
    if (!matchingBuys.length) continue;
    const avgEntry = matchingBuys.reduce((s, b) => s + b.trader_price, 0) / matchingBuys.length;
    if (avgEntry <= 0) continue;
    const shares     = sell.our_amount_usd / avgEntry;
    const exitValue  = shares * (sell.trader_price || 0);
    const pnl        = exitValue - sell.our_amount_usd;
    realizedPnL     += pnl;
    if (pnl > 0) resolvedWins++;
    else resolvedLosses++;
  }

  const totalDecided = resolvedWins + resolvedLosses;
  return {
    totalTrades:      buys.length,
    totalDeployed:    buys.length * 5,
    unrealizedPnL,
    realizedPnL,
    totalPnL:         unrealizedPnL + realizedPnL,
    resolvedWins,
    resolvedLosses,
    winRate:          totalDecided > 0 ? Math.round((resolvedWins / totalDecided) * 100) : null,
    openPositionCount: Object.values(openPos).reduce((s, arr) => s + arr.length, 0),
  };
}

function computeTraderStats(trades, subscriptions) {
  const byTrader = {};
  // Seed from active subscriptions so the current roster always appears
  for (const sub of (subscriptions || [])) {
    if (sub.status !== 'Active') continue;
    const n = sub.nickname || (sub.followed_address || '').slice(0, 10) + '…';
    byTrader[n] = { nickname: n, trades: 0, deployed: 0 };
  }

  for (const t of trades) {
    if (t.side !== 'BUY' || t.copy_status === 'failed' || t.copy_status === 'skipped') continue;
    const n = t.trader_nickname;
    if (!byTrader[n]) byTrader[n] = { nickname: n, trades: 0, deployed: 0 };
    byTrader[n].trades++;
    byTrader[n].deployed += t.our_amount_usd || 5;
  }
  return Object.values(byTrader).sort((a, b) => b.trades - a.trades);
}

function getBalance() {
  const data = bullpen('portfolio balances --output json');
  if (!data) return { total: 0, polymarket: 0 };
  const poly = (data.chains || []).find(c => c.chain_name === 'Polygon');
  return {
    total:      data.total_usd || 0,
    polymarket: poly?.total_usd || 0,
  };
}

function getApiData() {
  const log = loadLog();

  const copyList  = bullpen('tracker copy list --output json') || [];
  const botStatus = copyList.length === 0 ? 'unknown'
    : copyList.every(s => s.status === 'Paused') ? 'paused' : 'active';

  const openPos     = getOpenPositions(log.trades);
  const uniqueSlugs = [...new Set(Object.values(openPos).flat().map(t => t.market_slug))];
  const prices      = fetchPricesForSlugs(uniqueSlugs);

  return {
    botStatus,
    balance:       getBalance(),
    subscriptions: copyList,
    stats:         computeStats(log.trades, prices),
    traderStats:   computeTraderStats(log.trades, copyList),
    recentTrades:  [...log.trades].reverse().slice(0, 100),
    errors:        (log.errors || []).slice(-10).reverse(),
    lastUpdated:   log.lastUpdated,
  };
}

async function botAction(action) {
  const copyList = bullpen('tracker copy list --output json') || [];
  for (const sub of copyList) {
    if (action === 'pause' && sub.status !== 'Paused') {
      bullpen(`tracker copy pause ${sub.id}`);
    } else if (action === 'resume' && sub.status === 'Paused') {
      bullpen(`tracker copy resume ${sub.id}`);
    }
  }
}

// ── HTML ──────────────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Copy Bot Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#d0d0d0;font-family:'JetBrains Mono','Fira Code','Courier New',monospace;font-size:12px;padding:14px;min-height:100vh}
/* ── Header ── */
.header{display:flex;align-items:center;gap:12px;padding:11px 16px;background:#111;border:1px solid #222;border-radius:4px;margin-bottom:10px}
.title{font-size:15px;font-weight:700;color:#fff;letter-spacing:3px}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.dot.active{background:#00ff88;box-shadow:0 0 6px #00ff8866;animation:pulse 2s infinite}
.dot.paused{background:#ff4444}
.dot.unknown{background:#555}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
.status-label{font-size:11px;letter-spacing:1px}
.active-label{color:#00ff88}
.paused-label{color:#ff4444}
.unknown-label{color:#555}
.btn{padding:5px 13px;border:1px solid;border-radius:3px;cursor:pointer;font-family:inherit;font-size:10px;font-weight:700;letter-spacing:1.5px;transition:background .15s;background:transparent}
.btn-red{border-color:#ff4444;color:#ff4444}.btn-red:hover{background:#ff444418}
.btn-green{border-color:#00ff88;color:#00ff88}.btn-green:hover{background:#00ff8818}
.btn:disabled{opacity:.4;cursor:default}
.spacer{flex:1}
.refresh-badge{color:#333;font-size:10px}
/* ── Stats row ── */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
.card{background:#111;border:1px solid #1e1e1e;border-radius:4px;padding:13px 15px}
.card-label{color:#444;font-size:9px;letter-spacing:2px;text-transform:uppercase;margin-bottom:5px}
.card-value{font-size:20px;font-weight:700;line-height:1}
.card-sub{color:#444;font-size:10px;margin-top:5px}
.pos{color:#00ff88}.neg{color:#ff4444}.neu{color:#d0d0d0}.yel{color:#ffd700}
/* ── Main grid ── */
.grid{display:grid;grid-template-columns:1fr 300px;gap:8px}
/* ── Panel ── */
.panel{background:#111;border:1px solid #1e1e1e;border-radius:4px;overflow:hidden}
.panel-head{display:flex;align-items:center;gap:8px;padding:9px 14px;border-bottom:1px solid #1a1a1a;color:#444;font-size:9px;letter-spacing:2px;text-transform:uppercase}
.filter-group{display:flex;gap:3px;margin-left:auto}
.fbtn{padding:2px 8px;border:1px solid #1e1e1e;border-radius:2px;cursor:pointer;font-family:inherit;font-size:9px;background:transparent;color:#444;letter-spacing:1px;transition:all .1s}
.fbtn.on{border-color:#333;color:#aaa}
/* ── Trade rows ── */
.feed{max-height:520px;overflow-y:auto}
.trow{display:grid;grid-template-columns:6px 44px 130px 1fr 54px 70px;align-items:center;gap:8px;padding:7px 14px;border-bottom:1px solid #141414;transition:background .08s;cursor:default}
.trow:hover{background:#161616}
.tdot{width:5px;height:5px;border-radius:50%}
.bdot{background:#00ff88}.sdot{background:#ff4444}
.badge{font-size:9px;font-weight:700;padding:2px 5px;border-radius:2px;text-align:center;letter-spacing:.5px}
.bbadge{background:#00ff8812;color:#00ff88;border:1px solid #00ff8830}
.sbadge{background:#ff444412;color:#ff4444;border:1px solid #ff444430}
.ttrader{color:#888;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tmarket{color:#c0c0c0;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tamt{color:#666;font-size:10px;text-align:right}
.tstatus{font-size:9px;text-align:right}
.s-ok{color:#00ff88}.s-pend{color:#ffd700}.s-fail{color:#ff4444}.s-skip{color:#333}
/* ── Right column ── */
.rside{display:flex;flex-direction:column;gap:8px}
.trader-row{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid #141414}
.tr-nick{color:#c0c0c0;font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tr-count{color:#444;font-size:10px}
.tr-dep{color:#666;font-size:10px;min-width:44px;text-align:right}
.err-row{padding:5px 14px;color:#ff4444;font-size:9px;border-bottom:1px solid #141414;word-break:break-all}
.empty{padding:12px 14px;color:#2a2a2a;font-size:10px}
/* ── Scrollbar ── */
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#0a0a0a}::-webkit-scrollbar-thumb{background:#222;border-radius:2px}
.footer{color:#222;font-size:9px;text-align:center;margin-top:8px}
</style>
</head>
<body>

<div class="header">
  <div class="dot unknown" id="dot"></div>
  <div class="title">COPY BOT</div>
  <div class="status-label unknown-label" id="statusLabel">—</div>
  <button class="btn" id="toggleBtn" onclick="toggleBot()" disabled>...</button>
  <div class="spacer"></div>
  <div class="refresh-badge" id="refreshBadge">refresh in 30s</div>
</div>

<div class="stats">
  <div class="card">
    <div class="card-label">Balance</div>
    <div class="card-value neu" id="statBalance">—</div>
    <div class="card-sub" id="statBalanceSub">Polymarket · Polygon</div>
  </div>
  <div class="card">
    <div class="card-label">Total PnL</div>
    <div class="card-value neu" id="statPnl">—</div>
    <div class="card-sub" id="statPnlSub">loading…</div>
  </div>
  <div class="card">
    <div class="card-label">Win Rate</div>
    <div class="card-value yel" id="statWin">—</div>
    <div class="card-sub" id="statWinSub">of decided trades</div>
  </div>
  <div class="card">
    <div class="card-label">Trades</div>
    <div class="card-value neu" id="statTrades">—</div>
    <div class="card-sub" id="statTradesSub">— W / — L · — open</div>
  </div>
</div>

<div class="grid">
  <div class="panel">
    <div class="panel-head">
      Trade Feed
      <div class="filter-group">
        <button class="fbtn on" id="fAll"  onclick="setFilter('all',this)">ALL</button>
        <button class="fbtn"    id="fBuy"  onclick="setFilter('BUY',this)">BUYS</button>
        <button class="fbtn"    id="fSell" onclick="setFilter('SELL',this)">SELLS</button>
      </div>
    </div>
    <div class="feed" id="feed"><div class="empty">Loading…</div></div>
  </div>

  <div class="rside">
    <div class="panel">
      <div class="panel-head">Traders</div>
      <div id="traderList"><div class="empty">Loading…</div></div>
    </div>
    <div class="panel">
      <div class="panel-head">Errors <span id="errCount" style="color:#ff4444"></span></div>
      <div id="errList"><div class="empty">No errors</div></div>
    </div>
  </div>
</div>

<div class="footer" id="footer"></div>

<script>
let filter = 'all';
let allTrades = [];
let countdown = 30;
let timer;

const STATUS_CLASS = { executed:'s-ok', completed:'s-ok', active:'s-ok', pending:'s-pend', failed:'s-fail', 'skipped-no-position':'s-skip' };
const STATUS_ICON  = { executed:'✓', completed:'✓', active:'✓', pending:'⏳', failed:'✗', 'skipped-no-position':'—' };

function setFilter(f, btn) {
  filter = f;
  ['fAll','fBuy','fSell'].forEach(id => document.getElementById(id).classList.remove('on'));
  btn.classList.add('on');
  renderFeed();
}

function renderFeed() {
  const trades = filter === 'all' ? allTrades : allTrades.filter(t => t.side === filter);
  const el = document.getElementById('feed');
  if (!trades.length) { el.innerHTML = '<div class="empty">No trades yet</div>'; return; }
  el.innerHTML = trades.map(t => {
    const buy = t.side === 'BUY';
    const sc  = STATUS_CLASS[t.copy_status] || 's-pend';
    const si  = STATUS_ICON[t.copy_status]  || '⏳';
    const label = t.market_title ? \`\${t.outcome} — \${t.market_title}\` : t.market_slug;
    const price = t.trader_price ? \`@ \${(t.trader_price*100).toFixed(0)}¢\` : '';
    return \`<div class="trow">
      <div class="tdot \${buy?'bdot':'sdot'}"></div>
      <div class="badge \${buy?'bbadge':'sbadge'}">\${t.side}</div>
      <div class="ttrader" title="\${t.trader_nickname}">\${t.trader_nickname}</div>
      <div class="tmarket" title="\${label}">\${label}</div>
      <div class="tamt">\${price}</div>
      <div class="tstatus \${sc}">\${si} \${t.copy_status}</div>
    </div>\`;
  }).join('');
}

function fmt(n, prefix='') {
  if (n == null) return '—';
  const abs = Math.abs(n).toFixed(2);
  return (n >= 0 ? '+' : '-') + prefix + abs;
}

function update(d) {
  const { botStatus, stats, traderStats, recentTrades, errors, lastUpdated } = d;

  // Header
  const dot    = document.getElementById('dot');
  const lbl    = document.getElementById('statusLabel');
  const btn    = document.getElementById('toggleBtn');
  dot.className = 'dot ' + botStatus;
  if (botStatus === 'active') {
    lbl.textContent = 'RUNNING'; lbl.className = 'status-label active-label';
    btn.textContent = 'PAUSE BOT'; btn.className = 'btn btn-red';
  } else if (botStatus === 'paused') {
    lbl.textContent = 'PAUSED'; lbl.className = 'status-label paused-label';
    btn.textContent = 'RESUME BOT'; btn.className = 'btn btn-green';
  } else {
    lbl.textContent = 'UNKNOWN'; lbl.className = 'status-label unknown-label';
    btn.textContent = '—'; btn.className = 'btn';
  }
  btn.disabled = botStatus === 'unknown';

  // Balance
  document.getElementById('statBalance').textContent = '$' + (d.balance?.polymarket ?? 0).toFixed(2);

  // Stats
  const pnl = stats.totalPnL;
  const pnlEl = document.getElementById('statPnl');
  pnlEl.textContent = fmt(pnl, '$');
  pnlEl.className = 'card-value ' + (pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : 'neu');
  document.getElementById('statPnlSub').textContent =
    \`unrealized \${fmt(stats.unrealizedPnL,'$')} / realized \${fmt(stats.realizedPnL,'$')}\`;

  const wr = stats.winRate;
  document.getElementById('statWin').textContent = wr != null ? wr + '%' : '—';
  document.getElementById('statWinSub').textContent = \`\${stats.resolvedWins}W / \${stats.resolvedLosses}L decided\`;

  document.getElementById('statTrades').textContent = stats.totalTrades;
  document.getElementById('statTradesSub').textContent =
    \`\${stats.resolvedWins} W / \${stats.resolvedLosses} L · \${stats.openPositionCount} open\`;

  // Feed
  allTrades = recentTrades;
  renderFeed();

  // Traders
  const tl = document.getElementById('traderList');
  tl.innerHTML = traderStats.length
    ? traderStats.map(t => \`<div class="trader-row">
        <div class="tr-nick" title="\${t.nickname}">\${t.nickname}</div>
        <div class="tr-count">\${t.trades} trades</div>
        <div class="tr-dep">$\${t.deployed.toFixed(0)}</div>
      </div>\`).join('')
    : '<div class="empty">No data</div>';

  // Errors
  const el = document.getElementById('errList');
  const ec = document.getElementById('errCount');
  ec.textContent = errors.length ? \`(\${errors.length})\` : '';
  el.innerHTML = errors.length
    ? errors.map(e => \`<div class="err-row">\${(e.timestamp||'').slice(0,16)} \${e.trader||e.source||''}: \${e.error}</div>\`).join('')
    : '<div class="empty">No errors</div>';

  document.getElementById('footer').textContent =
    lastUpdated ? 'log last updated: ' + new Date(lastUpdated).toLocaleString() : '';
}

async function fetchData() {
  try {
    const r = await fetch('/api/data');
    const d = await r.json();
    update(d);
  } catch(e) { console.error(e); }
}

async function toggleBot() {
  const btn = document.getElementById('toggleBtn');
  const lbl = document.getElementById('statusLabel').textContent;
  btn.disabled = true;
  try {
    const action = lbl === 'RUNNING' ? 'pause' : 'resume';
    await fetch('/api/bot/' + action, { method: 'POST' });
    await fetchData();
  } catch(e) { console.error(e); }
  btn.disabled = false;
}

function startCountdown() {
  clearInterval(timer);
  countdown = 30;
  timer = setInterval(() => {
    countdown--;
    document.getElementById('refreshBadge').textContent = \`refresh in \${countdown}s\`;
    if (countdown <= 0) { countdown = 30; fetchData(); }
  }, 1000);
}

fetchData().then(startCountdown);
</script>
</body>
</html>`;

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url    = req.url;
  const method = req.method;

  if (url === '/' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  if (url === '/api/data' && method === 'GET') {
    try {
      const data = getApiData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url === '/api/bot/pause' && method === 'POST') {
    await botAction('pause');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url === '/api/bot/resume' && method === 'POST') {
    await botAction('resume');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`╔══════════════════════════════════════╗`);
  console.log(`║   Copy Bot Dashboard                 ║`);
  console.log(`╚══════════════════════════════════════╝`);
  console.log(`→  http://localhost:${PORT}`);
  console.log(`   Press Ctrl+C to stop.\n`);
  // Auto-open in browser on Mac
  try { execSync(`open http://localhost:${PORT}`); } catch {}
});
