'use client'
import { useEffect, useState } from 'react'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { PROGRAM_ID, MASTER_CONFIG_SEED, IDL } from '../lib/constants'

export default function PrizesTab({ connection }: any) {
  const [mc, setMc] = useState<any>(null)

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

  const p1Sol = mc?.prize1stSol ?? 0.25
  const p2Sol = mc?.prize2ndSol ?? 0.15
  const p3Sol = mc?.prize3rdSol ?? 0.05
  const p1Skr = mc?.prize1stSkr ?? 500
  const p2Skr = mc?.prize2ndSkr ?? 250
  const p3Skr = mc?.prize3rdSkr ?? 100
  const s1Skr = mc?.sweep1stSkr ?? 500
  const s2Skr = mc?.sweep2ndSkr ?? 250
  const s3Skr = mc?.sweep3rdSkr ?? 100

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
          🎟️ Use your free daily play to earn sweep points. No purchase necessary.
        </div>
      </div>
    </div>
  )
}
