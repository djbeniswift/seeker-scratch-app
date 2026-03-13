'use client'
import { useEffect, useState } from 'react'

const PROGRAM_ID = '3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC'
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba'
const ANY_WIN_MIN = 0.005  // SOL — recent wins (covers tx fee)
const BIG_WIN_MIN = 0.5    // SOL — historical big wins

type Win = {
  wallet: string
  amount: string
  timeAgo: string
  sig: string
}

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() / 1000) - ts)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function shortWallet(pk: string) {
  return `${pk.slice(0, 4)}...${pk.slice(-4)}`
}

async function rpc(method: string, params: any[]) {
  const res = await fetch(HELIUS_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = await res.json()
  return json.result
}

async function parseTxWins(sigs: any[], minAmount: number): Promise<Win[]> {
  const wins: Win[] = []
  const valid = sigs.filter(s => !s.err)

  for (let i = 0; i < valid.length; i += 10) {
    const chunk = valid.slice(i, i + 10)
    const txs = await Promise.all(
      chunk.map(s => rpc('getTransaction', [
        s.signature,
        { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
      ]))
    )
    for (const tx of txs) {
      if (!tx?.meta) continue
      const diff = ((tx.meta.postBalances?.[0] ?? 0) - (tx.meta.preBalances?.[0] ?? 0)) / 1e9
      if (diff < minAmount) continue
      const keys = tx.transaction?.message?.accountKeys || []
      const playerKey = keys[0]?.pubkey ?? keys[0] ?? ''
      wins.push({
        wallet: shortWallet(playerKey.toString()),
        amount: diff.toFixed(3),
        timeAgo: timeAgo(tx.blockTime ?? 0),
        sig: tx.transaction?.signatures?.[0] ?? '',
      })
    }
  }
  return wins
}

function mergeDedupe(prev: Win[], next: Win[]): Win[] {
  const seen = new Set(prev.map(w => w.sig))
  const added = next.filter(w => !seen.has(w.sig))
  return added.length > 0 ? [...prev, ...added] : prev
}

export default function WinsTicker() {
  const [wins, setWins] = useState<Win[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    // Phase 1: fast — load last 50 txs, show any win immediately
    rpc('getSignaturesForAddress', [PROGRAM_ID, { limit: 50 }]).then(async (sigs) => {
      if (!sigs) return
      const recent = await parseTxWins(sigs, ANY_WIN_MIN)
      if (recent.length > 0) setWins(recent)

      // Phase 2: background — fetch up to 500 txs, surface big wins (0.5+ SOL)
      const allSigs: any[] = [...sigs]
      let before = sigs[sigs.length - 1]?.signature
      while (allSigs.length < 500 && before) {
        const more: any[] = await rpc('getSignaturesForAddress', [PROGRAM_ID, { limit: 100, before }])
        if (!more || more.length === 0) break
        allSigs.push(...more)
        if (more.length < 100) break
        before = more[more.length - 1].signature
      }

      const olderSigs = allSigs.slice(50) // skip the first 50 already processed
      const bigWins = await parseTxWins(olderSigs, BIG_WIN_MIN)
      if (bigWins.length > 0) setWins(prev => mergeDedupe(prev, bigWins))
    }).catch(e => console.error('WinsTicker init:', e))

    // Refresh: check last 50 for new wins every 30s
    const interval = setInterval(() => {
      rpc('getSignaturesForAddress', [PROGRAM_ID, { limit: 50 }])
        .then(async (sigs) => {
          if (!sigs) return
          const fresh = await parseTxWins(sigs, ANY_WIN_MIN)
          if (fresh.length > 0) setWins(prev => {
            const seen = new Set(prev.map(w => w.sig))
            const newWins = fresh.filter(w => !seen.has(w.sig))
            return newWins.length > 0 ? [...newWins, ...prev] : prev
          })
        })
        .catch(() => {})
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (wins.length === 0) return
    const t = setInterval(() => setIdx(i => (i + 1) % wins.length), 3000)
    return () => clearInterval(t)
  }, [wins.length])

  if (wins.length === 0) {
    return (
      <div style={{
        width: '100%',
        background: 'rgba(0, 255, 136, 0.05)',
        border: '1px solid rgba(0, 255, 136, 0.2)',
        borderRadius: '8px',
        padding: '10px 16px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '13px',
        color: '#ffffff44',
        fontFamily: 'monospace',
      }}>
        <span>🎰</span>
        <span>Loading recent wins...</span>
      </div>
    )
  }

  const win = wins[idx]

  return (
    <div style={{
      width: '100%',
      background: 'rgba(0, 255, 136, 0.05)',
      border: '1px solid rgba(0, 255, 136, 0.2)',
      borderRadius: '8px',
      padding: '10px 16px',
      marginBottom: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '13px',
      color: '#00ff88',
      fontFamily: 'monospace',
    }}>
      <span style={{ fontSize: '16px' }}>🎉</span>
      <span style={{ color: '#ffffff99' }}>{win.wallet}</span>
      <span>won</span>
      <span style={{ fontWeight: 'bold', color: '#00ff88' }}>+{win.amount} SOL</span>
      <span style={{ color: '#ffffff44' }}>·</span>
      <span style={{ color: '#ffffff55' }}>{win.timeAgo}</span>
    </div>
  )
}
