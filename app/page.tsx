'use client'
// v1.1
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
import ScratchReveal from './components/ScratchReveal'
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
  {
    id: 'QuickPick', name: 'QUICK PICK', cost: 0.01, maxPrize: 0.15, color: '#00d4ff', tag: '⚡ STARTER',
    hook: 'Win up to 15x your bet!',
    tiers: ['0.012', '0.020', '0.040', '0.080', '0.150'],
  },
  {
    id: 'HotShot', name: 'HOT SHOT', cost: 0.05, maxPrize: 2, color: '#ff006e', tag: '🔥 HIGH RISK',
    hook: 'Win up to 40x your bet!',
    tiers: ['0.100', '0.200', '0.500', '1.000', '2.000'],
  },
  {
    id: 'MegaGold', name: 'MEGA GOLD', cost: 0.1, maxPrize: 5, color: '#f5c842', tag: '✦ FEATURED',
    hook: 'Win up to 50x your bet!',
    tiers: ['0.200', '0.500', '1.000', '2.500', '5.000'],
  },
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
  const { treasury, profile, masterConfig, walletBalance, loading, fetchTreasury, fetchProfile, fetchAll, buyCard, freeScratch, registerReferral, creditReferrer } = useScratchProgram()
  const [mounted, setMounted] = useState(false)
  const [activeNav, setActiveNav] = useState('scratch')
  const [scratchState, setScratchState] = useState<{ won: boolean; prize: number; scratched: boolean } | null>(null)
  const [isWaitingForChain, setIsWaitingForChain] = useState(false)
  const [freeScratchState, setFreeScratchState] = useState<{ won: boolean; sweepPoints: number; scratched: boolean } | null>(null)
  const [freePlayTimeLeft, setFreePlayTimeLeft] = useState(0)
  const [showConfetti, setShowConfetti] = useState(false)
  const [pendingReferrer, setPendingReferrer] = useState<string | null>(null)
  const { muted, toggleMute, unlockAudio, playScratch, playSmallWin, playBigWin, playLoss } = useSound()

  useEffect(() => {
    setMounted(true)
    // Read ?ref= param once on mount — validate it's a plausible base58 pubkey
    // (wallet deep links append their own ?ref= with a URL, not a pubkey)
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ref)) setPendingReferrer(ref)
  }, [])

  // Countdown to next free play
  useEffect(() => {
    const update = () => {
      const lastPlay = profile?.lastFreePlayTimestamp ?? 0
      const cooldown = masterConfig?.freePlayCooldownSeconds ?? 86400
      const remaining = Math.max(0, (lastPlay + cooldown) - Math.floor(Date.now() / 1000))
      setFreePlayTimeLeft(remaining)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [profile?.lastFreePlayTimestamp, masterConfig?.freePlayCooldownSeconds])


  const handleBuyCard = async (cardType: string) => {
    if (!wallet.connected) { alert("Please connect your wallet first"); return }
    if (!wallet.publicKey) return

    // On mobile, only MWA or injected-wallet browsers can sign transactions.
    // Extension wallets (Phantom/Backpack/Solflare) connected from native Chrome
    // have no injected provider and fail with -32603 on both sign and send.
    if (typeof window !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      const isMWA = (wallet as any).wallet?.adapter?.name === 'Mobile Wallet Adapter'
      const hasInjected = !!(window as any).phantom?.solana || !!(window as any).solana ||
        !!(window as any).backpack || !!(window as any).solflare?.isSolflare
      if (!isMWA && !hasInjected) {
        const name = (wallet as any).wallet?.adapter?.name ?? 'your wallet'
        alert(`To buy cards on mobile, open this site inside ${name}'s in-app browser.\n\nTap the banner at the top of the page to open in ${name}.`)
        return
      }
    }

    // Unlock AudioContext synchronously inside the user gesture before any await.
    // iOS blocks AudioContext creation/resume after async work completes.
    unlockAudio()

    setScratchState(null)
    setShowConfetti(false)
    playScratch()

    const balanceBefore = await connection.getBalance(wallet.publicKey)
    console.log('Balance before:', balanceBefore)
    setIsWaitingForChain(true)
    try { await buyCard(cardType, pendingReferrer ?? undefined) } catch (err: any) {
      const msg = err?.message || ''
      if (msg.includes('insufficient lamports') || msg.includes('Insufficient funds') || msg.includes('0x1')) {
        alert('❌ Not enough SOL in your wallet. Please add funds and try again.')
      } else if (msg.includes('GamePaused') || msg.includes('6000')) {
        alert('⏸ The game is temporarily paused. Please try again soon.')
      } else if (msg.includes('TreasuryTooLow') || msg.includes('6003')) {
        alert('⚠️ Prize pool is refilling. Please try again in a moment.')
      } else if (/user rejected|rejected the request|cancelled/i.test(msg)) {
        // Silent — user cancelled, no alert needed
      } else {
        alert(formatBuyError(err))
      }
      setIsWaitingForChain(false)
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
    const netDiff = balanceAfter - balanceBefore
    console.log('Cost:', cost, 'Balance diff:', netDiff)

    // netDiff is negative on a loss (paid cost, no return) or negative-but-smaller on a win.
    // Add back the card cost to recover the actual prize amount paid out by the program.
    // e.g. paid 0.01 SOL, won 0.08 SOL → netDiff = +0.07 SOL → prize = 0.07 + 0.01 = 0.08 SOL
    const cardCostSol = cost / LAMPORTS_PER_SOL
    const won = netDiff > 5000 // positive balance change (ignoring dust) means a win
    const prize = won ? (netDiff / LAMPORTS_PER_SOL) + cardCostSol : 0
    console.log('Final result - won:', won, 'prize:', prize)
    setIsWaitingForChain(false)
    setScratchState({ won, prize, scratched: false })
    // Referral was bundled into this tx — clear it so it doesn't re-register on subsequent buys
    if (pendingReferrer) setPendingReferrer(null)
  }

  const handleRevealed = () => {
    setScratchState(prev => {
      if (!prev) return null
      if (prev.won) {
        const isBigWin = prev.prize >= 0.5
        if (isBigWin) playBigWin()
        else playSmallWin()
        setShowConfetti(true)
        setTimeout(() => setShowConfetti(false), 5000)
      } else {
        playLoss()
      }
      return { ...prev, scratched: true }
    })
  }

  const handleFreeScratch = async () => {
    if (!wallet.connected) { alert('Please connect your wallet first'); return }
    unlockAudio()
    setFreeScratchState(null)
    playScratch()
    try {
      const result = await freeScratch()
      setFreeScratchState({ ...result, scratched: false })
    } catch (err: any) {
      const msg = err?.message || ''
      if (msg.includes('FreePlayNotReady') || msg.includes('6014')) {
        alert('⏰ Free play not ready yet! Come back later.')
      } else if (/user rejected|rejected the request|cancelled/i.test(msg)) {
        // silent
      } else {
        alert(msg.slice(0, 120))
      }
    }
  }

  const handleFreeRevealed = () => {
    setFreeScratchState(prev => {
      if (!prev) return null
      if (prev.won) {
        playSmallWin()
        setShowConfetti(true)
        setTimeout(() => setShowConfetti(false), 3000)
      } else {
        playLoss()
      }
      return { ...prev, scratched: true }
    })
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
        <div style={{ color: '#ffffffdd', fontSize: 15, maxWidth: 300, lineHeight: 1.6 }}>
          Seeker Scratch is temporarily down for maintenance. Check back soon!
        </div>
        <AdminPanel />
      </div>
    )
  }

  return (
    <>
      <div className="app">
        {/* Announcement Banner */}
        {masterConfig?.bannerActive && masterConfig?.bannerText && (
          <div style={{
            background: '#ffd700', color: '#0a0a0f',
            padding: '10px 16px', textAlign: 'center',
            fontSize: 13, fontWeight: 'bold', fontFamily: 'monospace',
            letterSpacing: 0.5, lineHeight: 1.4,
          }}>
            📢 {masterConfig.bannerText}
          </div>
        )}
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
            <div className="balance-value gold">{wallet.publicKey ? walletBalance.toFixed(3) + ' SOL' : '—'}</div>
          </div>
          <div className="balance-divider" />
          <div className="balance-item">
            <div className="balance-label">Total Won</div>
            <div className="balance-value green">{profile ? (profile.totalWon || 0).toFixed(3) + ' SOL' : wallet.publicKey ? '…' : '—'}</div>
          </div>
          <div className="balance-divider" />
          <div className="balance-item">
            <div className="balance-label">Points</div>
            <div className="balance-value">{profile ? (profile.pointsThisMonth || 0) : wallet.publicKey ? '…' : '—'}</div>
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
            <span>ON-CHAIN VERIFIED</span>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-cell">
            <div className="stat-value text-gold">{treasury ? treasury.totalCardsSold : '…'}</div>
            <div className="stat-label">Cards Sold</div>
          </div>
          <div className="stat-cell">
            <div className="stat-value text-green">{treasury ? (treasury.totalWins ?? 0) : '…'}</div>
            <div className="stat-label">Total Winners</div>          </div>
          <div className="stat-cell">
            <div className="stat-value text-cyan">{treasury ? treasury.balance.toFixed(2) : '…'}</div>
            <div className="stat-label">Prize Pool</div>
          </div>
        </div>

        {profile && (
          <div style={{ marginBottom: 20, padding: 16, background: 'var(--surface)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--cyan)', marginBottom: 12, fontFamily: 'monospace' }}>📊 YOUR STATS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 14, color: '#ffffffdd' }}>Scratched</div>
                <div style={{ fontSize: 18, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif" }}>{profile.cardsScratched}</div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: '#ffffffdd' }}>Wins</div>
                <div style={{ fontSize: 18, color: 'var(--green)', fontFamily: "'Bebas Neue', sans-serif" }}>{profile.wins}</div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: '#ffffffdd' }}>Points</div>
                <div style={{ fontSize: 18, color: 'var(--gold)', fontFamily: "'Bebas Neue', sans-serif" }}>{profile.pointsThisMonth}</div>
              </div>
            </div>
          </div>
        )}

        {wallet.connected && <WinnerBanner wallet={wallet} publicKey={wallet.publicKey} connection={connection} />}
        {/* SCRATCH TAB */}
        {activeNav === 'scratch' && (
          <>
            {/* Waiting for chain confirmation */}
            {isWaitingForChain && (
              <div style={{
                marginBottom: 20,
                height: 140,
                borderRadius: 16,
                overflow: 'hidden',
                background: 'linear-gradient(135deg, #0d1b2a 0%, #1a1040 50%, #0d1b2a 100%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ fontSize: 28, animation: 'pulse 1.2s ease-in-out infinite' }}>🔗</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace', letterSpacing: 2, animation: 'pulse 1.2s ease-in-out infinite' }}>
                  CONFIRMING ON-CHAIN...
                </div>
              </div>
            )}

            {/* Scratch card — shown while unscratched */}
            {scratchState && !scratchState.scratched && (
              <div style={{
                position: 'relative',
                marginBottom: 20,
                height: 140,
                borderRadius: 16,
                overflow: 'hidden',
              }}>
                {/* Background revealed as coating is scratched */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(135deg, #0d1b2a 0%, #1a1040 50%, #0d1b2a 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                }}>
                  <div style={{ fontSize: 28, letterSpacing: 12, opacity: 0.85 }}>🎰 🎰 🎰</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace', letterSpacing: 2 }}>YOUR RESULT IS HIDDEN</div>
                </div>
                <ScratchReveal onRevealed={handleRevealed} />
              </div>
            )}

            {/* Result — shown after scratching */}
            {scratchState && scratchState.scratched && (
              <div
                className={`result-container ${scratchState.won ? 'result-win' : 'result-loss'}`}
                style={{
                  marginBottom: 20,
                  padding: 24,
                  background: scratchState.won ? 'rgba(0,255,136,0.08)' : 'rgba(255,68,68,0.08)',
                  border: `2px solid ${scratchState.won ? 'var(--green)' : 'var(--red)'}`,
                  borderRadius: 16,
                  textAlign: 'center',
                }}
              >
                {scratchState.won ? (
                  <>
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
                      +{scratchState.prize.toFixed(3)}
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
                {/* ── Free Play Card ── */}
                {wallet.connected && (
                  <div style={{ marginBottom: 16 }}>
                    {/* Free scratch reveal animation */}
                    {freeScratchState && !freeScratchState.scratched && (
                      <div style={{ position: 'relative', marginBottom: 12, height: 120, borderRadius: 16, overflow: 'hidden' }}>
                        <div style={{
                          position: 'absolute', inset: 0,
                          background: 'linear-gradient(135deg, #0d1b2a 0%, #102040 50%, #0d1b2a 100%)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}>
                          <div style={{ fontSize: 24, opacity: 0.7 }}>🎟️ 🎟️ 🎟️</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace', letterSpacing: 2 }}>SCRATCH TO REVEAL</div>
                        </div>
                        <ScratchReveal onRevealed={handleFreeRevealed} />
                      </div>
                    )}

                    {/* Free scratch result */}
                    {freeScratchState && freeScratchState.scratched && (
                      <div style={{
                        marginBottom: 12, padding: 16, borderRadius: 16, textAlign: 'center',
                        background: freeScratchState.won ? 'rgba(0,212,255,0.08)' : 'rgba(100,100,100,0.08)',
                        border: `2px solid ${freeScratchState.won ? '#00d4ff' : '#333'}`,
                      }}>
                        {freeScratchState.won ? (
                          <>
                            <div style={{ fontSize: 22, color: '#00d4ff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, marginBottom: 4 }}>
                              🎉 YOU WON!
                            </div>
                            <div style={{ fontSize: 36, color: '#00d4ff', fontFamily: "'Bebas Neue', sans-serif" }}>
                              +{freeScratchState.sweepPoints} SWEEP POINTS
                            </div>
                            <div style={{ fontSize: 12, color: '#ffffffdd', marginTop: 4 }}>Keep climbing the leaderboard!</div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: 18, color: '#888', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>
                              Better luck tomorrow!
                            </div>
                            <div style={{ fontSize: 13, color: '#00d4ff', marginTop: 4 }}>
                              +{freeScratchState.sweepPoints} SWEEP POINT for playing
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Free play card button or countdown */}
                    <div style={{
                      padding: '16px 20px',
                      background: 'linear-gradient(135deg, rgba(0,212,255,0.06) 0%, var(--surface) 60%)',
                      border: '1px solid rgba(0,212,255,0.3)',
                      borderLeft: '4px solid #00d4ff',
                      borderRadius: 16,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 13, color: '#00d4ff', marginBottom: 4, fontFamily: 'monospace', letterSpacing: 1 }}>🎟️ FREE DAILY PLAY</div>
                          <div style={{ fontSize: 11, color: '#ffffffdd', fontFamily: 'monospace' }}>
                            {freePlayTimeLeft === 0 ? 'Scratch free, win Sweep Points' : 'Come back tomorrow!'}
                          </div>
                        </div>
                        {freePlayTimeLeft === 0 ? (
                          <button
                            onClick={handleFreeScratch}
                            disabled={loading}
                            style={{
                              padding: '10px 16px', border: '1px solid #00d4ff',
                              borderRadius: 8, background: 'rgba(0,212,255,0.15)',
                              color: '#00d4ff', fontFamily: 'monospace', fontWeight: 'bold',
                              fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            CLAIM FREE PLAY
                          </button>
                        ) : (
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: '#ffffffdd', fontFamily: 'monospace' }}>NEXT FREE PLAY IN</div>
                            <div style={{ fontSize: 16, color: '#00d4ff', fontFamily: 'monospace' }}>
                              {String(Math.floor(freePlayTimeLeft / 3600)).padStart(2,'0')}:
                              {String(Math.floor((freePlayTimeLeft % 3600) / 60)).padStart(2,'0')}:
                              {String(freePlayTimeLeft % 60).padStart(2,'0')}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

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
                    const enabledKey = card.id === 'QuickPick' ? 'quickpickEnabled' : card.id === 'HotShot' ? 'hotshotEnabled' : 'megagoldEnabled'
                    const isDisabled = masterConfig !== null && masterConfig[enabledKey] === false
                    return (
                      <div
                        key={card.id}
                        onClick={() => !isDisabled && handleBuyCard(card.id)}
                        style={{
                          position: 'relative',
                          padding: '20px 24px',
                          background: `linear-gradient(135deg, ${card.color}18 0%, var(--surface) 60%)`,
                          border: `1px solid ${card.color}44`,
                          borderLeft: `4px solid ${card.color}`,
                          borderRadius: 16,
                          cursor: loading || isDisabled ? 'not-allowed' : 'pointer',
                          opacity: loading || isDisabled ? 0.5 : 1,
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
                        {/* Left: tag + name + hook + tiers */}
                        <div>
                          <div style={{ fontSize: 13, color: card.color, marginBottom: 6, fontFamily: 'monospace', letterSpacing: 1 }}>{card.tag}</div>
                          <div style={{ fontSize: 26, color: card.color, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, lineHeight: 1, marginBottom: 4 }}>{card.name}</div>
                          <div style={{ fontSize: 13, color: card.color, opacity: 0.8, fontFamily: 'monospace' }}>{card.hook}</div>
                        </div>
                        {/* Right: UP TO + cost button */}
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'monospace', marginBottom: 4 }}>UP TO</div>
                          <div style={{ fontSize: 42, color: card.color, fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1, marginBottom: 2 }}>
                            {actualMaxPrize >= 1 ? actualMaxPrize.toFixed(0) : actualMaxPrize.toFixed(2)}
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
                        {/* Coming Soon overlay when disabled */}
                        {isDisabled && (
                          <div style={{
                            position: 'absolute', inset: 0, borderRadius: 16,
                            background: 'rgba(0,0,0,0.6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span style={{ color: '#ffffffdd', fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 2 }}>
                              COMING SOON
                            </span>
                          </div>
                        )}
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
          <PrizesTab connection={connection} />
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
      <div style={{
        textAlign: 'center', padding: '8px 16px 72px',
        fontSize: 11, color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace', lineHeight: 1.6,
      }}>
        Free daily play available. No purchase necessary.<br />
        Seeker Scratch is a sweepstakes game. 18+ only. Void where prohibited by law.
      </div>
      <AdminPanel />
      <Confetti active={showConfetti} />
    </>
  )
}
