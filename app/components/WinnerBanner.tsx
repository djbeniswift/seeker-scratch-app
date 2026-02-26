'use client'
import { useState, useEffect } from 'react'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { IDL, PROGRAM_ID, TREASURY_SEED, MONTHLY_PRIZE_SEED } from '../lib/constants'

export default function WinnerBanner({ wallet, publicKey, connection }: any) {
  const [winnerInfo, setWinnerInfo] = useState<any>(null)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!publicKey) return
    checkIfWinner()
  }, [publicKey])

  const checkIfWinner = async () => {
    try {
      const readProvider = new AnchorProvider(connection, {} as any, { commitment: 'confirmed' })
      const program = new Program(IDL as any, PROGRAM_ID, readProvider)
      const [monthlyPrizePda] = PublicKey.findProgramAddressSync([MONTHLY_PRIZE_SEED], PROGRAM_ID)
      const prize = await (program.account as any).monthlyPrize.fetch(monthlyPrizePda)
      const walletStr = publicKey.toBase58()
      prize.winners.forEach((winner: PublicKey, idx: number) => {
        if (winner.toBase58() === walletStr && !prize.paid[idx]) {
          const dismissKey = `winner_dismissed_${prize.month}_${walletStr}`
          if (!localStorage.getItem(dismissKey)) {
            setWinnerInfo({ place: idx + 1, amount: prize.amounts[idx].toNumber() / 1e9, pda: monthlyPrizePda })
          }
        }
      })
    } catch {}
  }

  const claimPrize = async () => {
    if (!publicKey || !winnerInfo) return
    setClaiming(true)
    try {
      const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' })
      const program = new Program(IDL as any, PROGRAM_ID, provider)
      const [treasuryPda] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID)
      await (program.methods as any).claimMonthlyPrize().accounts({
        monthlyPrize: winnerInfo.pda,
        treasury: treasuryPda,
        claimant: publicKey,
      }).rpc({ commitment: 'confirmed' })
      setClaimed(true)
      setWinnerInfo(null)
    } catch (e: any) {
      alert('Claim failed: ' + e.message)
    } finally {
      setClaiming(false)
    }
  }

  const dismiss = () => {
    if (winnerInfo && publicKey) {
      localStorage.setItem(`winner_dismissed_${winnerInfo.place}_${publicKey.toBase58()}`, '1')
    }
    setDismissed(true)
  }

  if (!winnerInfo || dismissed) return null

  const medals = ['🥇', '🥈', '🥉']
  const placeText = ['1ST', '2ND', '3RD']

  return (
    <div style={{
      margin: '0 0 16px 0',
      background: 'linear-gradient(135deg, #1a1a3e, #2d1b69)',
      border: '2px solid var(--gold)', borderRadius: 16, padding: 20,
      position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', top: -40, right: -40, width: 150, height: 150, borderRadius: '50%', background: 'rgba(245,200,66,0.15)', filter: 'blur(40px)' }} />
      <button onClick={dismiss} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#555', fontSize: 20, cursor: 'pointer', zIndex: 1 }}>✕</button>
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{medals[winnerInfo.place - 1]}</div>
        <div style={{ color: 'var(--gold)', fontSize: 24, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, marginBottom: 4 }}>
          YOU WON {placeText[winnerInfo.place - 1]} PLACE!
        </div>
        <div style={{ color: '#aaa', fontSize: 12, marginBottom: 20 }}>Monthly Leaderboard Prize</div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 12, padding: '14px 32px' }}>
            <div style={{ color: 'var(--green)', fontSize: 32, fontFamily: "'Bebas Neue', sans-serif" }}>{winnerInfo.amount} SOL</div>
            <div style={{ color: '#555', fontSize: 10, letterSpacing: 1 }}>YOUR PRIZE</div>
          </div>
        </div>
        {!claimed ? (
          <button onClick={claimPrize} disabled={claiming} style={{
            width: '100%', padding: '16px',
            background: claiming ? '#555' : 'linear-gradient(135deg, #ffd700, #f59e0b)',
            border: 'none', borderRadius: 12, cursor: claiming ? 'not-allowed' : 'pointer',
            color: '#000', fontSize: 20, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2
          }}>
            {claiming ? '⏳ CLAIMING...' : '🎉 CLAIM MY PRIZE'}
          </button>
        ) : (
          <div style={{ padding: 14, background: 'rgba(0,255,136,0.1)', border: '1px solid var(--green)', borderRadius: 10, color: 'var(--green)', fontSize: 16, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>
            ✅ PRIZE CLAIMED! Check your wallet.
          </div>
        )}
      </div>
    </div>
  )
}
