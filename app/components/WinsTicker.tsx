'use client'
import { useEffect, useState } from 'react'

const PROGRAM_ID = '3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC'
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba'
const HOUSE_WALLET = 'DBH2VpbjWLdrJnau4RjdpYBTcLy9pMGa1qQr4U9dDgER'
const TREASURY = 'H5icwcoysjVVVfzKxfJnPFBmn5wzMEzEDSJo66p2LkMv'

type Win = {
  wallet: string
  cardType: string
  amount: string
  timeAgo: string
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

async function heliusFetch(body: object): Promise<any> {
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
  const res = await fetch(HELIUS_RPC, opts)
  const json = await res.json()
  if (json?.error?.code === -32429) {
    await new Promise(r => setTimeout(r, 5000))
    const retryRes = await fetch(HELIUS_RPC, opts)
    return retryRes.json()
  }
  return json
}

export default function WinsTicker() {
  const [wins, setWins] = useState<Win[]>([])

  useEffect(() => {
    async function fetchWins() {
      try {
        // Call 1: get recent signatures
        const { result: sigs } = await heliusFetch({
          jsonrpc: '2.0', id: 1,
          method: 'getSignaturesForAddress',
          params: [PROGRAM_ID, { limit: 150 }],
        })
        if (!sigs) return

        const goodSigs = (sigs as any[]).filter(s => !s.err).slice(0, 150)
        if (goodSigs.length === 0) return

        // Fire all getTransaction requests in parallel — ~300ms vs ~20s sequential
        const txResults = await Promise.all(
          goodSigs.map((s: any) => heliusFetch({
            jsonrpc: '2.0', id: 1,
            method: 'getTransaction',
            params: [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
          }))
        )

        const found: Win[] = []

        for (const item of txResults) {
          if (found.length >= 10) break
          const tx = item.result
          if (!tx) continue

          const logs: string[] = tx.meta?.logMessages || []
          const isBuyAndScratch = logs.some((l: string) => l.includes('Instruction: BuyAndScratch'))
          if (!isBuyAndScratch) continue

          const keys = tx.transaction?.message?.accountKeys || []
          const treasuryIdx = keys.findIndex((k: any) => (k?.pubkey || k) === TREASURY)
          if (treasuryIdx < 0) continue

          const preTreasury: number = tx.meta?.preBalances?.[treasuryIdx] || 0
          const postTreasury: number = tx.meta?.postBalances?.[treasuryIdx] || 0

          // BuyAndScratch: use CPI transfer amounts
          const allInner: any[] = (tx.meta?.innerInstructions || [])
            .flatMap((ix: any) => ix.instructions || [])
          const transfers = allInner.filter((i: any) => i.parsed?.type === 'transfer')

          const houseTx = transfers.find((t: any) => t.parsed?.info?.destination === HOUSE_WALLET)
          const treasuryTx = transfers.find((t: any) => t.parsed?.info?.destination === TREASURY)

          const houseFeeLamports: number = houseTx?.parsed?.info?.lamports || 0
          const treasuryReceivedLamports: number = treasuryTx?.parsed?.info?.lamports || 0
          if (houseFeeLamports === 0) continue

          // Card type from house fee: QP ~300K, HotShot ~1.5M, MegaGold ~3M
          let cardType: string
          if (houseFeeLamports >= 2_000_000) cardType = 'MEGA GOLD'
          else if (houseFeeLamports >= 1_000_000) cardType = 'HOT SHOT'
          else cardType = 'QUICK PICK'

          // prize = treasuryReceived − (postTreasury − preTreasury)
          const prizeLamports = treasuryReceivedLamports - (postTreasury - preTreasury)

          if (prizeLamports <= 0) continue

          const prizeSOL = (prizeLamports / 1e9).toFixed(3)
          const playerKey: string = keys[0]?.pubkey || keys[0] || ''

          found.push({
            wallet: shortWallet(playerKey.toString()),
            cardType,
            amount: prizeSOL,
            timeAgo: timeAgo(tx.blockTime || 0),
          })
        }

        if (found.length > 0) setWins(found)
      } catch (e) {
        console.error('WinsTicker error', e)
      }
    }

    fetchWins()
    const interval = setInterval(fetchWins, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (wins.length === 0) return null

  // Duplicate the list so the scroll loops seamlessly
  const items = [...wins, ...wins]

  // 500px gives enough room for the longest possible item text + gap between items
  const itemWidth = 500
  const totalWidth = wins.length * itemWidth
  const durationSeconds = wins.length * 7 // ~7s per item — slower, easier to read

  return (
    <div style={{
      width: '100%',
      background: 'rgba(0, 255, 136, 0.05)',
      border: '1px solid rgba(0, 255, 136, 0.2)',
      borderRadius: '8px',
      padding: '10px 0',
      marginBottom: '16px',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-${totalWidth}px); }
        }
      `}</style>
      <div style={{
        display: 'flex',
        width: 'max-content',
        animation: `ticker-scroll ${durationSeconds}s linear infinite`,
      }}>
        {items.map((win, i) => (
          <span key={i} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            width: `${itemWidth}px`,
            fontSize: '13px',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            paddingRight: '80px',
          }}>
            <span style={{ fontSize: '15px' }}>🏆</span>
            <span style={{ color: '#ffffffee' }}>{win.wallet}</span>
            <span style={{ color: '#00ff88' }}>won</span>
            <span style={{ fontWeight: 'bold', color: '#00ff88' }}>{win.amount} SOL</span>
            <span style={{ color: '#ffffffcc' }}>on</span>
            <span style={{ fontWeight: 'bold', color: '#ffffffee', letterSpacing: 1 }}>{win.cardType}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
