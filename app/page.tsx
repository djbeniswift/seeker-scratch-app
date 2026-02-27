'use client'
import { useState, useEffect } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import WalletButton from './components/WalletButton'
import { useScratchProgram } from './hooks/useScratchProgram'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useLeaderboard } from './contexts/LeaderboardContext'
import AdminPanel from './components/AdminPanel'
import ReferTab from './components/ReferTab'
import ProfileTab from './components/ProfileTab'
import WinnerBanner from './components/WinnerBanner'
import RanksTab from './components/RanksTab'
import PrizesTab from './components/PrizesTab'

const CARD_TYPES = [
  { id: 'QuickPick', name: 'QUICK PICK', cost: 0.01, maxPrize: 0.1, color: '#00d4ff', tag: '⚡ STARTER' },
  { id: 'HotShot', name: 'HOT SHOT', cost: 0.05, maxPrize: 1, color: '#ff006e', tag: '🔥 HIGH RISK' },
  { id: 'MegaGold', name: 'MEGA GOLD', cost: 0.1, maxPrize: 5, color: '#f5c842', tag: '✦ FEATURED' },
]

const MONTHLY_REWARDS = [
  { place: '1st', sol: '0.25 SOL', skr: '500 SKR', emoji: '🥇', color: 'var(--gold)' },
  { place: '2nd', sol: '0.15 SOL', skr: '250 SKR', emoji: '🥈', color: '#c0c0c0' },
  { place: '3rd', sol: '0.1 SOL', skr: '100 SKR', emoji: '🥉', color: '#cd7f32' },
]

