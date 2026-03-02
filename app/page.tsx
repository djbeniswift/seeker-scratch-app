'use client'
import { useState, useEffect } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'

function formatBuyError(err: any): string {
  // Always log the full error object for debugging
  console.error('❌ buyCard full error:', err)
  try { console.error('❌ buyCard JSON:', JSON.stringify(err, null, 2)) } catch {}

  const isDev = process.env.NODE_ENV !== 'production'

  const lines: string[] = []

  // Error type + message
  const name = err?.name || err?.constructor?.name || 'Error'
  const msg = err?.message || String(err)
  lines.push(`[${name}] ${msg}`)

  // Wallet/MWA error code
  if (err?.code !== undefined) lines.push(`Code: ${err.code}`)

  // Anchor program error
  if (err?.error?.errorCode) {
    const ec = err.error.errorCode
    lines.push(`Program error: ${ec.code ?? ''} (${ec.number ?? ''})`)
  }

  // Transaction signature (if tx landed before error)
  const sig = err?.signature || err?.transactionSignature
  if (sig) lines.push(`Signature: ${sig}`)

  // Transaction logs — always show in dev, show error lines in prod
  const logs: string[] = err?.logs ?? err?.transactionLogs ?? err?.error?.logs ?? []
  if (logs.length > 0) {
    if (isDev) {
      lines.push(`Logs:\n${logs.join('\n')}`)
    } else {
      const errLogs = logs.filter((l: string) =>
        /Error|error|failed|panicked|violated/i.test(l)
      )
      if (errLogs.length > 0) lines.push(`Logs: ${errLogs.slice(-3).join(' | ')}`)
    }
  }

  // MWA nested cause
  const cause = err?.cause ?? err?.error
  if (cause && cause !== err && isDev) {
    lines.push(`Cause: ${cause?.message ?? JSON.stringify(cause).slice(0, 120)}`)
  }

  // Full JSON dump in dev only
  if (isDev) {
    try { lines.push(`Full: ${JSON.stringify(err).slice(0, 400)}`) } catch {}
  }

  return lines.join('\n')
}
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
import Confetti from './components/Confetti'
import { useSound } from './hooks/useSound'

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
  const { treasury, profile, loading, fetchTreasury, fetchProfile, buyCard, registerReferral, creditReferrer } = useScratchProgram()
  const [mounted, setMounted] = useState(false)
  const [activeNav, setActiveNav] = useState('scratch')
  const [lastResult, setLastResult] = useState<{ won: boolean; prize: number } | null>(null)
  const [walletBalance, setWalletBalance] = useState(0)
  const [showConfetti, setShowConfetti] = useState(false)
  const [pendingReferrer, setPendingReferrer] = useState<string | null>(null)
  const { muted, toggleMute, playScratch, playSmallWin, playBigWin, playLoss } = useSound()

  // Debug log capture — intercepts console.log/error/warn and displays on screen
  const [debugLogs, setDebugLogs] = useState<string[]>([])
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => {
    const orig = { log: console.log, error: console.error, warn: console.warn }
    const capture = (level: string) => (...args: any[]) => {
      orig[level as 'log'](...args)
      const line = `[${level}] ` + args.map(a => {
        try { return typeof a === 'object' ? JSON.stringify(a) : String(a) } catch { return String(a) }
      }).join(' ')
      setDebugLogs(prev => [...prev.slice(-100), line])
    }
    console.log = capture('log')
    console.error = capture('error')
    console.warn = capture('warn')
    return () => { console.log = orig.log; console.error = orig.error; console.warn = orig.warn }
  }, [])

  useEffect(() => {
    setMounted(true)
    fetchTreasury()
    // Read ?ref= param once on mount — validate it's a plausible base58 pubkey
    // (wallet deep links append their own ?ref= with a URL, not a pubkey)
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ref)) setPendingReferrer(ref)
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

    // On mobile, only injected wallets (inside wallet browser) or MWA can sign.
    // Deep-link adapters (Phantom/Solflare/Backpack selected from native browser) connect
    // but can't sign — give a clear actionable error before attempting the tx.
    if (typeof window !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      const hasInjected = !!(window as any).phantom?.solana || !!(window as any).solana ||
        !!(window as any).backpack || !!(window as any).solflare?.isSolflare
      const isMWA = (wallet as any).wallet?.adapter?.name === 'Mobile Wallet Adapter'
      if (!hasInjected && !isMWA) {
        const name = (wallet as any).wallet?.adapter?.name ?? 'your wallet'
        alert(`To buy cards on mobile, open this site inside ${name}'s browser.\n\nTap the banner above to open in ${name}.`)
        return
      }
    }

    setLastResult(null)
    setShowConfetti(false)
    playScratch()

    const balanceBefore = await connection.getBalance(wallet.publicKey)
    console.log('Balance before:', balanceBefore)
    try { await buyCard(cardType, pendingReferrer ?? undefined) } catch (err: any) {
      alert(formatBuyError(err))
      return
    }
    
    // Wait a moment for devnet to update balance
    await new Promise(resolve => setTimeout(resolve, 500))
    
    let balanceAfter = await connection.getBalance(wallet.publicKey)
    console.log('Balance after:', balanceAfter)
    
    // If balance hasn't changed, retry a few times
    let retries = 0
    while (balanceAfter === balanceBefore && retries < 3) {
      console.log('Balance not updated, retrying...', retries + 1)
      await new Promise(resolve => setTimeout(resolve, 500))
      balanceAfter = await connection.getBalance(wallet.publicKey)
      retries++
    }
    
    const costs: Record<string, number> = {
      QuickPick: 10_000_000,
      HotShot: 50_000_000,
      MegaGold: 100_000_000,
    }
    const cost = costs[cardType] || 0
    console.log('Cost:', cost, 'Balance diff:', balanceAfter - balanceBefore)
    
    // Player pays cost, gets prize back if they win
    // netDiff = balanceAfter - balanceBefore should be negative if they lost (paid cost)
    // or positive if they won (prize > cost)
    const netDiff = balanceAfter - balanceBefore
    const prize = netDiff > 0 ? netDiff / LAMPORTS_PER_SOL : 0
    
    const won = prize > 0 && netDiff > 5000 // ignore dust
    console.log('Final result - won:', won, 'prize:', prize)
    setLastResult({ won, prize })
    setWalletBalance(balanceAfter / LAMPORTS_PER_SOL)
    // Referral was bundled into this tx — clear it so it doesn't re-register on subsequent buys
    if (pendingReferrer) setPendingReferrer(null)

    if (won) {
      const isBigWin = prize >= 0.5
      if (isBigWin) {
        playBigWin()
      } else {
        playSmallWin()
      }
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 5000)
    } else {
      playLoss()
    }
  }

  const getActualMaxPrize = (cardMaxPrize: number) => {
    return cardMaxPrize
  }
  if (!mounted) return <div>Loading...</div>

  if (treasury?.paused) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: '#0a0a0f',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: 32, textAlign: 'center',
      }}>
        <div style={{ fontSize: 64 }}>🔧</div>
        <div style={{ color: '#ffd700', fontSize: 24, fontWeight: 'bold', fontFamily: 'monospace' }}>
          MAINTENANCE
        </div>
        <div style={{ color: '#aaa', fontSize: 15, maxWidth: 300, lineHeight: 1.6 }}>
          Seeker Scratch is temporarily down for maintenance. Check back soon!
        </div>
        <AdminPanel />
      </div>
    )
  }

  return (
    <>
      {/* Debug Panel Toggle */}
      <button
        onClick={() => setShowDebug(p => !p)}
        style={{ position: 'fixed', top: 10, right: 10, zIndex: 9999, background: 'red', color: 'white', padding: '4px 8px', fontSize: 10, borderRadius: 4, border: 'none', cursor: 'pointer' }}
      >
        DEBUG
      </button>

      {showDebug && (
        <div style={{ position: 'fixed', top: 30, left: 0, right: 0, bottom: 60, zIndex: 9998, background: 'rgba(0,0,0,0.95)', overflow: 'auto', padding: 8, fontSize: 9, color: '#0f0', fontFamily: 'monospace' }}>
          <button onClick={() => setDebugLogs([])} style={{ background: '#333', color: 'white', marginBottom: 8, padding: '2px 6px', border: 'none', cursor: 'pointer' }}>CLEAR</button>
          {debugLogs.map((l, i) => (
            <div key={i} style={{ borderBottom: '1px solid #111', padding: '2px 0', color: l.startsWith('[error]') ? '#f66' : '#0f0', wordBreak: 'break-all' }}>{l}</div>
          ))}
        </div>
      )}

      <div className="app">
        <header>
          <div className="logo">
            <div className="logo-icon">🎰</div>
            <div>
              <div className="logo-text">SEEKER SCRATCH</div>
              <div className="logo-sub">INSTANT WIN ON SOLANA</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={toggleMute}
              title={muted ? 'Unmute' : 'Mute'}
              style={{
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                color: muted ? 'var(--muted)' : 'var(--text)', fontSize: 18,
                lineHeight: 1,
              }}
            >
              {muted ? '🔇' : '🔊'}
            </button>
            <WalletButton />
          </div>
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
            <div style={{ fontSize: 13, color: 'var(--cyan)', marginBottom: 12, fontFamily: 'monospace' }}>📊 YOUR STATS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 14, color: '#a0aec0' }}>Scratched</div>
                <div style={{ fontSize: 18, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif" }}>{profile.cardsScratched}</div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: '#a0aec0' }}>Wins</div>
                <div style={{ fontSize: 18, color: 'var(--green)', fontFamily: "'Bebas Neue', sans-serif" }}>{profile.wins}</div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: '#a0aec0' }}>Points</div>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--green)', fontFamily: 'monospace' }}>
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
                          <div style={{ fontSize: 13, color: card.color, marginBottom: 6, fontFamily: 'monospace', letterSpacing: 1 }}>{card.tag}</div>
                          <div style={{ fontSize: 26, color: card.color, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, lineHeight: 1, marginBottom: 8 }}>{card.name}</div>

                        </div>
                        {/* Right: UP TO + cost button */}
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'monospace', marginBottom: 4 }}>UP TO</div>
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
          <ReferTab wallet={wallet} publicKey={wallet.publicKey} connection={connection} onClaimBonus={creditReferrer} />
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
            <span style={{ fontSize: 13, fontFamily: 'monospace' }}>{nav.label}</span>
          </div>
        ))}
      </div>
      <AdminPanel />
      <Confetti active={showConfetti} />
    </>
  )
}
