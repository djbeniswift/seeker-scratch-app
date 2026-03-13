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

export default function WinsTicker() {
  const [wins, setWins] = useState<Win[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    async function fetchWins() {
      try {
        const res = await fetch(HELIUS_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignaturesForAddress',
            params: [PROGRAM_ID, { limit: 50 }],
          }),
        })
        const { result } = await res.json()
        if (!result) return

        const found: Win[] = []
        for (const sig of result) {
          if (sig.err) continue
          const txRes = await fetch(HELIUS_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getTransaction',
              params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
            }),
          })
          const { result: tx } = await txRes.json()
          if (!tx) continue

          const keys = tx.transaction?.message?.accountKeys || []
          const playerKey = keys[0]?.pubkey || keys[0] || ''

          const pre = tx.meta?.preBalances?.[0] || 0
          const post = tx.meta?.postBalances?.[0] || 0
          const diff = (post - pre) / 1e9
          if (diff <= 0) continue

          found.push({
            wallet: shortWallet(playerKey.toString()),
            amount: diff.toFixed(3),
            timeAgo: timeAgo(tx.blockTime || 0),
            sig: sig.signature,
          })

          if (found.length >= 10) break
        }
        if (found.length > 0) setWins(found)
      } catch (e) {
        console.error('WinsTicker error', e)
      }
    }

    fetchWins()
    const interval = setInterval(fetchWins, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (wins.length === 0) return
    const t = setInterval(() => setIdx(i => (i + 1) % wins.length), 3000)
    return () => clearInterval(t)
  }, [wins])

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
