'use client'
import { useEffect, useState } from 'react'

const PROGRAM_ID = '3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC'
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba'
const BATCH_SIZE = 20 // parallel tx fetches per round

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
  const { result } = await res.json()
  return result
}

async function fetchAllWins(onBatch: (wins: Win[]) => void) {
  let before: string | undefined = undefined

  while (true) {
    // Paginate through all signatures for this program, oldest-last
    const sigs: any[] = await rpc('getSignaturesForAddress', [
      PROGRAM_ID,
      { limit: 1000, ...(before ? { before } : {}) },
    ])
    if (!sigs || sigs.length === 0) break

    const validSigs = sigs.filter(s => !s.err)

    // Fetch transactions in parallel batches to avoid rate limits
    for (let i = 0; i < validSigs.length; i += BATCH_SIZE) {
      const batch = validSigs.slice(i, i + BATCH_SIZE)
      const txs = await Promise.all(
        batch.map(s => rpc('getTransaction', [
          s.signature,
          { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
        ]))
      )

      const batchWins: Win[] = []
      for (const tx of txs) {
        if (!tx) continue
        const logs: string[] = tx.meta?.logMessages || []
        if (!logs.some((l: string) => l.includes('won'))) continue

        const keys = tx.transaction?.message?.accountKeys || []
        const playerKey = keys[0]?.pubkey || keys[0] || ''
        const pre = tx.meta?.preBalances?.[0] || 0
        const post = tx.meta?.postBalances?.[0] || 0
        const diff = (post - pre) / 1e9
        if (diff <= 0) continue

        batchWins.push({
          wallet: shortWallet(playerKey.toString()),
          amount: diff.toFixed(3),
          timeAgo: timeAgo(tx.blockTime || 0),
          sig: tx.transaction?.signatures?.[0] || '',
        })
      }

      // Surface wins immediately as each batch completes
      if (batchWins.length > 0) onBatch(batchWins)
    }

    before = sigs[sigs.length - 1].signature
    if (sigs.length < 1000) break // no more pages
  }
}

export default function WinsTicker() {
  const [wins, setWins] = useState<Win[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    // Initial full history load
    fetchAllWins(batch => {
      setWins(prev => [...prev, ...batch])
    }).catch(e => console.error('WinsTicker error', e))

    // Refresh the most recent 50 txs every 30s to pick up new wins
    const interval = setInterval(async () => {
      try {
        const sigs: any[] = await rpc('getSignaturesForAddress', [PROGRAM_ID, { limit: 50 }])
        if (!sigs) return
        const validSigs = sigs.filter(s => !s.err)
        const txs = await Promise.all(
          validSigs.map(s => rpc('getTransaction', [
            s.signature,
            { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
          ]))
        )
        const fresh: Win[] = []
        for (const tx of txs) {
          if (!tx) continue
          const logs: string[] = tx.meta?.logMessages || []
          if (!logs.some((l: string) => l.includes('won'))) continue
          const keys = tx.transaction?.message?.accountKeys || []
          const playerKey = keys[0]?.pubkey || keys[0] || ''
          const pre = tx.meta?.preBalances?.[0] || 0
          const post = tx.meta?.postBalances?.[0] || 0
          const diff = (post - pre) / 1e9
          if (diff <= 0) continue
          fresh.push({
            wallet: shortWallet(playerKey.toString()),
            amount: diff.toFixed(3),
            timeAgo: timeAgo(tx.blockTime || 0),
            sig: tx.transaction?.signatures?.[0] || '',
          })
        }
        if (fresh.length > 0) {
          setWins(prev => {
            const existingSigs = new Set(prev.map(w => w.sig))
            const newWins = fresh.filter(w => !existingSigs.has(w.sig))
            return newWins.length > 0 ? [...newWins, ...prev] : prev
          })
        }
      } catch (e) {
        console.error('WinsTicker refresh error', e)
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (wins.length === 0) return
    const t = setInterval(() => setIdx(i => (i + 1) % wins.length), 3000)
    return () => clearInterval(t)
  }, [wins.length])

  if (wins.length === 0) return null

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
      overflow: 'hidden',
      transition: 'all 0.3s ease',
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
