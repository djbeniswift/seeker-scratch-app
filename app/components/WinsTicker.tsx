'use client'
import { useEffect, useState, useRef } from 'react'

const PROGRAM_ID = '3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC'
const HELIUS_KEY = 'e74081ed-6624-4d7b-9b49-9732a61b29ba'
const HELIUS_TXS = `https://api.helius.xyz/v0/addresses/${PROGRAM_ID}/transactions?api-key=${HELIUS_KEY}`
const THIRTY_DAYS_S = 30 * 24 * 60 * 60

type Win = {
  wallet: string
  amount: string
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

function txToWin(tx: any): Win | null {
  if (tx.transactionError) return null
  const feePayer = tx.feePayer
  if (!feePayer) return null

  const blockTime = tx.timestamp ?? Math.floor(Date.now() / 1000)

  // accountData[0] is always the fee payer — more reliable than find()
  const playerData = tx.accountData?.[0]
  if (playerData && playerData.nativeBalanceChange > 0) {
    return {
      wallet: shortWallet(feePayer),
      amount: (playerData.nativeBalanceChange / 1e9).toFixed(3),
      sig: tx.signature,
      blockTime,
    }
  }

  // Fallback: look for any native transfer TO the feePayer >= 0.01 SOL (prize)
  const prize = (tx.nativeTransfers ?? []).find(
    (t: any) => t.toUserAccount === feePayer && t.amount >= 10_000_000
  )
  if (prize) {
    return {
      wallet: shortWallet(feePayer),
      amount: (prize.amount / 1e9).toFixed(3),
      sig: tx.signature,
      blockTime,
    }
  }

  return null
}

export default function WinsTicker() {
  const [wins, setWins] = useState<Win[]>([])
  const seenSigs = useRef(new Set<string>())
  const newestSig = useRef<string | undefined>(undefined)

  function addWins(incoming: Win[]) {
    const fresh = incoming.filter(w => !seenSigs.current.has(w.sig))
    if (fresh.length === 0) return
    fresh.forEach(w => seenSigs.current.add(w.sig))
    setWins(prev => {
      const merged = [...fresh, ...prev]
      merged.sort((a, b) => b.blockTime - a.blockTime)
      return merged
    })
  }

  useEffect(() => {
    const cutoff = Math.floor(Date.now() / 1000) - THIRTY_DAYS_S

    async function loadAll() {
      let before: string | undefined = undefined

      while (true) {
        const url = `${HELIUS_TXS}&limit=100${before ? `&before=${before}` : ''}`
        const res = await fetch(url)
        const txs: any[] = await res.json()
        if (!Array.isArray(txs) || txs.length === 0) break

        // Capture newest sig from first page for poll cursor
        if (!newestSig.current && txs[0]?.signature) {
          newestSig.current = txs[0].signature
        }

        const pageWins = txs
          .filter(tx => tx.timestamp === null || tx.timestamp >= cutoff)
          .map(txToWin)
          .filter(Boolean) as Win[]

        if (pageWins.length > 0) addWins(pageWins)

        // Use the oldest confirmed timestamp; null timestamps mean recent/unfinalized so skip them
        const confirmedTimestamps = txs.map(t => t.timestamp).filter(Boolean)
        const oldest = confirmedTimestamps.length > 0 ? Math.min(...confirmedTimestamps) : Date.now() / 1000
        if (oldest < cutoff) break
        before = txs[txs.length - 1].signature
      }
    }

    loadAll().catch(e => console.error('WinsTicker:', e))

    // Poll every 5s for wins newer than our cursor
    const interval = setInterval(async () => {
      try {
        const url = `${HELIUS_TXS}&limit=20${newestSig.current ? `&until=${newestSig.current}` : ''}`
        const res = await fetch(url)
        const txs: any[] = await res.json()
        if (!Array.isArray(txs) || txs.length === 0) return
        if (txs[0]?.signature) newestSig.current = txs[0].signature
        const fresh = txs.map(txToWin).filter(Boolean) as Win[]
        if (fresh.length > 0) addWins(fresh)
      } catch {}
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  if (wins.length === 0) {
    return (
      <div style={{
        width: '100%',
        background: 'rgba(0, 255, 136, 0.05)',
        border: '1px solid rgba(0, 255, 136, 0.2)',
        borderRadius: '8px',
        padding: '10px 16px',
        marginBottom: '16px',
        fontSize: '13px',
        color: '#ffffff44',
        fontFamily: 'monospace',
      }}>
        🎰 Loading recent wins...
      </div>
    )
  }

  // Duplicate for seamless loop; speed = ~5s per win item
  const items = [...wins, ...wins]
  const duration = wins.length * 5

  return (
    <>
      <style>{`
        @keyframes tickerScroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .ticker-track {
          display: inline-flex;
          animation: tickerScroll ${duration}s linear infinite;
          white-space: nowrap;
        }
        .ticker-track:hover {
          animation-play-state: paused;
        }
      `}</style>
      <div style={{
        width: '100%',
        background: 'rgba(0, 255, 136, 0.05)',
        border: '1px solid rgba(0, 255, 136, 0.2)',
        borderRadius: '8px',
        padding: '10px 0',
        marginBottom: '16px',
        overflow: 'hidden',
        fontFamily: 'monospace',
        fontSize: '13px',
      }}>
        <div className="ticker-track">
          {items.map((win, i) => (
            <span key={`${win.sig}-${i}`} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginRight: '40px',
            }}>
              <span style={{ fontSize: '15px' }}>🎉</span>
              <span style={{ color: '#ffffff99' }}>{win.wallet}</span>
              <span style={{ color: '#ffffff88' }}>won</span>
              <span style={{ fontWeight: 'bold', color: '#00ff88' }}>+{win.amount} SOL</span>
              <span style={{ color: '#ffffff33' }}>·</span>
              <span style={{ color: '#ffffff55' }}>{timeAgo(win.blockTime)}</span>
            </span>
          ))}
        </div>
      </div>
    </>
  )
}
