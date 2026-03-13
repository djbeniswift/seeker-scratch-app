'use client'
import { useEffect, useState } from 'react'

const PROGRAM_ID = '3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC'
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba'
const BATCH_SIZE = 20
const THIRTY_DAYS_S = 30 * 24 * 60 * 60

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
  return (await res.json()).result
}

async function fetchWins30Days(onBatch: (wins: Win[]) => void) {
  const cutoff = Math.floor(Date.now() / 1000) - THIRTY_DAYS_S
  let before: string | undefined = undefined

  while (true) {
    const sigs: any[] = await rpc('getSignaturesForAddress', [
      PROGRAM_ID,
      { limit: 1000, ...(before ? { before } : {}) },
    ])
    if (!sigs || sigs.length === 0) break

    // Trim any sigs older than 30 days (blockTime comes back on sig objects)
    const withinWindow = sigs.filter(s => !s.err && (s.blockTime ?? 0) >= cutoff)
    const hitCutoff = withinWindow.length < sigs.filter(s => !s.err).length

    for (let i = 0; i < withinWindow.length; i += BATCH_SIZE) {
      const chunk = withinWindow.slice(i, i + BATCH_SIZE)
      const txs = await Promise.all(
        chunk.map(s => rpc('getTransaction', [
          s.signature,
          { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
        ]))
      )

      const batchWins: Win[] = []
      for (const tx of txs) {
        if (!tx?.meta) continue
        const diff = ((tx.meta.postBalances?.[0] ?? 0) - (tx.meta.preBalances?.[0] ?? 0)) / 1e9
        if (diff <= 0) continue
        const keys = tx.transaction?.message?.accountKeys || []
        const playerKey = keys[0]?.pubkey ?? keys[0] ?? ''
        batchWins.push({
          wallet: shortWallet(playerKey.toString()),
          amount: diff.toFixed(3),
          timeAgo: timeAgo(tx.blockTime ?? 0),
          sig: tx.transaction?.signatures?.[0] ?? '',
        })
      }
      if (batchWins.length > 0) onBatch(batchWins)
    }

    if (hitCutoff || sigs.length < 1000) break
    before = sigs[sigs.length - 1].signature
  }
}

export default function WinsTicker() {
  const [wins, setWins] = useState<Win[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    fetchWins30Days(batch => {
      setWins(prev => {
        const seen = new Set(prev.map(w => w.sig))
        const fresh = batch.filter(w => !seen.has(w.sig))
        return fresh.length > 0 ? [...prev, ...fresh] : prev
      })
    }).catch(e => console.error('WinsTicker:', e))

    // Refresh recent 50 every 30s for new wins
    const interval = setInterval(async () => {
      try {
        const sigs: any[] = await rpc('getSignaturesForAddress', [PROGRAM_ID, { limit: 50 }])
        if (!sigs) return
        const txs = await Promise.all(
          sigs.filter(s => !s.err).map(s => rpc('getTransaction', [
            s.signature,
            { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
          ]))
        )
        const fresh: Win[] = []
        for (const tx of txs) {
          if (!tx?.meta) continue
          const diff = ((tx.meta.postBalances?.[0] ?? 0) - (tx.meta.preBalances?.[0] ?? 0)) / 1e9
          if (diff <= 0) continue
          const keys = tx.transaction?.message?.accountKeys || []
          const playerKey = keys[0]?.pubkey ?? keys[0] ?? ''
          fresh.push({
            wallet: shortWallet(playerKey.toString()),
            amount: diff.toFixed(3),
            timeAgo: timeAgo(tx.blockTime ?? 0),
            sig: tx.transaction?.signatures?.[0] ?? '',
          })
        }
        if (fresh.length > 0) {
          setWins(prev => {
            const seen = new Set(prev.map(w => w.sig))
            const newWins = fresh.filter(w => !seen.has(w.sig))
            return newWins.length > 0 ? [...newWins, ...prev] : prev
          })
        }
      } catch {}
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
