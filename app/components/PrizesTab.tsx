'use client'
import { useEffect, useState } from 'react'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { PROGRAM_ID, MASTER_CONFIG_SEED, MONTHLY_PRIZE_SEED, TREASURY_SEED, IDL } from '../lib/constants'
import Confetti from './Confetti'

export default function PrizesTab({ connection, wallet, publicKey, unclaimedPrize, onClaimed, rentLamports = 4_200_000 }: any) {
  const [mc, setMc] = useState<any>(null)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    if (!connection) return
    const load = async () => {
      try {
        const [masterConfigPda] = PublicKey.findProgramAddressSync([MASTER_CONFIG_SEED], PROGRAM_ID)
        const rp = new AnchorProvider(connection, {} as any, { commitment: 'confirmed' })
        const prog = new Program(IDL as any, PROGRAM_ID, rp)
        const data = await (prog.account as any).masterConfig.fetch(masterConfigPda)
        setMc({
          prize1stSol: data.prize1stSol.toNumber() / 1e9,
          prize2ndSol: data.prize2ndSol.toNumber() / 1e9,
          prize3rdSol: data.prize3rdSol.toNumber() / 1e9,
          prize1stSkr: data.prize1stSkr.toNumber(),
          prize2ndSkr: data.prize2ndSkr.toNumber(),
          prize3rdSkr: data.prize3rdSkr.toNumber(),
          sweep1stSkr: data.sweep1stSkr.toNumber(),
          sweep2ndSkr: data.sweep2ndSkr.toNumber(),
          sweep3rdSkr: data.sweep3rdSkr.toNumber(),
        })
      } catch { setMc(null) }
    }
    load()
  }, [connection])

  const claimPrize = async () => {
    if (!publicKey || !wallet || !unclaimedPrize) return
    setClaiming(true)
    setClaimError(null)
    try {
      // Use a read-only provider to build the instruction — prevents Anchor from
      // injecting the MWA session key as a required signer ("Missing signature" error)
      const rp = new AnchorProvider(connection, {
        publicKey,
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any) => txs,
      } as any, { commitment: 'confirmed' })
      const prog = new Program(IDL as any, PROGRAM_ID, rp)
      const [monthlyPrizePda] = PublicKey.findProgramAddressSync([MONTHLY_PRIZE_SEED], PROGRAM_ID)
      const [treasuryPda] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID)

      const ix = await (prog.methods as any).claimMonthlyPrize().accounts({
        monthlyPrize: monthlyPrizePda,
        treasury: treasuryPda,
        claimant: publicKey,
      }).instruction()

      const { blockhash } = await connection.getLatestBlockhash('confirmed')
      const isMWA = (wallet as any).wallet?.adapter?.name === 'Mobile Wallet Adapter'

      let sig: string
      if (isMWA) {
        const tx = new Transaction()
        tx.add(ix)
        tx.feePayer = publicKey
        tx.recentBlockhash = blockhash
        const origSerialize = (tx as any).serialize.bind(tx)
        ;(tx as any).serialize = (config?: any) =>
          origSerialize({ requireAllSignatures: false, verifySignatures: false, ...config })
        if (!tx.signatures.find((s: any) => s.publicKey.equals(publicKey))) {
          tx.signatures.unshift({ publicKey, signature: null })
        }
        const signedTx = await wallet.signTransaction!(tx as any)
        const serialized = (signedTx as any).serialize({ requireAllSignatures: false, verifySignatures: false })
        sig = await connection.sendRawTransaction(serialized, { skipPreflight: true, maxRetries: 5 })
      } else {
        const message = new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: blockhash,
          instructions: [ix],
        }).compileToV0Message()
        const vtx = new VersionedTransaction(message)
        if (!wallet.signTransaction) {
          sig = await wallet.sendTransaction(vtx as any, connection, { skipPreflight: true })
        } else {
          const signedVtx = await wallet.signTransaction(vtx as any)
          sig = await connection.sendRawTransaction((signedVtx as any).serialize(), { skipPreflight: true })
        }
      }

      await connection.confirmTransaction(sig, 'confirmed')
      setClaimed(true)
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 5000)
      onClaimed?.()
    } catch (e: any) {
      setClaimError(e?.message || 'Claim failed. Please try again.')
    } finally {
      setClaiming(false)
    }
  }

  const p1Sol = mc?.prize1stSol ?? 0.25
  const p2Sol = mc?.prize2ndSol ?? 0.15
  const p3Sol = mc?.prize3rdSol ?? 0.05
  const p1Skr = mc?.prize1stSkr ?? 500
  const p2Skr = mc?.prize2ndSkr ?? 250
  const p3Skr = mc?.prize3rdSkr ?? 100
  const s1Skr = mc?.sweep1stSkr ?? 500
  const s2Skr = mc?.sweep2ndSkr ?? 250
  const s3Skr = mc?.sweep3rdSkr ?? 100

  const placeLabel = ['', '1ST', '2ND', '3RD']
  const placeMedal = ['', '🥇', '🥈', '🥉']

  const monthlyPrizes = [
    { place: '🥇 1ST PLACE', sol: `${p1Sol} SOL`, skr: `${p1Skr} SKR`, icon: '👑', color: '#FFD700' },
    { place: '🥈 2ND PLACE', sol: `${p2Sol} SOL`, skr: `${p2Skr} SKR`, icon: '🥈', color: '#C0C0C0' },
    { place: '🥉 3RD PLACE', sol: `${p3Sol} SOL`, skr: `${p3Skr} SKR`, icon: '🥉', color: '#CD7F32' },
  ]
  const sweepPrizes = [
    { place: '🥇 1ST PLACE', skr: `${s1Skr} SKR`, icon: '👑', color: '#FFD700' },
    { place: '🥈 2ND PLACE', skr: `${s2Skr} SKR`, icon: '🥈', color: '#C0C0C0' },
    { place: '🥉 3RD PLACE', skr: `${s3Skr} SKR`, icon: '🥉', color: '#CD7F32' },
  ]

  return (
    <div style={{ paddingBottom: 16 }}>
      <Confetti active={showConfetti} />

      {/* ── Claim section — only shown when wallet has an unclaimed prize ── */}
      {unclaimedPrize && (
        <div style={{
          background: 'linear-gradient(135deg, #1a1a3e, #2d1b69)',
          border: '2px solid var(--gold)', borderRadius: 16, padding: 20,
          textAlign: 'center', marginBottom: 16, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 150, height: 150, borderRadius: '50%', background: 'rgba(245,200,66,0.15)', filter: 'blur(40px)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{placeMedal[unclaimedPrize.place]}</div>
            <div style={{ color: 'var(--gold)', fontSize: 22, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, marginBottom: 4 }}>
              YOU WON {placeLabel[unclaimedPrize.place]} PLACE!
            </div>
            <div style={{ color: '#a0aec0', fontSize: 13, marginBottom: 16 }}>Monthly Leaderboard Prize</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 12, padding: '14px 32px' }}>
                <div style={{ color: 'var(--green)', fontSize: 36, fontFamily: "'Bebas Neue', sans-serif" }}>
                  {unclaimedPrize.amount} SOL
                </div>
                <div style={{ color: '#555', fontSize: 13, letterSpacing: 1 }}>YOUR PRIZE</div>
              </div>
            </div>
            {!claimed ? (
              <>
                {claiming ? (
                  <div style={{
                    height: 72, borderRadius: 12, overflow: 'hidden',
                    background: 'linear-gradient(135deg, #0d1b2a 0%, #1a1040 50%, #0d1b2a 100%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <div style={{ fontSize: 22, animation: 'pulse 1.2s ease-in-out infinite' }}>🔗</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace', letterSpacing: 2, animation: 'pulse 1.2s ease-in-out infinite' }}>
                      CONFIRMING ON-CHAIN...
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={claimPrize}
                    style={{
                      width: '100%', padding: '16px',
                      background: 'linear-gradient(135deg, #ffd700, #f59e0b)',
                      border: 'none', borderRadius: 12, cursor: 'pointer',
                      color: '#000', fontSize: 20, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2,
                    }}
                  >
                    🎉 CLAIM MY PRIZE
                  </button>
                )}
                {claimError && (
                  <div style={{ marginTop: 10, color: '#fca5a5', fontSize: 12, fontFamily: 'monospace' }}>
                    ⚠️ {claimError}
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: 14, background: 'rgba(0,255,136,0.1)', border: '1px solid var(--green)', borderRadius: 10, color: 'var(--green)', fontSize: 16, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>
                ✅ {unclaimedPrize.amount} SOL SENT TO YOUR WALLET!
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ background: 'linear-gradient(135deg, #1a1a3e, #2d1b69)', border: '1px solid var(--gold)', borderRadius: 16, padding: 20, textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 36, marginBottom: 6 }}>🏆</div>
        <div style={{ color: 'var(--gold)', fontSize: 26, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>MONTHLY PRIZES</div>
        <div style={{ color: '#ffffffdd', fontSize: 14, marginTop: 4 }}>Top 3 players by points each month win SOL + SKR</div>
      </div>

      <div style={{ background: '#0a0a1a', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ color: 'var(--gold)', fontSize: 13, letterSpacing: 2, marginBottom: 10 }}>HOW TO EARN POINTS</div>
        {[
          { card: 'Quick Pick (0.01 SOL)', pts: '1 pt' },
          { card: 'Hot Shot (0.05 SOL)', pts: '5 pts' },
          { card: 'Mega Gold (0.1 SOL)', pts: '10 pts' },
          { card: 'Refer a friend', pts: '+100 pts' },
        ].map(({ card, pts }) => (
          <div key={card} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #111' }}>
            <span style={{ color: '#ffffffdd', fontSize: 13 }}>{card}</span>
            <span style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 'bold' }}>{pts}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {monthlyPrizes.map(({ place, sol, skr, icon, color }) => (
          <div key={place} style={{ background: 'var(--card-bg)', border: `1px solid ${color}44`, borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 36, flexShrink: 0 }}>{icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color, fontSize: 16, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>{place}</div>
              <div style={{ color: 'var(--green)', fontSize: 15, fontFamily: "'Bebas Neue', sans-serif", marginTop: 4 }}>{sol}</div>
              <div style={{ color: '#00d4ff', fontSize: 15, fontFamily: "'Bebas Neue', sans-serif", marginTop: 2 }}>+ {skr}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: 14, background: 'rgba(245,200,66,0.05)', border: '1px solid rgba(245,200,66,0.2)', borderRadius: 10, color: '#ffffffdd', fontSize: 13, textAlign: 'center', lineHeight: 1.6, marginBottom: 20 }}>
        🏆 Monthly prizes paid out on the 1st of each month.<br />
        Check the Ranks tab to see your position!
      </div>

      {/* Sweep prizes */}
      <div style={{ borderTop: '1px solid #1a1a2e', paddingTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>🎟️</span>
          <div style={{ color: '#00d4ff', fontSize: 18, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>SWEEP RANKINGS</div>
        </div>
        <div style={{ color: '#ffffffdd', fontSize: 13, marginBottom: 12 }}>Free daily play • Win SKR each month</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sweepPrizes.map(({ place, skr, icon, color }) => (
            <div key={place} style={{ background: 'var(--card-bg)', border: `1px solid ${color}33`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 32, flexShrink: 0 }}>{icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color, fontSize: 15, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>{place}</div>
                <div style={{ color: '#00d4ff', fontSize: 15, fontFamily: "'Bebas Neue', sans-serif", marginTop: 4 }}>{skr}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, padding: 10, background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 8, color: '#ffffffdd', fontSize: 12, textAlign: 'center' }}>
          🎟️ Use your free daily play to earn sweep points. A one-time ~{(rentLamports / 1e9).toFixed(4)} SOL account setup fee applies on first play only.
        </div>
      </div>
    </div>
  )
}
