#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

if (!process.env.TG_TOKEN) {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m) process.env[m[1]] = m[2].trim();
    }
  }
}

// ── Config ─────────────────────────────────────────────────────────────────────

const TG_TOKEN    = process.env.TG_TOKEN;
const TG_CHAT     = process.env.TG_CHAT;
const LOG_FILE    = path.join(__dirname, '..', 'rotation-log.json');
const TARGET_SIZE = 10;

// Per-subscription settings applied to every new trader added
const SUB_SETTINGS = {
  amount:          5,
  budget:          200,
  minTradeSize:    5,
  priceRangeMin:   0.05,
  priceRangeMax:   0.71,
  executionMode:   'auto',
  exitBehavior:    'mirror_sells',
  slippage:        3,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function tg(text) {
  const body = JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML' });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${TG_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  });
  req.on('error', () => {});
  req.write(body);
  req.end();
}

function bullpen(args) {
  return JSON.parse(
    execSync(`bullpen ${args}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  );
}

function loadLog() {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); }
  catch { return { rotations: [] }; }
}

function saveLog(log) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

function label(address, username) {
  // Use x_username if available, fall back to truncated address
  if (username && !username.startsWith('0x')) return username.split('-')[0];
  return address.slice(0, 10) + '…';
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function rotate() {
  const now = new Date().toISOString();
  const ts  = `[${now}]`;
  const errors = [];

  console.log('╔══════════════════════════════════════╗');
  console.log('║     Polymarket Trader Rotation       ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`${ts} Starting rotation...\n`);

  // ── Step 1: Fetch leaderboard ───────────────────────────────────────────────
  let leaderboard;
  try {
    leaderboard = bullpen('polymarket data leaderboard --period week --output json');
    console.log(`${ts} Leaderboard: ${leaderboard.length} entries returned`);
  } catch (err) {
    const msg = `Leaderboard fetch failed: ${err.message}`;
    console.error(`${ts} ERROR: ${msg}`);
    tg(`⚠️ Rotation error: ${msg}`);
    process.exit(1);
  }

  // ── Step 2: Filter and rank ─────────────────────────────────────────────────
  // trades_count is always null in Bullpen's leaderboard API — use volume >= 50k
  // as the activity filter. Filters one-shot whales who got lucky on a single
  // massive bet. Lower this floor if fewer than 10 entries pass regularly.
  const VOL_FLOOR = 50_000;
  const qualified = leaderboard
    .filter(t => parseFloat(t.volume || 0) >= VOL_FLOOR)
    .sort((a, b) => parseFloat(b.pnl) - parseFloat(a.pnl));

  console.log(`${ts} Volume filter ($${VOL_FLOOR.toLocaleString()}+): ${qualified.length}/${leaderboard.length} passed`);

  if (qualified.length === 0) {
    const msg = 'No qualified traders found on leaderboard — aborting rotation.';
    console.error(`${ts} ${msg}`);
    tg(`⚠️ Rotation aborted: ${msg}`);
    process.exit(1);
  }

  const top = qualified.slice(0, TARGET_SIZE);
  console.log(`\n${ts} Top ${top.length} by weekly PnL:`);
  top.forEach((t, i) =>
    console.log(`  ${i + 1}. ${label(t.address, t.username).padEnd(20)} PnL: $${parseFloat(t.pnl).toLocaleString('en-US', { maximumFractionDigits: 0 })}  Vol: $${parseFloat(t.volume).toLocaleString('en-US', { maximumFractionDigits: 0 })}`)
  );

  // ── Step 3: Get current active subscriptions ────────────────────────────────
  let currentSubs;
  try {
    const all = bullpen('tracker copy list --output json');
    currentSubs = all.filter(s => s.status === 'Active');
    console.log(`\n${ts} Current active subscriptions: ${currentSubs.length}`);
  } catch (err) {
    const msg = `Failed to fetch current subscriptions: ${err.message}`;
    console.error(`${ts} ERROR: ${msg}`);
    tg(`⚠️ Rotation error: ${msg}`);
    process.exit(1);
  }

  const currentAddrs = new Set(currentSubs.map(s => s.followed_address.toLowerCase()));
  const topAddrs     = new Set(top.map(t => t.address.toLowerCase()));

  // ── Step 4: Diff ────────────────────────────────────────────────────────────
  const toAdd  = top.filter(t => !currentAddrs.has(t.address.toLowerCase()));
  const toDrop = currentSubs.filter(s => !topAddrs.has(s.followed_address.toLowerCase()));

  // Safety: never drop more than we can replace
  const safeDropCount = Math.min(toDrop.length, toAdd.length);
  const safeDrop      = toDrop.slice(0, safeDropCount);
  const safeAdd       = toAdd.slice(0, safeDropCount);

  console.log(`\n${ts} Diff:`);
  console.log(`  To drop: ${toDrop.length} (safe to drop: ${safeDrop.length})`);
  console.log(`  To add:  ${toAdd.length} (safe to add: ${safeAdd.length})`);

  if (safeDrop.length === 0 && safeAdd.length === 0) {
    console.log(`\n${ts} Roster is already optimal — no changes needed.`);
    tg('✅ Weekly rotation: roster already optimal, no changes needed.');

    const log = loadLog();
    log.rotations.push({ timestamp: now, dropped: [], added: [], roster: [...currentAddrs], note: 'no-change' });
    saveLog(log);
    return;
  }

  // ── Step 5: Reset budget on carried-over traders ───────────────────────────
  // The budget cap is cumulative since subscription creation and never resets
  // automatically. Bump it each rotation so existing traders stay unblocked.
  const keepSubs = currentSubs.filter(s => topAddrs.has(s.followed_address.toLowerCase()));
  for (const sub of keepSubs) {
    try {
      execSync(
        `bullpen tracker copy edit ${sub.followed_address} --budget ${SUB_SETTINGS.budget} --min-trade-size ${SUB_SETTINGS.minTradeSize}`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, BULLPEN_NON_INTERACTIVE: 'true' } }
      );
      console.log(`${ts} RESET:   ${sub.nickname || sub.followed_address} budget→$${SUB_SETTINGS.budget}`);
    } catch (err) {
      errors.push(`Failed to reset budget for ${sub.nickname || sub.followed_address}: ${err.message}`);
    }
  }

  // ── Step 6: Stop dropped traders ───────────────────────────────────────────
  const dropped = [];
  for (const sub of safeDrop) {
    const name = sub.nickname || label(sub.followed_address, '');
    try {
      execSync(`bullpen tracker copy stop ${sub.followed_address} --confirm`, {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log(`${ts} DROPPED: ${name} (${sub.followed_address})`);
      dropped.push({ address: sub.followed_address, nickname: name });
    } catch (err) {
      const msg = `Failed to stop ${name}: ${err.message}`;
      console.error(`${ts} ERROR: ${msg}`);
      errors.push(msg);
    }
  }

  // ── Step 7: Start new traders ───────────────────────────────────────────────
  const added = [];
  for (const trader of safeAdd) {
    const name = label(trader.address, trader.username);
    const cmd = [
      `bullpen tracker copy start ${trader.address}`,
      `--amount ${SUB_SETTINGS.amount}`,
      `--budget ${SUB_SETTINGS.budget}`,
      `--min-trade-size ${SUB_SETTINGS.minTradeSize}`,
      `--price-range-min ${SUB_SETTINGS.priceRangeMin}`,
      `--price-range-max ${SUB_SETTINGS.priceRangeMax}`,
      `--execution-mode ${SUB_SETTINGS.executionMode}`,
      `--exit-behavior ${SUB_SETTINGS.exitBehavior}`,
      `--slippage ${SUB_SETTINGS.slippage}`,
      `--nickname "${name}"`,
    ].join(' ');

    try {
      execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      console.log(`${ts} ADDED:   ${name} (${trader.address})  PnL: $${parseFloat(trader.pnl).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
      added.push({ address: trader.address, nickname: name, pnl: trader.pnl, volume: trader.volume });
    } catch (err) {
      const msg = `Failed to start ${name} (${trader.address}): ${err.message}`;
      console.error(`${ts} ERROR: ${msg}`);
      errors.push(msg);
    }
  }

  // ── Step 7: Build final roster ──────────────────────────────────────────────
  const droppedAddrs = new Set(dropped.map(d => d.address.toLowerCase()));
  const addedAddrs   = new Set(added.map(a => a.address.toLowerCase()));
  const finalRoster  = [
    ...currentSubs
      .filter(s => !droppedAddrs.has(s.followed_address.toLowerCase()))
      .map(s => ({ address: s.followed_address, nickname: s.nickname || s.followed_address })),
    ...added,
  ];

  // ── Step 8: Log rotation ────────────────────────────────────────────────────
  const log = loadLog();
  log.rotations.push({
    timestamp: now,
    dropped:   dropped,
    added:     added,
    roster:    finalRoster,
    errors:    errors,
  });
  saveLog(log);
  console.log(`\n${ts} Rotation logged to rotation-log.json`);

  // ── Step 9: Telegram summary ────────────────────────────────────────────────
  const addedNames   = added.length   ? added.map(a => a.nickname).join(', ')   : 'none';
  const droppedNames = dropped.length ? dropped.map(d => d.nickname).join(', ') : 'none';
  const errLine      = errors.length  ? `\n⚠️ Errors: ${errors.length} (check logs)` : '';

  tg(
    `🔄 Weekly Rotation Complete\n\n` +
    `✅ Added: ${addedNames}\n` +
    `❌ Dropped: ${droppedNames}\n` +
    `👥 Roster: ${finalRoster.length} traders active` +
    errLine
  );

  if (errors.length) {
    console.log(`\n${ts} ${errors.length} error(s) during rotation:`);
    errors.forEach(e => console.log(`  - ${e}`));
    tg(`⚠️ Rotation errors:\n${errors.join('\n')}`);
  }

  console.log(`\n${ts} Done. Final roster: ${finalRoster.length} active traders.`);
  finalRoster.forEach((t, i) => console.log(`  ${i + 1}. ${(t.nickname || t.address).padEnd(20)} ${t.address}`));
}

rotate().catch(err => {
  console.error('Unhandled error:', err.message);
  tg(`⚠️ Rotation crashed: ${err.message}`);
  process.exit(1);
});
