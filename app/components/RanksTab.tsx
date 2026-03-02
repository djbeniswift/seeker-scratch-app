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

  const getProfilePda = (owner: PublicKey) => {
    const [pda] = PublicKey.findProgramAddressSync([PROFILE_SEED, owner.toBuffer()], PROGRAM_ID)
    return pda
  }

  const fetchLeaderboard = async () => {
    setLoading(true)
    try {
      const readProvider = new AnchorProvider(connection, {} as any, { commitment: 'confirmed' })
      const program = new Program(IDL as any, PROGRAM_ID, readProvider)

      // Fetch all known player profiles
      const profiles: any[] = []
      
      // Also fetch all program accounts of type playerProfile
      try {
        const accounts = await (program.account as any).playerProfile.all()
        for (const acc of accounts) {
          profiles.push({
            wallet: acc.account.owner.toBase58(),
            displayName: acc.account.displayName || null,
            pfpUrl: acc.account.pfpUrl || null,
            pointsThisMonth: acc.account.pointsThisMonth.toNumber(),
            pointsAllTime: acc.account.pointsAllTime.toNumber(),
            wins: acc.account.wins,
            cardsScratched: acc.account.cardsScratched,
            totalWon: acc.account.totalWon.toNumber() / 1_000_000_000,
          })
        }
      } catch {
        // Fall back to known wallets
        for (const w of KNOWN_WALLETS) {
          try {
            const pda = getProfilePda(new PublicKey(w))
            const data = await (program.account as any).playerProfile.fetch(pda)
            profiles.push({
              wallet: w,
              displayName: data.displayName || null,
              pfpUrl: data.pfpUrl || null,
              pointsThisMonth: data.pointsThisMonth.toNumber(),
              pointsAllTime: data.pointsAllTime.toNumber(),
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

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  const sorted = [...players].sort((a, b) =>
    period === 'month'
      ? b.pointsThisMonth - a.pointsThisMonth
      : b.pointsAllTime - a.pointsAllTime
  )

  const medals = ['🥇', '🥈', '🥉']
  const myWallet = publicKey?.toBase58()

  return (
    <div style={{ paddingBottom: 16 }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a3e, #2d1b69)',
        border: '1px solid var(--gold)', borderRadius: 16,
        padding: 20, textAlign: 'center', marginBottom: 16
      }}>
        <div style={{ fontSize: 36, marginBottom: 6 }}>🏆</div>
        <div style={{ color: 'var(--gold)', fontSize: 24, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>
          LEADERBOARD
        </div>
        <div style={{ color: '#a0aec0', fontSize: 14, marginTop: 4 }}>
          Top players earn SOL prizes each month
        </div>
      </div>

      {/* Period Toggle */}
      <div style={{
        display: 'flex', background: '#0a0a1a', borderRadius: 10,
        padding: 4, marginBottom: 16, gap: 4
      }}>
        {(['month', 'alltime'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{
            flex: 1, padding: '8px', border: 'none', borderRadius: 8, cursor: 'pointer',
            background: period === p ? 'var(--gold)' : 'transparent',
            color: period === p ? '#000' : '#aaa',
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 1
          }}>
            {p === 'month' ? 'THIS MONTH' : 'ALL TIME'}
          </button>
        ))}
      </div>

      {/* Monthly Prize Pool Info */}
      {period === 'month' && (
        <div style={{
          background: 'rgba(245,200,66,0.08)', border: '1px solid rgba(245,200,66,0.2)',
          borderRadius: 10, padding: 12, marginBottom: 16,
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center'
        }}>
          {[
            { place: '🥇 1st', prize: '0.25 SOL' },
            { place: '🥈 2nd', prize: '0.15 SOL' },
            { place: '🥉 3rd', prize: '0.05 SOL' },
          ].map(({ place, prize }) => (
            <div key={place}>
              <div style={{ color: 'var(--gold)', fontSize: 13, fontFamily: "'Bebas Neue', sans-serif" }}>{place}</div>
              <div style={{ color: '#fff', fontSize: 13 }}>{prize}</div>
            </div>
          ))}
        </div>
      )}

      {/* Leaderboard */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Loading ranks...</div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>No players yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map((player, i) => {
            const isMe = player.wallet === myWallet
            const points = period === 'month' ? player.pointsThisMonth : player.pointsAllTime
            const shortWallet = `${player.wallet.slice(0, 6)}...${player.wallet.slice(-5)}`

            return (
              <div key={player.wallet} style={{
                background: isMe ? 'rgba(245,200,66,0.08)' : 'var(--card-bg)',
                border: `1px solid ${isMe ? 'var(--gold)' : i < 3 ? 'rgba(245,200,66,0.3)' : 'var(--border)'}`,
                borderRadius: 12, padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 12
              }}>
                {/* Rank */}
                <div style={{
                  width: 32, textAlign: 'center',
                  fontSize: i < 3 ? 22 : 14,
                  color: i < 3 ? 'var(--gold)' : '#555',
                  fontFamily: "'Bebas Neue', sans-serif", flexShrink: 0
                }}>
                  {i < 3 ? medals[i] : `#${i + 1}`}
                </div>

                {/* Avatar */}
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  border: `2px solid ${isMe ? 'var(--gold)' : '#333'}`,
                  overflow: 'hidden', background: '#0a0a1a',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, flexShrink: 0
                }}>
                  {player.pfpUrl
                    ? <img src={player.pfpUrl} alt="pfp" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => (e.currentTarget.style.display = 'none')} />
                    : '👤'
                  }
                </div>

                {/* Name & Stats */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    color: isMe ? 'var(--gold)' : '#fff',
                    fontSize: 14, fontFamily: "'Bebas Neue', sans-serif",
                    letterSpacing: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {player.displayName || shortWallet} {isMe && '(YOU)'}
                  </div>
                </div>

                {/* Points */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: 'var(--gold)', fontSize: 18, fontFamily: "'Bebas Neue', sans-serif" }}>
                    {points.toLocaleString()}
                  </div>
                  <div style={{ color: '#a0aec0', fontSize: 13, letterSpacing: 1 }}>POINTS</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
