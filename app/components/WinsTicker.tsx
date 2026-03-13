'use client'
import { useEffect, useState } from 'react'

const PROGRAM_ID = '3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC'
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba'

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

async function fetchRecentWins(): Promise<Win[]> {
  const sigs: any[] = await rpc('getSignaturesForAddress', [
    PROGRAM_ID,
    { limit: 100 },
  ])
  if (!sigs || sigs.length === 0) return []

  const validSigs = sigs.filter(s => !s.err)
  const wins: Win[] = []

  // Fetch in batches of 10
  for (let i = 0; i < validSigs.length; i += 10) {
    const batch = validSigs.slice(i, i + 10)
    const txs = await Promise.all(
      batch.map(s => rpc('getTransaction', [
        s.signature,
        { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
      ]))
    )

    for (const tx of txs) {
      if (!tx || !tx.meta) continue

      // A win = player balance INCREASED (they received SOL back)
      // Player is always index 0 in accountKeys
      const pre = tx.meta.preBalances?.[0] ?? 0
      const post = tx.meta.postBalances?.[0] ?? 0
      const diff = (post - pre) / 1e9

      // Only count if they gained more than tx fee (i.e. actual prize)
      if (diff < 0.005) continue

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

export default function WinsTicker() {
  const [wins, setWins] = useState<Win[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    fetchRecentWins()
      .then(w => { if (w.length > 0) setWins(w) })
      .catch(e => console.error('WinsTicker:', e))

    const interval = setInterval(() => {
      fetchRecentWins()
        .then(fresh => {
          if (fresh.length === 0) return
          setWins(prev => {
            const existingSigs = new Set(prev.map(w => w.sig))
            const newWins = fresh.filter(w => !existingSigs.has(w.sig))
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

  // Show placeholder while loading
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
