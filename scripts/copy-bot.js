#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const https = require('https');
const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS  = 60_000;
const TG_TOKEN  = '8729098613:AAG4TyPM2NjxjFwwWfS1_stHET9OFaI6d9o';
const TG_CHAT   = '8348194715';

function tg(text) {
  const body = JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML' });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${TG_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  });
  req.on('error', () => {}); // silent — never crash the bot over a notification
  req.write(body);
  req.end();
}
const LOG_FILE   = path.join(__dirname, '..', 'copy-trades.json');
const STATE_FILE = path.join(__dirname, '..', '.copy-bot-state.json');

const TRADERS = [
  { address: '0xee613b3fc183ee44f9da9c05f53e2da107e3debf', nickname: 'sovereign2013' },
  { address: '0xbaa2bcb5439e985ce4ccf815b4700027d1b92c73', nickname: 'denizz'        },
  { address: '0xd106952ebf30a3125affd8a23b6c1f30c35fc79c', nickname: 'Herdonia'      },
  { address: '0xb45a797faa52b0fd8adc56d30382022b7b12192c', nickname: 'bcda'          },
  { address: '0xe934f2d7d6358c6c86bfdd5848f1e90412e9640b', nickname: 'Feveey'        },
  { address: '0xead152b855effa6b5b5837f53b24c0756830c76a', nickname: 'elkmonkey'     },
  { address: '0x2005d16a84ceefa912d4e380cd32e7ff827875ea', nickname: 'RN1'           },
  { address: '0x2a2c53bd278c04da9962fcf96490e17f3dfb9bc1', nickname: '0x2a2C'        },
  { address: '0xa2b5bafa01d0f81926a2a88e5628a95b59fc4582', nickname: 'BruceWayne77'  },
  { address: '0x57cd939930fd119067ca9dc42b22b3e15708a0fb', nickname: 'Supah9ga'      },
];

// ── Persistence ───────────────────────────────────────────────────────────────

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return raw;
  } catch {
    return { seenTxHashes: {}, trackingSince: {} };

  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  } catch {
    return { trades: [], errors: [], stats: { totalCopied: 0, totalBuys: 0, totalSells: 0 }, lastUpdated: null };
  }
}

