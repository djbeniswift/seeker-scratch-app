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
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    async function fetchWins() {
      try {
        const { result: sigs } = await heliusFetch({
          jsonrpc: '2.0', id: 1,
          method: 'getSignaturesForAddress',
          params: [PROGRAM_ID, { limit: 100 }],
        })
        if (!sigs) return

        const found: Win[] = []

        for (const s of sigs) {
          if (s.err) continue

          const { result: tx } = await heliusFetch({
            jsonrpc: '2.0', id: 1,
            method: 'getTransaction',
            params: [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
          })
          if (!tx) continue

          // Only process paid card buys — skip free scratches and other instructions
          const logs: string[] = tx.meta?.logMessages || []
          if (!logs.some((l: string) => l.includes('Instruction: BuyAndScratch'))) continue

          // Win detection: player (account[0]) net balance must be positive
          const pre0: number = tx.meta?.preBalances?.[0] || 0
          const post0: number = tx.meta?.postBalances?.[0] || 0
          const netChange = post0 - pre0
          if (netChange <= 0) continue

          // Determine card type and card cost from inner CPI transfers
          // buyAndScratch always CPIs: player→house (3% fee) and player→treasury (97%)
          const allInner: any[] = (tx.meta?.innerInstructions || [])
            .flatMap((ix: any) => ix.instructions || [])
          const transfers = allInner.filter((i: any) => i.parsed?.type === 'transfer')

          const houseTx = transfers.find((t: any) => t.parsed?.info?.destination === HOUSE_WALLET)
          const treasuryTx = transfers.find((t: any) => t.parsed?.info?.destination === TREASURY)

          const houseFeeLamports: number = houseTx?.parsed?.info?.lamports || 0
          const treasuryLamports: number = treasuryTx?.parsed?.info?.lamports || 0
          const cardCostLamports = houseFeeLamports + treasuryLamports
          if (cardCostLamports === 0) continue

          // House fee is 3% of card cost:
          //   QuickPick  = 10M → house fee ≈ 300K
          //   HotShot    = 50M → house fee ≈ 1.5M
          //   MegaGold   = 100M → house fee ≈ 3M
          let cardType: string
          if (houseFeeLamports >= 2_000_000) cardType = 'MEGA GOLD'
          else if (houseFeeLamports >= 1_000_000) cardType = 'HOT SHOT'
          else cardType = 'QUICK PICK'

          // Prize = net balance change + card cost paid (ignores ~5K tx fee — acceptable)
          const prizeLamports = netChange + cardCostLamports
          const prizeSOL = (prizeLamports / 1e9).toFixed(3)

          const keys = tx.transaction?.message?.accountKeys || []
          const playerKey: string = keys[0]?.pubkey || keys[0] || ''

          found.push({
            wallet: shortWallet(playerKey.toString()),
            cardType,
            amount: prizeSOL,
            timeAgo: timeAgo(tx.blockTime || 0),
            sig: s.signature,
          })

          if (found.length >= 10) break
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
    }}>
      <span style={{ fontSize: '16px' }}>🏆</span>
      <span style={{ color: '#ffffffee' }}>{win.wallet}</span>
      <span>won</span>
      <span style={{ fontWeight: 'bold', color: '#00ff88' }}>{win.amount} SOL</span>
      <span style={{ color: '#ffffffcc' }}>on</span>
      <span style={{ fontWeight: 'bold', color: '#ffffffee', letterSpacing: 1 }}>{win.cardType}</span>
      <span style={{ color: '#ffffffcc' }}>·</span>
      <span style={{ color: '#ffffffcc' }}>{win.timeAgo}</span>
    </div>
  )
}
