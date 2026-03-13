'use client'
import { useEffect, useState, useRef } from 'react'

const PROGRAM_ID = '3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC'
const HELIUS_KEY = 'e74081ed-6624-4d7b-9b49-9732a61b29ba'
const HELIUS_TXS = `https://api.helius.xyz/v0/addresses/${PROGRAM_ID}/transactions?api-key=${HELIUS_KEY}`

type Win = {
  wallet: string
  amount: string
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

// Helius enhanced API — returns parsed txs with nativeBalanceChange per account
// Much better history coverage than getTransaction RPC
async function fetchWinsPage(before?: string): Promise<{ wins: Win[], lastSig: string | null }> {
  let url = HELIUS_TXS + '&limit=100'
  if (before) url += `&before=${before}`

  const res = await fetch(url)
  const txs: any[] = await res.json()
  if (!Array.isArray(txs) || txs.length === 0) return { wins: [], lastSig: null }

  const wins: Win[] = []
  for (const tx of txs) {
    if (tx.transactionError) continue
    const feePayer = tx.feePayer
    const playerData = tx.accountData?.find((d: any) => d.account === feePayer)
    if (!playerData || playerData.nativeBalanceChange <= 0) continue
    wins.push({
      wallet: shortWallet(feePayer),
      amount: (playerData.nativeBalanceChange / 1e9).toFixed(3),
      timeAgo: timeAgo(tx.timestamp),
      sig: tx.signature,
      blockTime: tx.timestamp,
    })
  }

  return { wins, lastSig: txs[txs.length - 1]?.signature ?? null }
}

export default function WinsTicker() {
  const [wins, setWins] = useState<Win[]>([])
  const [idx, setIdx] = useState(0)
  const seenSigs = useRef(new Set<string>())
  const newestSig = useRef<string | undefined>(undefined)

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
    // Load all history by paginating back through pages
    async function loadHistory() {
      let before: string | undefined = undefined
      let pages = 0
      while (pages < 20) { // max 20 pages = 2000 txs
        const { wins: pageWins, lastSig } = await fetchWinsPage(before)
        if (pageWins.length > 0) addWins(pageWins)
        // Capture newest sig from first page for polling
        if (pages === 0 && pageWins.length === 0 && lastSig) {
          newestSig.current = lastSig
        }
        if (!lastSig) break
        if (pages === 0) {
          // Store the newest sig from first page for the poll cursor
          const { wins: firstPageCheck } = await fetchWinsPage(undefined)
          newestSig.current = firstPageCheck.length > 0 ? firstPageCheck[0]?.sig : lastSig
        }
        before = lastSig
        pages++
        if (pageWins.length === 0 && pages > 1) break
      }
    }

    // Separately grab newest sig for poll cursor, then load history
    fetchWinsPage(undefined).then(({ wins: firstWins, lastSig }) => {
      if (firstWins.length > 0) {
        newestSig.current = firstWins[0].sig
        addWins(firstWins)
      }
    }).catch(() => {})

    loadHistory().catch(e => console.error('WinsTicker history:', e))

    // Poll every 5s for new wins using `until` to only fetch new sigs
    const interval = setInterval(async () => {
      try {
        let url = HELIUS_TXS + '&limit=20'
        if (newestSig.current) url += `&until=${newestSig.current}`
        const res = await fetch(url)
        const txs: any[] = await res.json()
        if (!Array.isArray(txs) || txs.length === 0) return
        if (txs[0]?.signature) newestSig.current = txs[0].signature
        const fresh: Win[] = []
        for (const tx of txs) {
          if (tx.transactionError) continue
          const feePayer = tx.feePayer
          const playerData = tx.accountData?.find((d: any) => d.account === feePayer)
          if (!playerData || playerData.nativeBalanceChange <= 0) continue
          fresh.push({
            wallet: shortWallet(feePayer),
            amount: (playerData.nativeBalanceChange / 1e9).toFixed(3),
            timeAgo: timeAgo(tx.timestamp),
            sig: tx.signature,
            blockTime: tx.timestamp,
          })
        }
        if (fresh.length > 0) addWins(fresh)
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