function saveLog(log) {
  log.lastUpdated = new Date().toISOString();
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

// ── CLI helpers ───────────────────────────────────────────────────────────────

function bullpen(args) {
  const raw = execSync(`bullpen ${args}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  // Strip any trailing non-JSON lines (e.g. upgrade notices) before parsing
  const start = raw.search(/[{[]/);
  return JSON.parse(start >= 0 ? raw.slice(start) : raw);
}

function fetchTraderActivity(address, since) {
  const sinceParam = since ? `--start ${since}` : '';
  return bullpen(`polymarket activity --address ${address} --type trade --limit 30 ${sinceParam} --output json`);
}

function fetchCopyExecutions() {
  const result = bullpen('tracker copy executions --output json --limit 100');
  return result.executions || [];
}

// ── Open position tracker ─────────────────────────────────────────────────────
// Key: `${address}::${slug}::${outcome}` → trade log entry id

function buildPositionIndex(trades) {
  // Returns a map of open positions we hold (net BUY not yet matched by a SELL)
  const positions = {};
  for (const t of trades) {
    const key = `${t.trader_address}::${t.market_slug}::${t.outcome}`;
    if (t.side === 'BUY' && t.copy_status !== 'failed') {
      if (!positions[key]) positions[key] = [];
      positions[key].push(t.id);
    } else if (t.side === 'SELL') {
      // Remove one matching BUY (FIFO)
      if (positions[key] && positions[key].length > 0) {
        positions[key].shift();
        if (positions[key].length === 0) delete positions[key];
      }
    }
  }
  return positions;
}

// ── Main poll ─────────────────────────────────────────────────────────────────

async function poll() {
  const now = new Date().toISOString();
  const ts  = `[${now}]`;

  const state = loadState();
  const log   = loadLog();

  // ── Step 1: Log copy executions directly (source of truth for OUR trades) ──
  if (!state.seenExecutionIds) state.seenExecutionIds = [];
  const seenExecIds = new Set(state.seenExecutionIds);
  let execsBySourceSlugOutcome = {};

  try {
    const execs = fetchCopyExecutions();
    for (const e of execs) {
      // Index for enriching trader-activity entries
      const key = `${e.source_market_slug}::${e.source_outcome}`;
      execsBySourceSlugOutcome[key] = e;

      if (seenExecIds.has(e.id)) continue;
      seenExecIds.add(e.id);

      // Skip trades Bullpen filtered out — they never touched our money
      if ((e.status || '').toLowerCase() === 'skipped') continue;

      const entry = {
        id:                e.id,
        timestamp:         e.executed_at || e.detected_at || now,
        logged_at:         now,
        trader_address:    (e.source_trader_address || '').toLowerCase(),
        trader_nickname:   e.trader_name || e.trader_nickname || 'unknown',
        market_slug:       e.source_market_slug,
        market_title:      e.market_title || e.event_title || e.source_market_slug,
        outcome:           e.source_outcome,
        side:              e.source_side,
        trader_shares:     null,
        trader_amount_usd: parseFloat(e.source_size_usd || 0),
        trader_price:      parseFloat(e.source_price || 0),
        our_amount_usd:    parseFloat(e.copy_amount_usd || e.filled_amount || 5),
        copy_status:       (e.status || 'pending').toLowerCase(),
        copy_execution_id: e.id,
        source_tx_hash:    e.order_id || null,
        our_tx_hash:       e.order_id || null,
        had_open_position: false,
      };

      log.trades.push(entry);
      log.stats.totalCopied++;
      if (e.source_side === 'BUY')  log.stats.totalBuys++;
      if (e.source_side === 'SELL') log.stats.totalSells++;
      console.log(`${ts} EXEC ${e.source_side} ${e.trader_name || 'unknown'} → ${e.source_market_slug} ${e.source_outcome} $${entry.our_amount_usd} [${entry.copy_status}]`);

      const side        = e.source_side === 'BUY' ? '🟢 BUY' : '🔴 SELL';
      const entryPrice  = parseFloat(e.source_price || 0);
      const pricePct    = (entryPrice * 100).toFixed(0);
      const impliedOdds = entryPrice > 0 ? (1 / entryPrice).toFixed(2) : '—';
      const stake       = parseFloat(e.copy_amount_usd || 5);
      const shares      = entryPrice > 0 ? (stake / entryPrice).toFixed(2) : '—';
      const potPayout   = entryPrice > 0 ? (stake / entryPrice).toFixed(2) : '—';
      const potProfit   = entryPrice > 0 ? ((stake / entryPrice) - stake).toFixed(2) : '—';
      const traderStake = parseFloat(e.source_size_usd || 0).toFixed(0);

      const msg = e.source_side === 'BUY'
        ? `${side} Trade Copied 🎯\n\n` +
          `<b>${e.market_title || e.source_market_slug}</b>\n` +
          `Outcome: <b>${e.source_outcome}</b>\n\n` +
          `📊 Odds: ${pricePct}¢ (${impliedOdds}x)\n` +
          `👤 Trader: ${e.trader_name || 'unknown'} staked $${traderStake}\n` +
          `💵 Our stake: $${stake}\n` +
          `🎟 Shares bought: ${shares}\n\n` +
          `✅ If we win: +$${potProfit} profit ($${potPayout} returned)\n` +
          `❌ If we lose: -$${stake}`
        : `${side} Sell Copied\n\n` +
          `<b>${e.market_title || e.source_market_slug}</b>\n` +
          `Outcome: <b>${e.source_outcome}</b>\n` +
          `Exit price: ${pricePct}¢\n` +
          `Trader: ${e.trader_name || 'unknown'}`;

      tg(msg);
    }
    state.seenExecutionIds = [...seenExecIds];
  } catch (err) {
    log.errors.push({ timestamp: now, source: 'copy-executions', error: err.message });
    console.error(`${ts} ERROR fetching copy executions: ${err.message}`);
    tg(`⚠️ Bot error: ${err.message}`);
  }

  // Copy executions IS the only source of truth — trader activity loop removed

  // Auto-redeem any resolved positions
  try {
    // Snapshot balance before redeem so we can calculate exact winnings
    const balBefore = (() => {
      try {
        const d = bullpen('portfolio balances --output json');
        const poly = (d?.chains || []).find(c => c.chain_name === 'Polygon');
        return poly?.total_usd || 0;
      } catch { return 0; }
    })();

    const redeem = JSON.parse(
      execSync('bullpen polymarket redeem --output json --yes', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    );
    if (redeem.status === 'success' && redeem.condition_ids?.length) {
      // Snapshot balance after to get exact payout
      const balAfter = (() => {
        try {
          const d = bullpen('portfolio balances --output json');
          const poly = (d?.chains || []).find(c => c.chain_name === 'Polygon');
          return poly?.total_usd || 0;
        } catch { return 0; }
      })();

      const winnings = (balAfter - balBefore).toFixed(2);
      const stake    = (redeem.condition_ids.length * 5).toFixed(2);
      const pnl      = (balAfter - balBefore - (redeem.condition_ids.length * 5)).toFixed(2);

      console.log(`${ts} REDEEMED ${redeem.condition_ids.length} resolved position(s) → +$${winnings}`);
      tg(`💰 Winning redeemed!\n\n` +
         `Markets resolved: ${redeem.condition_ids.length}\n` +
         `💵 Returned to balance: +$${winnings}\n` +
         `📈 P&L: ${pnl >= 0 ? '+' : ''}$${pnl}\n` +
         `🏦 New balance: $${balAfter.toFixed(2)}`);
      log.trades.push({
        id:        `redeem-${Date.now()}`,
        timestamp: now,
        logged_at: now,
        side:      'REDEEM',
        copy_status: 'executed',
        market_slug: redeem.condition_ids.join(','),
        market_title: `Auto-redeem (${redeem.condition_ids.length} market(s))`,
        outcome:   null,
        our_amount_usd: null,
        trader_nickname: 'system',
      });
      log.stats.totalCopied++;
    }
  } catch (err) {
    log.errors.push({ timestamp: now, source: 'auto-redeem', error: err.message });
    console.error(`${ts} ERROR auto-redeem: ${err.message}`);
  }

  saveState(state);
  saveLog(log);

  console.log(`${ts} Poll complete. Total trades in log: ${log.trades.length}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     Polymarket Copy Bot              ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`Traders: ${TRADERS.length} | Poll: every ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`Log:   ${LOG_FILE}`);
  console.log(`State: ${STATE_FILE}`);
  console.log('Press Ctrl+C to stop.\n');

  // First poll immediately
  try {
    await poll();
  } catch (err) {
    console.error('Unhandled error on first poll:', err.message);
  }

  // Then every 60 seconds
  setInterval(async () => {
    try {
      await poll();
    } catch (err) {
      console.error('Unhandled error in poll loop:', err.message);
      // Never crash — keep looping
    }
  }, POLL_INTERVAL_MS);
}

main();
