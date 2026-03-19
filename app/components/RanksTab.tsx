'use client'
import { useEffect, useState } from 'react'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { PROGRAM_ID, PROFILE_SEED, IDL } from '../lib/constants'

const KNOWN_WALLETS = [
  '6RhLQikkjzace4ti4D458iSmKofbPdMGNB7VKHmWwYPP',
  'GTpPckfLivFsNZphqoBYknrwhwuTEHK49WQXyjRuszAn',
]

export default function RanksTab({ connection, wallet, publicKey }: any) {
  const [players, setPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'month' | 'alltime'>('month')
  const [leagueTab, setLeagueTab] = useState<'sol' | 'sweep'>('sol')

  const getProfilePda = (owner: PublicKey) => {
    const [pda] = PublicKey.findProgramAddressSync([PROFILE_SEED, owner.toBuffer()], PROGRAM_ID)
    return pda
  }

  const fetchLeaderboard = async () => {
    setLoading(true)
    try {
      const readProvider = new AnchorProvider(connection, {} as any, { commitment: 'confirmed' })
      const program = new Program(IDL as any, PROGRAM_ID, readProvider)
      const profiles: any[] = []
      try {
        const accounts = await (program.account as any).playerProfile.all()
        for (const acc of accounts) {
          profiles.push({
            wallet: acc.publicKey.toBase58(),
            displayName: acc.account.displayName || null,
            pfpUrl: acc.account.pfpUrl || null,
            pointsThisMonth: acc.account.pointsThisMonth.toNumber(),
            pointsAllTime: acc.account.pointsAllTime.toNumber(),
            sweepPointsThisMonth: acc.account.sweepPointsThisMonth?.toNumber() ?? 0,
            wins: acc.account.wins,
            cardsScratched: acc.account.cardsScratched,
            totalWon: acc.account.totalWon.toNumber() / 1_000_000_000,
          })
        }
      } catch {
        for (const w of KNOWN_WALLETS) {
          try {
            const pda = getProfilePda(new PublicKey(w))
            const data = await (program.account as any).playerProfile.fetch(pda)
            profiles.push({
              wallet: pda.toBase58(),
              displayName: data.displayName || null,
              pfpUrl: data.pfpUrl || null,
              pointsThisMonth: data.pointsThisMonth.toNumber(),
              pointsAllTime: data.pointsAllTime.toNumber(),
              sweepPointsThisMonth: data.sweepPointsThisMonth?.toNumber() ?? 0,
              wins: data.wins,
              cardsScratched: data.cardsScratched,
              totalWon: data.totalWon.toNumber() / 1_000_000_000,
            })
          } catch {}
        }
      }
      setPlayers(profiles)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLeaderboard() }, [])

  const myPda = publicKey ? getProfilePda(publicKey).toBase58() : null
  const medals = ['🥇', '🥈', '🥉']
  const solPrizes = ['0.25 SOL + 500 SKR', '0.15 SOL + 250 SKR', '0.05 SOL + 100 SKR']
  const solSorted = [...players].sort((a, b) =>
    period === 'month' ? b.pointsThisMonth - a.pointsThisMonth : b.pointsAllTime - a.pointsAllTime
  )
  const sweepSorted = [...players]
    .filter(p => (p.sweepPointsThisMonth ?? 0) > 0)
    .sort((a, b) => b.sweepPointsThisMonth - a.sweepPointsThisMonth)
  const sorted = leagueTab === 'sol' ? solSorted : sweepSorted
  const pointsKey = leagueTab === 'sol' ? (period === 'month' ? 'pointsThisMonth' : 'pointsAllTime') : 'sweepPointsThisMonth'
  const pointsLabel = leagueTab === 'sol' ? 'POINTS' : 'SWEEP PTS'

  return (
    <div style={{ paddingBottom: 16 }}>
      <div style={{ background: 'linear-gradient(135deg, #1a1a3e, #2d1b69)', border: '1px solid var(--gold)', borderRadius: 16, padding: 20, textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 36, marginBottom: 6 }}>🏆</div>
        <div style={{ color: 'var(--gold)', fontSize: 24, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>LEADERBOARD</div>
        <div style={{ color: '#a0aec0', fontSize: 14, marginTop: 4 }}>Top players earn prizes each month</div>
      </div>

      {/* League toggle */}
      <div style={{ display: 'flex', background: '#0a0a1a', borderRadius: 10, padding: 4, marginBottom: 12, gap: 4 }}>
        {([{ id: 'sol', label: '💰 SOL RANKS' }, { id: 'sweep', label: '🎟️ SWEEP RANKS' }] as const).map(tab => (
          <button key={tab.id} onClick={() => setLeagueTab(tab.id)} style={{
            flex: 1, padding: '9px', border: 'none', borderRadius: 8, cursor: 'pointer',
            background: leagueTab === tab.id ? (tab.id === 'sol' ? 'var(--gold)' : '#00d4ff') : 'transparent',
            color: leagueTab === tab.id ? '#000' : '#aaa',
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 1,
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Period toggle (SOL only) */}
      {leagueTab === 'sol' && (
        <div style={{ display: 'flex', background: '#0a0a1a', borderRadius: 10, padding: 4, marginBottom: 16, gap: 4 }}>
          {(['month', 'alltime'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              flex: 1, padding: '8px', border: 'none', borderRadius: 8, cursor: 'pointer',
              background: period === p ? 'var(--gold)' : 'transparent',
              color: period === p ? '#000' : '#aaa',
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 1,
            }}>
              {p === 'month' ? 'THIS MONTH' : 'ALL TIME'}
            </button>
          ))}
        </div>
      )}

      {/* Prize info */}
      {leagueTab === 'sol' && period === 'month' && (
        <div style={{ background: 'rgba(245,200,66,0.08)', border: '1px solid rgba(245,200,66,0.2)', borderRadius: 10, padding: 12, marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
          {[
            { place: '🥇 1st', sol: '0.25 SOL', skr: '500 SKR' },
            { place: '🥈 2nd', sol: '0.15 SOL', skr: '250 SKR' },
            { place: '🥉 3rd', sol: '0.05 SOL', skr: '100 SKR' },
          ].map(({ place, sol, skr }) => (
            <div key={place}>
              <div style={{ color: 'var(--gold)', fontSize: 13, fontFamily: "'Bebas Neue', sans-serif" }}>{place}</div>
              <div style={{ color: '#fff', fontSize: 13 }}>{sol}</div>
              <div style={{ color: '#00d4ff', fontSize: 12 }}>+ {skr}</div>
            </div>
          ))}
        </div>
      )}
      {leagueTab === 'sweep' && (
        <div style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 10, padding: 12, marginBottom: 16, textAlign: 'center', color: '#a0aec0', fontSize: 13 }}>
          🎟️ Free daily play • Earn sweep points • Win SKR each month
        </div>
      )}

      {/* Rows */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Loading ranks...</div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>No players yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map((player, i) => {
            const isMe = player.wallet === myPda
            const points = player[pointsKey] ?? 0
            const shortWallet = `${player.wallet.slice(0, 6)}...${player.wallet.slice(-5)}`
            const accent = leagueTab === 'sol' ? 'var(--gold)' : '#00d4ff'
            return (
              <div key={player.wallet} style={{
                background: isMe ? `rgba(${leagueTab === 'sol' ? '245,200,66' : '0,212,255'},0.08)` : 'var(--card-bg)',
                border: `1px solid ${isMe ? accent : i < 3 ? `${accent}55` : 'var(--border)'}`,
                borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ width: 32, textAlign: 'center', fontSize: i < 3 ? 22 : 14, color: i < 3 ? accent : '#555', fontFamily: "'Bebas Neue', sans-serif", flexShrink: 0 }}>
                  {i < 3 ? medals[i] : `#${i + 1}`}
                </div>
                <div style={{ width: 40, height: 40, borderRadius: '50%', border: `2px solid ${isMe ? accent : '#333'}`, overflow: 'hidden', background: '#0a0a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                  {player.pfpUrl ? <img src={player.pfpUrl} alt="pfp" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => (e.currentTarget.style.display = 'none')} /> : '👤'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: isMe ? accent : '#fff', fontSize: 14, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {player.displayName || shortWallet} {isMe && '(YOU)'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: accent, fontSize: 18, fontFamily: "'Bebas Neue', sans-serif" }}>{points.toLocaleString()}</div>
                  <div style={{ color: '#a0aec0', fontSize: 13, letterSpacing: 1 }}>{pointsLabel}</div>
                  {leagueTab === 'sol' && period === 'month' && i < 3 && (
                    <div style={{ color: '#00d4ff', fontSize: 11, marginTop: 2 }}>{solPrizes[i]}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
