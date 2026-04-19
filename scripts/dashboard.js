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
    const raw = execSync(`bullpen ${args}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, BULLPEN_NON_INTERACTIVE: 'true' },
    });
    const start = raw.search(/[{[]/);
    return JSON.parse(start >= 0 ? raw.slice(start) : raw);
  } catch {
    return null;
  }
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function loadLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  } catch {
    return { trades: [], errors: [], stats: {}, lastUpdated: null };
  }
}

// Build positionMap from `bullpen polymarket positions`
// key: "slug::outcome" → { current_price, end_date, unrealized_pnl, invested_usd, current_value, outcome }
// outcome: 'win' | 'loss' | 'open'
function fetchPositionMap() {
  const data = bullpen('polymarket positions --output json');
  if (!data?.positions) return {};
  const today = new Date();
  const map = {};
  for (const p of data.positions) {
    const price   = parseFloat(p.current_price);
    const endDate = new Date(p.end_date);
    let outcome;
    if (price >= 0.95)                           outcome = 'win';
    else if (price <= 0.05 && endDate <= today)  outcome = 'loss';
    else                                          outcome = 'open';

    map[`${p.slug}::${p.outcome}`] = {
      current_price:  price,
      end_date:       p.end_date,
      redeemable:     p.redeemable,
      unrealized_pnl: parseFloat(p.unrealized_pnl),
      invested_usd:   parseFloat(p.invested_usd),
      current_value:  parseFloat(p.current_value),
      market_title:   p.market,
      outcome,
    };
  }
  return map;
}

function tradeOutcome(trade, posMap) {
  if (trade.side !== 'BUY') return null;
  const pos = posMap[`${trade.market_slug}::${trade.outcome}`];
  if (!pos) return 'resolved'; // redeemed or fully closed
  return pos.outcome;          // 'win' | 'loss' | 'open'
}

function computeStats(trades, posMap) {
  const buys = trades.filter(t => t.side === 'BUY' && t.copy_status !== 'failed');

  // Sum unrealized PnL once per unique slug::outcome (positions aggregate multiple trades)
  let unrealizedPnL = 0;
  const seenPos = new Set();
  for (const t of buys) {
    const key = `${t.market_slug}::${t.outcome}`;
    if (seenPos.has(key)) continue;
    seenPos.add(key);
    const pos = posMap[key];
    if (pos) unrealizedPnL += pos.unrealized_pnl;
  }

  // W/L only from positions with decided price
  let wins = 0, losses = 0, open = 0;
  const seenDecided = new Set();
  for (const t of buys) {
    const key = `${t.market_slug}::${t.outcome}`;
    if (seenDecided.has(key)) continue;
    seenDecided.add(key);
    const pos = posMap[key];
    if (!pos) continue;
    if (pos.outcome === 'win')        wins++;
    else if (pos.outcome === 'loss')  losses++;
    else                              open++;
  }

  const totalDecided = wins + losses;
  return {
    totalTrades:   buys.length,
    totalDeployed: buys.reduce((s, t) => s + (t.our_amount_usd || 5), 0),
    unrealizedPnL,
    realizedPnL:   0,
    totalPnL:      unrealizedPnL,
    wins, losses,
    winRate:       totalDecided > 0 ? Math.round(wins / totalDecided * 100) : null,
    openCount:     open,
  };
}

function computeTraderStats(trades, subscriptions, posMap) {
  const byTrader = {};
  for (const sub of (subscriptions || [])) {
    if (sub.status !== 'Active') continue;
    const n = sub.nickname || (sub.followed_address || '').slice(0, 10) + '…';
    byTrader[n] = { nickname: n, trades: 0, deployed: 0, wins: 0, losses: 0 };
  }
  for (const t of trades) {
    if (t.side !== 'BUY' || t.copy_status === 'failed' || t.copy_status === 'skipped') continue;
    const n = t.trader_nickname;
    if (!byTrader[n]) byTrader[n] = { nickname: n, trades: 0, deployed: 0, wins: 0, losses: 0 };
    byTrader[n].trades++;
    byTrader[n].deployed += t.our_amount_usd || 5;
    const oc = tradeOutcome(t, posMap);
    if (oc === 'win')        byTrader[n].wins++;
    else if (oc === 'loss')  byTrader[n].losses++;
  }
  return Object.values(byTrader).sort((a, b) => b.trades - a.trades);
}

function getBalance() {
  const data = bullpen('portfolio balances --output json');
  if (!data) return { total: 0, polymarket: 0 };
  const poly = (data.chains || []).find(c => c.chain_name === 'Polygon');
  return { total: data.total_usd || 0, polymarket: poly?.total_usd || 0 };
}

function getApiData() {
  const log      = loadLog();
  const copyList = bullpen('tracker copy list --output json') || [];
  const active   = copyList.filter(s => s.status === 'Active');
  const botStatus = copyList.length === 0 ? 'unknown'
    : active.length === 0 ? 'paused' : 'active';

  const posMap = fetchPositionMap();

  const enriched = [...log.trades].reverse().slice(0, 100).map(t => ({
    ...t,
    tradeOutcome: tradeOutcome(t, posMap),
    currentPrice: posMap[`${t.market_slug}::${t.outcome}`]?.current_price ?? null,
  }));

  return {
    botStatus,
    balance:      getBalance(),
    subscriptions: copyList,
    stats:        computeStats(log.trades, posMap),
    traderStats:  computeTraderStats(log.trades, copyList, posMap),
    recentTrades: enriched,
    errors:       (log.errors || []).slice(-10).reverse(),
    lastUpdated:  log.lastUpdated,
  };
}

async function botAction(action) {
  const copyList = bullpen('tracker copy list --output json') || [];
  for (const sub of copyList) {
    if (action === 'pause' && sub.status === 'Active')  bullpen(`tracker copy pause ${sub.id}`);
    if (action === 'resume' && sub.status === 'Paused') bullpen(`tracker copy resume ${sub.id}`);
  }
}

// ── HTML ──────────────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Copy Bot</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#080c10;--surface:#0d1117;--surface2:#111820;
  --border:#1e2633;--border2:#252d3a;
  --green:#3fb950;--red:#f85149;--yellow:#d29922;--blue:#58a6ff;--purple:#bc8cff;
  --text:#c9d1d9;--muted:#6e7681;--dimmed:#30363d;
}
body{background:var(--bg);color:var(--text);font-family:'JetBrains Mono','Fira Code','Courier New',monospace;font-size:11px;padding:12px;min-height:100vh;line-height:1.4}

/* ── Header ── */
.hdr{display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--surface);border:1px solid var(--border);border-radius:6px;margin-bottom:10px}
.title{font-size:13px;font-weight:700;color:#fff;letter-spacing:4px}
.dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.dot.active{background:var(--green);box-shadow:0 0 8px #3fb95066;animation:pulse 2s infinite}
.dot.paused{background:var(--red)}
.dot.unknown{background:var(--dimmed)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.status-lbl{font-size:10px;letter-spacing:2px}
.lbl-active{color:var(--green)}.lbl-paused{color:var(--red)}.lbl-unknown{color:var(--muted)}
.spacer{flex:1}
.badge-uptime{font-size:9px;color:var(--dimmed);letter-spacing:1px}
.btn{padding:5px 14px;border:1px solid;border-radius:4px;cursor:pointer;font-family:inherit;font-size:9px;font-weight:700;letter-spacing:2px;transition:all .15s;background:transparent}
.btn-red{border-color:var(--red);color:var(--red)}.btn-red:hover{background:#f8514918}
.btn-green{border-color:var(--green);color:var(--green)}.btn-green:hover{background:#3fb95018}
.btn:disabled{opacity:.3;cursor:default}

/* ── Stats row ── */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:14px 16px;position:relative;overflow:hidden}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
.card.c-bal::before{background:linear-gradient(90deg,var(--blue),transparent)}
.card.c-pnl::before{background:linear-gradient(90deg,var(--green),transparent)}
.card.c-wr::before{background:linear-gradient(90deg,var(--yellow),transparent)}
.card.c-trades::before{background:linear-gradient(90deg,var(--purple),transparent)}
.card-lbl{color:var(--muted);font-size:8px;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:6px}
.card-val{font-size:22px;font-weight:700;line-height:1;margin-bottom:4px}
.card-sub{color:var(--muted);font-size:9px}
.card-sub2{color:var(--dimmed);font-size:9px;margin-top:2px}
.pos{color:var(--green)}.neg{color:var(--red)}.neu{color:var(--text)}.yel{color:var(--yellow)}.blu{color:var(--blue)}

/* ── Layout ── */
.layout{display:grid;grid-template-columns:1fr 310px;gap:8px;margin-bottom:8px}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:6px;overflow:hidden}
.ph{display:flex;align-items:center;gap:8px;padding:9px 14px;border-bottom:1px solid var(--border2);color:var(--muted);font-size:10px;letter-spacing:2px;text-transform:uppercase;background:var(--surface2)}
.ph-count{color:var(--dimmed);font-size:9px}
.filters{display:flex;gap:3px;margin-left:auto}
.fb{padding:3px 9px;border:1px solid var(--dimmed);border-radius:3px;cursor:pointer;font-family:inherit;font-size:10px;background:transparent;color:var(--muted);letter-spacing:1px;transition:all .1s}
.fb.on{border-color:var(--border2);color:var(--text);background:var(--surface)}

/* ── Trade feed ── */
.feed{max-height:580px;overflow-y:auto}
.trow{display:grid;grid-template-columns:38px 46px 110px 1fr 46px 70px 52px;align-items:center;gap:6px;padding:7px 14px;border-bottom:1px solid #0d1117;transition:background .08s}
.trow:hover{background:var(--surface2)}
.side-b{font-size:10px;font-weight:700;padding:2px 5px;border-radius:3px;text-align:center;background:#3fb95014;color:var(--green);border:1px solid #3fb95030;letter-spacing:.5px}
.side-s{font-size:10px;font-weight:700;padding:2px 5px;border-radius:3px;text-align:center;background:#f8514914;color:var(--red);border:1px solid #f8514930;letter-spacing:.5px}
.tprice{font-size:10px;color:var(--muted);text-align:right}
.ttrader{color:var(--blue);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tmarket{color:var(--text);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tstatus{font-size:10px;text-align:right;color:var(--muted)}
.s-ok{color:var(--green)}.s-pend{color:var(--yellow)}.s-fail{color:var(--red)}.s-skip{color:var(--dimmed)}
.outcome-badge{font-size:10px;font-weight:700;padding:2px 6px;border-radius:3px;text-align:center;letter-spacing:.5px;white-space:nowrap}
.ob-win{background:#3fb95018;color:var(--green);border:1px solid #3fb95040}
.ob-loss{background:#f8514918;color:var(--red);border:1px solid #f8514940}
.ob-open{background:#58a6ff10;color:var(--blue);border:1px solid #58a6ff30}
.ob-resolved{background:#bc8cff10;color:var(--purple);border:1px solid #bc8cff30}
.ob-null{color:var(--dimmed);font-size:10px;text-align:center}

/* ── Resolved section (in sidebar) ── */
.rrow{display:grid;grid-template-columns:22px 1fr 56px;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #0d1117;transition:background .08s}
.rrow:hover{background:var(--surface2)}
.ricon-w{font-size:13px;font-weight:700;color:var(--green);text-align:center}
.ricon-l{font-size:13px;font-weight:700;color:var(--red);text-align:center}
.ricon-o{font-size:13px;font-weight:700;color:var(--blue);text-align:center}
.rmarket{color:var(--text);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rtrader{color:var(--muted);font-size:10px;margin-top:2px}
.rprice{font-size:9px;color:var(--dimmed)}
.rpnl{font-size:11px;font-weight:700;text-align:right}
#resolvedList{max-height:220px;overflow-y:auto}

/* ── Right sidebar ── */
.rside{display:flex;flex-direction:column;gap:8px}
.trader-row{display:flex;align-items:center;gap:0;padding:8px 12px;border-bottom:1px solid #0d1117;flex-wrap:wrap;transition:background .08s}
.trader-row:hover{background:var(--surface2)}
.tr-nick{color:var(--text);font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.tr-trades{color:var(--muted);font-size:10px;margin-left:8px;white-space:nowrap}
.tr-dep{color:var(--muted);font-size:10px;min-width:32px;text-align:right}
.tr-record{width:100%;margin-top:3px;font-size:10px;color:var(--dimmed)}
.tr-w{color:var(--green)}.tr-l{color:var(--red)}
#traderList{max-height:200px;overflow-y:auto}

.err-row{padding:6px 12px;color:var(--red);font-size:10px;border-bottom:1px solid #0d1117;word-break:break-all}
.err-ts{color:var(--dimmed);margin-right:6px}
#errList{max-height:110px;overflow-y:auto}
.empty{padding:12px 14px;color:var(--dimmed);font-size:10px;text-align:center}

/* ── Scrollbar ── */
::-webkit-scrollbar{width:3px;height:3px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--dimmed);border-radius:2px}
.footer{color:var(--dimmed);font-size:8px;text-align:center;margin-top:4px;letter-spacing:1px}
</style>
</head>
<body>

<div class="hdr">
  <div class="dot unknown" id="dot"></div>
  <div class="title">COPY BOT</div>
  <div class="status-lbl lbl-unknown" id="statusLbl">—</div>
  <button class="btn" id="toggleBtn" onclick="toggleBot()" disabled>...</button>
  <div class="spacer"></div>
  <div class="badge-uptime" id="refreshBadge">refresh in 30s</div>
</div>

<div class="stats">
  <div class="card c-bal">
    <div class="card-lbl">Balance</div>
    <div class="card-val blu" id="statBalance">—</div>
    <div class="card-sub">Polymarket · Polygon</div>
  </div>
  <div class="card c-pnl">
    <div class="card-lbl">Unrealized P&amp;L</div>
    <div class="card-val neu" id="statUnrealized">—</div>
    <div class="card-sub" id="statUnrealizedSub">open positions</div>
  </div>
  <div class="card c-wr">
    <div class="card-lbl">Win Rate</div>
    <div class="card-val yel" id="statWin">—</div>
    <div class="card-sub" id="statWinSub">resolved only</div>
  </div>
  <div class="card c-trades">
    <div class="card-lbl">Trades</div>
    <div class="card-val neu" id="statTrades">—</div>
    <div class="card-sub" id="statTradesSub">— W · — L · — open</div>
  </div>
</div>

<div class="layout">
  <div class="panel">
    <div class="ph">
      Trade Feed <span class="ph-count" id="feedCount"></span>
      <div class="filters">
        <button class="fb on" id="fAll"  onclick="setFilter('all',this)">ALL</button>
        <button class="fb"    id="fBuy"  onclick="setFilter('BUY',this)">BUYS</button>
        <button class="fb"    id="fSell" onclick="setFilter('SELL',this)">SELLS</button>
      </div>
    </div>
    <div class="feed" id="feed"><div class="empty">Loading…</div></div>
  </div>

  <div class="rside">
    <div class="panel">
      <div class="ph">Traders <span class="ph-count" id="traderCount"></span></div>
      <div id="traderList"><div class="empty">Loading…</div></div>
    </div>
    <div class="panel">
      <div class="ph">Positions <span class="ph-count" id="resolvedCount"></span></div>
      <div id="resolvedList"><div class="empty">Loading…</div></div>
    </div>
    <div class="panel">
      <div class="ph">Errors <span class="ph-count" id="errCount" style="color:var(--red)"></span></div>
      <div id="errList"><div class="empty">No errors</div></div>
    </div>
  </div>
</div>

<div class="footer" id="footer"></div>

<script>
let filter = 'all';
let allTrades = [];
let timer;
let countdown = 30;

const STATUS_CLASS = {
  executed:'s-ok', completed:'s-ok', active:'s-ok',
  pending:'s-pend', failed:'s-fail', skipped:'s-skip', 'skipped-no-position':'s-skip'
};
const STATUS_ICON = {
  executed:'✓', completed:'✓', active:'✓', pending:'⏳', failed:'✗',
  skipped:'—', 'skipped-no-position':'—'
};

function setFilter(f, btn) {
  filter = f;
  ['fAll','fBuy','fSell'].forEach(id => document.getElementById(id).classList.remove('on'));
  btn.classList.add('on');
  renderFeed();
}

function outcomeBadge(t) {
  if (t.side === 'SELL') return '<span class="ob-null">—</span>';
  const oc = t.tradeOutcome;
  if (!oc) return '<span class="ob-null">—</span>';
  if (oc === 'win')      return '<span class="outcome-badge ob-win">WIN</span>';
  if (oc === 'loss')     return '<span class="outcome-badge ob-loss">LOSS</span>';
  if (oc === 'open')     return '<span class="outcome-badge ob-open">OPEN</span>';
  if (oc === 'resolved') return '<span class="outcome-badge ob-resolved">CLOSED</span>';
  return '<span class="ob-null">—</span>';
}

function renderFeed() {
  const trades = filter === 'all' ? allTrades : allTrades.filter(t => t.side === filter);
  const el = document.getElementById('feed');
  document.getElementById('feedCount').textContent = trades.length ? \`(\${trades.length})\` : '';
  if (!trades.length) { el.innerHTML = '<div class="empty">No trades yet</div>'; return; }
  el.innerHTML = trades.map(t => {
    const isBuy = t.side === 'BUY';
    const sc  = STATUS_CLASS[t.copy_status] || 's-pend';
    const si  = STATUS_ICON[t.copy_status]  || '⏳';
    const label = t.market_title && t.market_title !== t.market_slug
      ? \`\${t.outcome} — \${t.market_title}\`
      : \`\${t.outcome} — \${t.market_slug}\`;
    const price = t.trader_price ? \`\${(t.trader_price*100).toFixed(0)}¢\` : '';
    return \`<div class="trow">
      <div class="\${isBuy?'side-b':'side-s'}">\${t.side}</div>
      <div>\${outcomeBadge(t)}</div>
      <div class="ttrader" title="\${t.trader_nickname}">\${t.trader_nickname}</div>
      <div class="tmarket" title="\${label}">\${label}</div>
      <div class="tprice">\${price}</div>
      <div class="tstatus \${sc}">\${si} \${t.copy_status}</div>
      <div class="tprice">\${t.currentPrice != null ? (t.currentPrice*100).toFixed(0)+'¢ now' : ''}</div>
    </div>\`;
  }).join('');
}

function renderResolved(trades) {
  const resolved = trades.filter(t => t.side === 'BUY' && (t.tradeOutcome === 'win' || t.tradeOutcome === 'loss' || t.tradeOutcome === 'open'));
  document.getElementById('resolvedCount').textContent = resolved.length ? \`(\${resolved.length})\` : '';
  const el = document.getElementById('resolvedList');
  if (!resolved.length) { el.innerHTML = '<div class="empty">No positions yet</div>'; return; }
  el.innerHTML = resolved.map(t => {
    const oc = t.tradeOutcome;
    const iconClass = oc === 'win' ? 'ricon-w' : oc === 'loss' ? 'ricon-l' : 'ricon-o';
    const iconText  = oc === 'win' ? 'W' : oc === 'loss' ? 'L' : '~';
    const pnlAmt = t.currentPrice != null && t.trader_price
      ? ((t.our_amount_usd / t.trader_price) * t.currentPrice - t.our_amount_usd)
      : null;
    const pnlStr = pnlAmt != null
      ? \`<span class="\${pnlAmt>=0?'pos':'neg'}">\${pnlAmt>=0?'+':''}\$\${pnlAmt.toFixed(2)}</span>\`
      : '—';
    const title = t.market_title && t.market_title !== t.market_slug ? t.market_title : t.market_slug;
    const cur   = t.currentPrice != null ? (t.currentPrice*100).toFixed(0)+'¢' : '';
    return \`<div class="rrow">
      <div class="\${iconClass}">\${iconText}</div>
      <div>
        <div class="rmarket" title="\${title}">\${t.outcome} — \${title}</div>
        <div class="rtrader">\${t.trader_nickname}\${cur ? ' · '+cur+' now' : ''}</div>
      </div>
      <div class="rpnl">\${pnlStr}</div>
    </div>\`;
  }).join('');
}

function fmt(n, prefix='$') {
  if (n == null) return '—';
  return (n >= 0 ? '+' : '-') + prefix + Math.abs(n).toFixed(2);
}

function update(d) {
  const { botStatus, stats, traderStats, recentTrades, errors, lastUpdated } = d;

  // Header
  const dot = document.getElementById('dot');
  const lbl = document.getElementById('statusLbl');
  const btn = document.getElementById('toggleBtn');
  dot.className = 'dot ' + botStatus;
  if (botStatus === 'active') {
    lbl.textContent = 'RUNNING'; lbl.className = 'status-lbl lbl-active';
    btn.textContent = 'PAUSE'; btn.className = 'btn btn-red';
  } else if (botStatus === 'paused') {
    lbl.textContent = 'PAUSED'; lbl.className = 'status-lbl lbl-paused';
    btn.textContent = 'RESUME'; btn.className = 'btn btn-green';
  } else {
    lbl.textContent = 'UNKNOWN'; lbl.className = 'status-lbl lbl-unknown';
    btn.textContent = '—'; btn.className = 'btn';
  }
  btn.disabled = botStatus === 'unknown';

  // Balance
  document.getElementById('statBalance').textContent = '$' + (d.balance?.polymarket ?? 0).toFixed(2);

  // Unrealized PnL
  const ur = stats.unrealizedPnL;
  const urEl = document.getElementById('statUnrealized');
  urEl.textContent = fmt(ur);
  urEl.className = 'card-val ' + (ur > 0 ? 'pos' : ur < 0 ? 'neg' : 'neu');
  document.getElementById('statUnrealizedSub').textContent = \`\${stats.openCount} position\${stats.openCount===1?'':'s'} open\`;

  // Win rate
  const wr = stats.winRate;
  document.getElementById('statWin').textContent = wr != null ? wr + '%' : '—';
  document.getElementById('statWinSub').textContent = \`\${stats.wins}W / \${stats.losses}L decided\`;

  // Trades
  document.getElementById('statTrades').textContent = stats.totalTrades;
  document.getElementById('statTradesSub').textContent =
    \`\${stats.wins} W · \${stats.losses} L · \${stats.openCount} open\`;

  // Feed
  allTrades = recentTrades;
  renderFeed();
  renderResolved(recentTrades);

  // Traders
  const tl = document.getElementById('traderList');
  document.getElementById('traderCount').textContent = traderStats.length ? \`(\${traderStats.length})\` : '';
  tl.innerHTML = traderStats.length
    ? traderStats.map(t => {
        const record = (t.wins + t.losses > 0)
          ? \`<span class="tr-w">\${t.wins}W</span> / <span class="tr-l">\${t.losses}L</span>\`
          : '<span style="color:var(--dimmed)">no resolved</span>';
        return \`<div class="trader-row">
          <div class="tr-nick" title="\${t.nickname}">\${t.nickname}</div>
          <div class="tr-trades">\${t.trades}t</div>
          <div class="tr-dep">$\${t.deployed.toFixed(0)}</div>
          <div class="tr-record">\${record}</div>
        </div>\`;
      }).join('')
    : '<div class="empty">No active traders</div>';

  // Errors
  const ec = document.getElementById('errCount');
  const el = document.getElementById('errList');
  ec.textContent = errors.length ? \`(\${errors.length})\` : '';
  el.innerHTML = errors.length
    ? errors.map(e => \`<div class="err-row"><span class="err-ts">\${(e.timestamp||'').slice(0,16)}</span>\${e.source||''}: \${e.error}</div>\`).join('')
    : '<div class="empty">No errors</div>';

  document.getElementById('footer').textContent =
    lastUpdated ? 'log updated ' + new Date(lastUpdated).toLocaleTimeString() : '';
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
  btn.disabled = true;
  try {
    const action = document.getElementById('statusLbl').textContent === 'RUNNING' ? 'pause' : 'resume';
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
  const { url, method } = req;

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
  try { execSync(`open http://localhost:${PORT}`); } catch {}
});