export default function Home() {
  const wallet = useWallet()
  const { connection } = useConnection()
  const { leaderboard, isLoading: leaderboardLoading, getUserRank } = useLeaderboard()
  const { treasury, profile, loading, fetchTreasury, fetchProfile, buyCard } = useScratchProgram()
  const [mounted, setMounted] = useState(false)
  const [activeNav, setActiveNav] = useState('scratch')
  const [lastResult, setLastResult] = useState<{ won: boolean; prize: number } | null>(null)
  const [walletBalance, setWalletBalance] = useState(0)

  useEffect(() => {
    setMounted(true)
    fetchTreasury()
  }, [])

  useEffect(() => {
    if (wallet.publicKey) {
      connection.getBalance(wallet.publicKey).then(bal => {
        setWalletBalance(bal / LAMPORTS_PER_SOL)
      })
    }
  }, [wallet.publicKey, connection])

  const handleBuyCard = async (cardType: string) => {
    if (!wallet.connected) { alert("Please connect your wallet first"); return }
    if (!wallet.publicKey) return
    
    setLastResult(null)
    
    const balanceBefore = await connection.getBalance(wallet.publicKey)
    try { await buyCard(cardType) } catch (err: any) { alert("Error: " + (err?.message || JSON.stringify(err)) + " | signTx: " + !!wallet.signTransaction + " | signAll: " + !!wallet.signAllTransactions + " | pubkey: " + wallet.publicKey?.toBase58().slice(0,8)); return }
    const balanceAfter = await connection.getBalance(wallet.publicKey)
    
    const costs: Record<string, number> = {
      QuickPick: 10_000_000,
      Lucky7s: 50_000_000,
      HotShot: 50_000_000,
      MegaGold: 100_000_000,
    }
    const cost = costs[cardType] || 0
    // Player pays full cost, gets prize back if they win
    // net = balanceAfter - balanceBefore + cost (cost was deducted)
    // But 3% house fee means player actually paid cost, so diff should account for fees too
    const netDiff = balanceAfter - balanceBefore
    const prize = netDiff > 0 ? netDiff / LAMPORTS_PER_SOL : 0
    
    const won = prize > 0 && netDiff > 5000 // ignore dust
    setLastResult({ won, prize })
    setWalletBalance(balanceAfter / LAMPORTS_PER_SOL)

    // Play sound
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      if (won) {
        // Win: ascending arpeggio
        const notes = [523, 659, 784, 1047]
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.frequency.value = freq
          osc.type = 'sine'
          gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.1)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3)
          osc.start(ctx.currentTime + i * 0.1)
          osc.stop(ctx.currentTime + i * 0.1 + 0.3)
        })
      } else {
        // Loss: descending thud
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.setValueAtTime(300, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4)
        osc.type = 'sawtooth'
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.4)
      }
    } catch (e) { /* audio not supported */ }
  }

  const getActualMaxPrize = (cardMaxPrize: number) => {
    return cardMaxPrize
  }
  if (!mounted) return <div>Loading...</div>

  return (
    <>
      <div className="app">
        <header>
          <div className="logo">
            <div className="logo-icon">🎰</div>
            <div>
              <div className="logo-text">SEEKER SCRATCH</div>
              <div className="logo-sub">INSTANT WIN ON SOLANA</div>
            </div>
          </div>
          <WalletButton />
        </header>

        <div className="balance-bar">
          <div className="balance-item">
            <div className="balance-label">Balance</div>
            <div className="balance-value gold">{walletBalance.toFixed(3)} SOL</div>
          </div>
          <div className="balance-divider" />
          <div className="balance-item">
            <div className="balance-label">Total Won</div>
            <div className="balance-value green">{(profile?.totalWon || 0).toFixed(3)} SOL</div>
          </div>
          <div className="balance-divider" />
          <div className="balance-item">
            <div className="balance-label">Points</div>
            <div className="balance-value">{profile?.pointsThisMonth || 0}</div>
          </div>
        </div>

        <div className="feature-banner">
          <div className="feature-item">
            <span className="feature-icon">⚡</span>
            <span>INSTANT PAYOUTS</span>
          </div>
          <div className="feature-divider">•</div>
          <div className="feature-item">
            <span className="feature-icon">🔗</span>
            <span>ON-CHAIN</span>
          </div>
          <div className="feature-divider">•</div>
          <div className="feature-item">
            <span className="feature-icon">🎲</span>
            <span>PROVABLY FAIR</span>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-cell">
            <div className="stat-value text-gold">{treasury?.totalCardsSold || 0}</div>
            <div className="stat-label">Cards Sold</div>
          </div>
          <div className="stat-cell">
            <div className="stat-value text-green">{treasury?.totalWins ?? 0}</div>
            <div className="stat-label">Total Winners</div>          </div>
          <div className="stat-cell">
            <div className="stat-value text-cyan">{treasury?.balance.toFixed(2) || '0.00'}</div>
            <div className="stat-label">Prize Pool</div>
          </div>
        </div>

        {profile && (
          <div style={{ marginBottom: 20, padding: 16, background: 'var(--surface)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--cyan)', marginBottom: 12, fontFamily: 'monospace' }}>📊 YOUR STATS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Scratched</div>
                <div style={{ fontSize: 18, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif" }}>{profile.cardsScratched}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Wins</div>
                <div style={{ fontSize: 18, color: 'var(--green)', fontFamily: "'Bebas Neue', sans-serif" }}>{profile.wins}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Points</div>
                <div style={{ fontSize: 18, color: 'var(--gold)', fontFamily: "'Bebas Neue', sans-serif" }}>{profile.pointsThisMonth}</div>
              </div>
            </div>
          </div>
        )}

        {wallet.connected && <WinnerBanner wallet={wallet} publicKey={wallet.publicKey} connection={connection} />}
        {/* SCRATCH TAB */}
        {activeNav === 'scratch' && (
          <>
            {lastResult && (
              <div
                className={`result-container ${lastResult.won ? 'result-win' : 'result-loss'}`}
                style={{
                  marginBottom: 20,
                  padding: 24,
                  background: lastResult.won ? 'rgba(0,255,136,0.08)' : 'rgba(255,68,68,0.08)',
                  border: `2px solid ${lastResult.won ? 'var(--green)' : 'var(--red)'}`,
                  borderRadius: 16,
                  textAlign: 'center',
                }}
              >
                {lastResult.won ? (
                  <>
                    {/* Coin rain */}
                    {['🪙','💰','✨','🪙','💫','🪙'].map((emoji, i) => (
                      <span key={i} className="coin" style={{
                        left: `${10 + i * 16}%`,
                        animationDelay: `${i * 0.1}s`,
                        top: 0,
                      }}>{emoji}</span>
                    ))}
                    <div style={{ fontSize: 36, color: 'var(--green)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 3, marginBottom: 8 }}>
                      🎉 YOU WON! 🎉
                    </div>
                    <div className="result-prize" style={{ fontSize: 48, color: 'var(--green)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>
                      +{lastResult.prize.toFixed(3)}
                    </div>
                    <div style={{ fontSize: 16, color: 'var(--green)', opacity: 0.7, fontFamily: 'monospace' }}>SOL</div>
                  


    <AdminPanel />
    </>
                ) : (
                  <>
                    <div style={{ fontSize: 36, color: 'var(--red)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 3, marginBottom: 8 }}>
                      ❌ BETTER LUCK NEXT TIME
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'monospace' }}>Try again — next one could be the big win</div>
                  


    </>
                )}
              </div>
            )}

            {wallet.connected ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 style={{ fontSize: 14, color: 'var(--muted)', fontFamily: 'monospace', margin: 0 }}>CHOOSE YOUR CARD</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--green)', fontFamily: 'monospace' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                    LIVE
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {CARD_TYPES.map(card => {
                    const actualMaxPrize = getActualMaxPrize(card.maxPrize)
                    return (
                      <div
                        key={card.id}
                        onClick={() => handleBuyCard(card.id)}
                        style={{
                          padding: '20px 24px',
                          background: `linear-gradient(135deg, ${card.color}18 0%, var(--surface) 60%)`,
                          border: `1px solid ${card.color}44`,
                          borderLeft: `4px solid ${card.color}`,
                          borderRadius: 16,
                          cursor: loading ? 'not-allowed' : 'pointer',
                          opacity: loading ? 0.5 : 1,
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                        onMouseEnter={(e) => {
                          if (!loading) {
                            e.currentTarget.style.transform = 'translateX(4px)'
                            e.currentTarget.style.borderColor = card.color
                            e.currentTarget.style.borderLeftColor = card.color
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateX(0)'
                          e.currentTarget.style.borderColor = `${card.color}44`
                          e.currentTarget.style.borderLeftColor = card.color
                        }}
                      >
                        {/* Left: tag + name + odds */}
                        <div>
                          <div style={{ fontSize: 10, color: card.color, marginBottom: 6, fontFamily: 'monospace', letterSpacing: 1 }}>{card.tag}</div>
                          <div style={{ fontSize: 26, color: card.color, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, lineHeight: 1, marginBottom: 8 }}>{card.name}</div>

                        </div>
                        {/* Right: UP TO + cost button */}
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', marginBottom: 4 }}>UP TO</div>
                          <div style={{ fontSize: 42, color: card.color, fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1, marginBottom: 2 }}>
                            {actualMaxPrize >= 1 ? actualMaxPrize.toFixed(0) : actualMaxPrize.toFixed(1)}
                          </div>
                          <div style={{ fontSize: 13, color: card.color, fontFamily: 'monospace', opacity: 0.7, marginBottom: 12 }}>SOL</div>
                          <div style={{
                            padding: '8px 20px',
                            background: `${card.color}22`,
                            border: `1px solid ${card.color}`,
                            borderRadius: 8,
                            color: card.color,
                            fontSize: 14,
                            fontFamily: 'monospace',
                            fontWeight: 'bold',
                          }}>
                            {card.cost} SOL
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              


    </>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                Connect your wallet to start playing! 🎰
              </div>
            )}
          


    </>
        )}

        {/* RANKS TAB */}
        {activeNav === 'ranks' && (
          <RanksTab connection={connection} wallet={wallet} publicKey={wallet.publicKey} />
        )}
        {/* PRIZES TAB */}
        {activeNav === 'prizes' && (
          <PrizesTab />
        )}
        {/* REFER TAB */}
        {activeNav === 'refer' && (
          <ReferTab wallet={wallet} publicKey={wallet.publicKey} connection={connection} />
        )}
        {/* PROFILE TAB */}
        {activeNav === 'profile' && (
          <ProfileTab wallet={wallet} publicKey={wallet.publicKey} connection={connection} />
        )}
      </div>

      {/* NAVIGATION BAR */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#0a0a0a',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '8px 0',
        zIndex: 999
      }}>
        {[
          { id: 'scratch', icon: '🎰', label: 'Scratch' },
          { id: 'ranks', icon: '🏆', label: 'Ranks' },
          { id: 'prizes', icon: '🎁', label: 'Prizes' },
          { id: 'refer', icon: '🤝', label: 'Refer' },
          { id: 'profile', icon: '👤', label: 'Profile' },
        ].map(nav => (
          <div
            key={nav.id}
            onClick={() => setActiveNav(nav.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              padding: '8px 0',
              color: activeNav === nav.id ? 'var(--gold)' : 'var(--muted)',
              transition: 'color 0.2s'
            }}
          >
            <span style={{ fontSize: 20 }}>{nav.icon}</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{nav.label}</span>
          </div>
        ))}
      </div>
    


    </>
  )
}
