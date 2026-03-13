'use client'
import { useEffect, useState, useRef } from 'react'

const PROGRAM_ID = '3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC'
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba'

// Prize amounts from the contract (in SOL)
const PRIZE_AMOUNTS = new Set([
  0.015, 0.020, 0.030, 0.050, 0.100,  // QuickPick
  0.060, 0.080, 0.100, 0.200, 0.500,  // Lucky7s
  0.060, 0.080, 0.150, 0.300, 1.000,  // HotShot
  0.120, 0.300, 0.750, 1.500, 5.000,  // MegaGold
])

type Win = {
  wallet: string
  amount: string
  amountNum: number
  timeAgo: string
  sig: string
  blockTime: number
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

function isWinAmount(lamports: number): boolean {
  const sol = Math.round(lamports) / 1e9
  for (const prize of PRIZE_AMOUNTS) {
    if (Math.abs(sol - prize) < 0.0001) return true
  }
  return false
}

async function parseSigsForWins(sigs: any[]): Promise<Win[]> {
  const valid = sigs.filter(s => !s.err)
  const wins: Win[] = []

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

      // Look at inner instructions for a system transfer FROM treasury TO player
      // Treasury is always the 2nd account (index 1), player is index 0
      const keys = tx.transaction?.message?.accountKeys || []
      const playerKey = keys[0]?.pubkey ?? keys[0] ?? ''
      const treasuryKey = keys[1]?.pubkey ?? keys[1] ?? ''

      let prizeAmount = 0

      // Check inner instructions for the prize transfer
      const innerIxs = tx.meta?.innerInstructions || []
      for (const group of innerIxs) {
        for (const ix of group.instructions || []) {
          if (
            ix.parsed?.type === 'transfer' &&
            ix.parsed?.info?.source === treasuryKey?.toString() &&
            ix.parsed?.info?.destination === playerKey?.toString()
          ) {
            const lamports = ix.parsed.info.lamports
            if (isWinAmount(lamports)) {
              prizeAmount = lamports / 1e9
              break
            }
          }
        }
        if (prizeAmount > 0) break
      }

      // Fallback: check if treasury balance went down by a known prize amount
      if (prizeAmount === 0) {
        const pre = tx.meta.preBalances?.[0] ?? 0
        const post = tx.meta.postBalances?.[0] ?? 0
        const netGain = post - pre
        if (netGain > 0) {
          const treasuryPre = tx.meta.preBalances?.[1] ?? 0
          const treasuryPost = tx.meta.postBalances?.[1] ?? 0
          const treasuryDiff = treasuryPre - treasuryPost
          if (treasuryDiff > 0 && isWinAmount(treasuryDiff)) {
            prizeAmount = treasuryDiff / 1e9
          } else if (treasuryDiff > 0) {
            prizeAmount = treasuryDiff / 1e9
          }
        }
      }

      if (prizeAmount > 0) {
        wins.push({
          wallet: shortWallet(playerKey.toString()),
          amount: prizeAmount.toFixed(3),
          amountNum: prizeAmount,
          timeAgo: timeAgo(tx.blockTime ?? 0),
          sig: tx.transaction?.signatures?.[0] ?? '',
          blockTime: tx.blockTime ?? 0,
        })
      }
    }
  }

  return wins
}

export default function WinsTicker() {
  const [wins, setWins] = useState<Win[]>([])
  const [idx, setIdx] = useState(0)
  const seenSigs = useRef(new Set<string>())
  const latestSig = useRef<string | undefined>(undefined)

  function addWins(newWins: Win[]) {
    const fresh = newWins.filter(w => !seenSigs.current.has(w.sig))
    if (fresh.length === 0) return
    fresh.forEach(w => seenSigs.current.add(w.sig))
    setWins(prev => {
      const merged = [...fresh, ...prev]
      merged.sort((a, b) => b.blockTime - a.blockTime)
      return merged
    })
  }

  useEffect(() => {
    async function loadHistory() {
      const THIRTY_DAYS = 30 * 24 * 60 * 60
      const cutoff = Math.floor(Date.now() / 1000) - THIRTY_DAYS
      let before: string | undefined = undefined

      while (true) {
        const sigs: any[] = await rpc('getSignaturesForAddress', [
          PROGRAM_ID,
          { limit: 1000, ...(before ? { before } : {}) },
        ])
        if (!sigs || sigs.length === 0) break

        if (!latestSig.current && sigs[0]?.signature) {
          latestSig.current = sigs[0].signature
        }

        const oldest = sigs[sigs.length - 1]?.blockTime ?? Infinity
        const inWindow = sigs.filter(s => !s.err && (s.blockTime === null || s.blockTime >= cutoff))

        const batchWins = await parseSigsForWins(inWindow)
        if (batchWins.length > 0) addWins(batchWins)

        if (oldest < cutoff || sigs.length < 1000) break
        before = sigs[sigs.length - 1].signature
      }
    }

    loadHistory().catch(e => console.error('WinsTicker history:', e))

    // Poll every 5s for new wins only
    const interval = setInterval(async () => {
      try {
        const params: any = { limit: 20 }
        if (latestSig.current) params.until = latestSig.current
        const sigs: any[] = await rpc('getSignaturesForAddress', [PROGRAM_ID, params])
        if (!sigs || sigs.length === 0) return
        if (sigs[0]?.signature) latestSig.current = sigs[0].signature
        const newWins = await parseSigsForWins(sigs)
        if (newWins.length > 0) addWins(newWins)
      } catch {}
    }, 5000)

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
