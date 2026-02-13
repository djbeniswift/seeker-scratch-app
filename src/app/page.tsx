'use client'

import { useState, useEffect, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import WalletButton from './components/WalletButton'
import { useScratchProgram } from './hooks/useScratchProgram'
import { useTreasuryContext } from './contexts/TreasuryContext'
import { useSettings } from './contexts/SettingsContext'
import { useLeaderboard } from './contexts/LeaderboardContext'
import ScratchModal from './components/ScratchModal'
import { NFT_TIERS } from './lib/constants'

const IMGBB_API_KEY = process.env.NEXT_PUBLIC_IMGBB_API_KEY || process.env.next_public_imgbb_api_key || ''

// Monthly rewards - easy to update!
const MONTHLY_REWARDS = [
  { place: '1st', sol: '0.25 SOL', skr: '500 SKR', emoji: '🥇', color: 'var(--gold)' },
  { place: '2nd', sol: '0.15 SOL', skr: '250 SKR', emoji: '🥈', color: '#c0c0c0' },
  { place: '3rd', sol: '0.1 SOL', skr: '100 SKR', emoji: '🥉', color: '#cd7f32' },
]

// Referral rewards - easy to update!
const REFERRAL_REWARDS = [
  { place: '1st', sol: '0.25 SOL', emoji: '🥇', color: 'var(--gold)' },
  { place: '2nd', sol: '0.15 SOL', emoji: '🥈', color: '#c0c0c0' },
  { place: '3rd', sol: '0.1 SOL', emoji: '🥉', color: '#cd7f32' },
]

export default function Home() {
  const wallet = useWallet()
  const {
    treasury,
    profile,
    solBalance,
    loading,
    buyAndScratch,
    updateProfile,
    registerReferral,
    mintBonusNft,
    fetchTreasury,
    fetchProfile,
    fetchBalance,
  } = useScratchProgram()

  const { treasuryBalance, refreshTreasury } = useTreasuryContext()
  const { soundEnabled, hapticsEnabled, toggleSound, toggleHaptics } = useSettings()
  const { leaderboard, isLoading: leaderboardLoading, getUserRank, refreshLeaderboard } = useLeaderboard()

  const [mounted, setMounted] = useState(false)
  const [activeCard, setActiveCard] = useState<string | null>(null)
  const [activeNav, setActiveNav] = useState('scratch')
  const [copyStatus, setCopyStatus] = useState('')
  
  // Profile editing state
  const [editingProfile, setEditingProfile] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPfp, setEditPfp] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (profile) {
      setEditName(profile.displayName || '')
      setEditPfp(profile.pfpUrl || '')
    }
  }, [profile])

  useEffect(() => {
    if (!mounted) return
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref && wallet.publicKey && !profile?.referredBy) {
      registerReferral(ref).catch(() => {})
    }
  }, [mounted, wallet.publicKey, profile?.referredBy, registerReferral])

  const handleBuy = async (cardType: string): Promise<number> => {
    const prize = await buyAndScratch(cardType)
    refreshTreasury()
    setTimeout(() => refreshLeaderboard(), 2000)
    return prize
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setProfileError('Please select an image file')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setProfileError('Image must be less than 2MB')
      return
    }

    setUploadingImage(true)
    setProfileError('')

    try {
      const formData = new FormData()
      formData.append('image', file)

      const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (data.success) {
        setEditPfp(data.data.url)
      } else {
        setProfileError('Failed to upload image')
      }
    } catch (err) {
      setProfileError('Failed to upload image')
      console.error('Upload error:', err)
    } finally {
      setUploadingImage(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!wallet.publicKey) return
    
    setProfileSaving(true)
    setProfileError('')
    
    try {
      await updateProfile(
        editName.trim() || null,
        editPfp.trim() || null
      )
      setEditingProfile(false)
      refreshLeaderboard()
    } catch (err: any) {
      setProfileError(err?.message || 'Failed to save profile')
    } finally {
      setProfileSaving(false)
    }
  }

  const copyReferralLink = async () => {
    if (!wallet.publicKey) return
    
    const link = `${window.location.origin}?ref=${wallet.publicKey.toString()}`
    
    try {
      await navigator.clipboard.writeText(link)
      setCopyStatus('✅ Copied!')
      setTimeout(() => setCopyStatus(''), 2000)
    } catch (err) {
      const textArea = document.createElement('textarea')
      textArea.value = link
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        setCopyStatus('✅ Copied!')
        setTimeout(() => setCopyStatus(''), 2000)
      } catch (e) {
        setCopyStatus('❌ Failed to copy')
        setTimeout(() => setCopyStatus(''), 2000)
      }
      document.body.removeChild(textArea)
    }
  }

  const nftMultiplier = profile?.nftMultiplierCache || 1
  const nftTierName = nftMultiplier === 2 ? 'Silver'
    : nftMultiplier === 5 ? 'Gold'
    : nftMultiplier === 10 ? 'Platinum'
    : nftMultiplier === 20 ? 'Diamond'
    : null

  const displayTreasuryBalance = treasury?.balance ?? treasuryBalance ?? 0
  const displayTotalCardsSold = treasury?.totalCardsSold ?? 0
  const displayPayoutRate = treasury 
    ? Math.round((treasury.totalPaidOut / Math.max(treasury.totalPaidOut + treasury.totalProfit, 1)) * 100)
    : 0

  const userRank = wallet.publicKey ? getUserRank(wallet.publicKey.toString()) : null
  const userPoints = profile?.pointsThisMonth || 0

  if (!mounted) {
    return (
      <div className="app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--muted)', fontFamily: 'monospace' }}>Loading...</div>
      </div>
    )
  }

  return (
    <>
      <div className="app">

        {/* ── HEADER ── */}
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

        {/* ── BALANCE BAR ── */}
        <div className="balance-bar">
          <div className="balance-item">
            <div className="balance-label">Balance</div>
            <div className="balance-value gold">{solBalance.toFixed(3)} SOL</div>
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

        {/* ── FEATURE BANNER ── */}
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

        {/* ── STATS ── */}
        <div className="stats-row">
          <div className="stat-cell">
            <div className="stat-value text-gold">{displayTotalCardsSold.toLocaleString()}</div>
            <div className="stat-label">Cards Sold</div>
          </div>
          <div className="stat-cell">
            <div className="stat-value text-green">{displayPayoutRate}%</div>
            <div className="stat-label">Payout Rate</div>
          </div>
          <div className="stat-cell">
            <div className="stat-value text-cyan">{displayTreasuryBalance.toFixed(2)}</div>
            <div className="stat-label">Prize Pool</div>
          </div>
        </div>

        {/* ── SCRATCH TAB ── */}
        {activeNav === 'scratch' && (
          <>
            <div className="section-header">
              <div className="section-title">CHOOSE YOUR CARD</div>
              <div className="section-badge badge-live">● LIVE</div>
            </div>

            <div className="cards-grid">
              <div
                className="scratch-card card-gold featured"
                onClick={() => setActiveCard('MegaGold')}
                style={{ opacity: displayTreasuryBalance < 5 ? 0.5 : 1 }}
              >
                <div className="card-grid-pattern" />
                <div className="card-featured-inner">
                  <div>
                    <div className="card-tag tag-gold">✦ FEATURED</div>
                    <div className="card-name-lg text-gold">MEGA<br />GOLD</div>
                    <div className="card-subtitle">Highest jackpot on Seeker</div>
                    <div className="card-cost">
                      <div className="cost-pill text-gold">0.1 SOL</div>
                      <div className="odds-text">
                        {displayTreasuryBalance < 5 ? '🔒 LOW TREASURY' : '1 in 3 wins'}
                      </div>
                    </div>
                  </div>
                  <div className="featured-right">
                    <div className="featured-jackpot-label">TOP PRIZE</div>
                    <div className="prize-amount-lg text-gold">
                      {Math.min(10, displayTreasuryBalance / 2).toFixed(0)}
                      <span className="prize-sol">SOL</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="scratch-card card-cyan" onClick={() => setActiveCard('QuickPick')}>
                <div className="card-grid-pattern" />
                <div className="card-inner">
                  <div>
                    <div className="card-tag tag-cyan">⚡ STARTER</div>
                    <div className="card-name text-cyan">QUICK PICK</div>
                    <div className="card-subtitle">Micro stakes, instant fun</div>
                    <div className="card-cost">
                      <div className="cost-pill text-cyan">0.01 SOL</div>
                      <div className="odds-text">1 in 4 wins</div>
                    </div>
                  </div>
                  <div className="card-prize">
                    <div className="prize-label">UP TO</div>
                    <div className="prize-amount text-cyan">0.5<span className="prize-sol">SOL</span></div>
                  </div>
                </div>
              </div>

              <div className="scratch-card card-purple" onClick={() => setActiveCard('Lucky7s')}>
                <div className="card-grid-pattern" />
                <div className="card-inner">
                  <div>
                    <div className="card-tag tag-purple">🍀 POPULAR</div>
                    <div className="card-name text-purple">LUCKY 7s</div>
                    <div className="card-subtitle">Mid-tier balanced play</div>
                    <div className="card-cost">
                      <div className="cost-pill text-purple">0.05 SOL</div>
                      <div className="odds-text">1 in 3 wins</div>
                    </div>
                  </div>
                  <div className="card-prize">
                    <div className="prize-label">UP TO</div>
                    <div className="prize-amount text-purple">2<span className="prize-sol">SOL</span></div>
                  </div>
                </div>
              </div>

              <div className="scratch-card card-red" onClick={() => setActiveCard('HotShot')}>
                <div className="card-grid-pattern" />
                <div className="card-inner">
                  <div>
                    <div className="card-tag tag-red">🔥 HIGH RISK</div>
                    <div className="card-name text-red">HOT SHOT</div>
                    <div className="card-subtitle">Big risk, big reward</div>
                    <div className="card-cost">
                      <div className="cost-pill text-red">0.05 SOL</div>
                      <div className="odds-text">1 in 4 wins</div>
                    </div>
                  </div>
                  <div className="card-prize">
                    <div className="prize-label">UP TO</div>
                    <div className="prize-amount text-red">5<span className="prize-sol">SOL</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Points Card */}
            <div className="points-card">
              <div className="points-header">
                <div className="points-icon">⭐</div>
                <div>
                  <div className="points-title">LOYALTY POINTS</div>
                  <div className="points-sub">Earn with every scratch • Redeem for prizes</div>
                </div>
              </div>
              <button 
                className="cta-btn btn-gold" 
                style={{ marginBottom: 12, fontSize: 14 }}
                onClick={() => setActiveNav('profile')}
              >
                {nftTierName ? `${nftTierName.toUpperCase()} NFT ACTIVE — ${nftMultiplier}X POINTS` : 'GET BONUS NFT — MULTIPLY POINTS'}
              </button>
              <div className="points-progress">
                <div
                  className="points-fill"
                  style={{ width: `${Math.min(((profile?.pointsThisMonth || 0) / 1000) * 100, 100)}%` }}
                />
              </div>
              <div className="points-footer">
                <span>{profile?.pointsThisMonth || 0} pts</span>
                <span>Compete for monthly prizes!</span>
              </div>
            </div>
          </>
        )}

        {/* ── RANKS TAB ── */}
        {activeNav === 'ranks' && (
          <div style={{ paddingTop: 8 }}>
            <div className="section-header">
              <div className="section-title">MONTHLY LEADERBOARD</div>
              <div className="section-badge badge-live">● LIVE</div>
            </div>

            {wallet.publicKey && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(245,200,66,0.1), rgba(245,200,66,0.05))',
                border: '1px solid rgba(245,200,66,0.2)',
                borderRadius: 16,
                padding: '16px 20px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', marginBottom: 4 }}>YOUR RANK</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: 'var(--gold)' }}>
                    {userRank ? `#${userRank}` : '--'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', marginBottom: 4 }}>YOUR POINTS</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: 'var(--text)' }}>
                    {profile?.pointsThisMonth || 0}
                  </div>
                </div>
              </div>
            )}

            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 20,
              overflow: 'hidden',
            }}>
              {leaderboardLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontFamily: 'monospace', fontSize: 13 }}>
                  Loading leaderboard...
                </div>
              ) : leaderboard.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontFamily: 'monospace', fontSize: 13 }}>
                  🏆 Be the first to play and claim #1!
                </div>
              ) : (
                <>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '50px 1fr 80px 80px',
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 10,
                    color: 'var(--muted)',
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}>
                    <div>Rank</div>
                    <div>Player</div>
                    <div style={{ textAlign: 'right' }}>Points</div>
                    <div style={{ textAlign: 'right' }}>Won</div>
                  </div>

                  {leaderboard.slice(0, 20).map((entry, index) => {
                    const isUser = wallet.publicKey?.toString() === entry.wallet
                    const rank = index + 1
                    const medalEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
                    const displayNameOrWallet = entry.displayName || entry.walletShort

                    return (
                      <div
                        key={entry.wallet}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '50px 1fr 80px 80px',
                          padding: '14px 16px',
                          borderBottom: index < Math.min(leaderboard.length, 20) - 1 ? '1px solid var(--border)' : 'none',
                          background: isUser ? 'rgba(245,200,66,0.08)' : 'transparent',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{
                          fontFamily: "'Bebas Neue', sans-serif",
                          fontSize: 18,
                          color: rank <= 3 ? 'var(--gold)' : 'var(--muted)',
                        }}>
                          {medalEmoji || `#${rank}`}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {entry.pfpUrl ? (
                            <img 
                              src={entry.pfpUrl} 
                              alt="" 
                              style={{ 
                                width: 28, 
                                height: 28, 
                                borderRadius: '50%', 
                                objectFit: 'cover',
                                border: '2px solid var(--border)',
                              }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          ) : (
                            <div style={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              background: 'var(--surface2)',
                              border: '2px solid var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                            }}>
                              👤
                            </div>
                          )}
                          <div>
                            <div style={{
                              fontFamily: 'monospace',
                              fontSize: 12,
                              color: isUser ? 'var(--gold)' : 'var(--text)',
                            }}>
                              {displayNameOrWallet}
                              {isUser && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--green)' }}>YOU</span>}
                            </div>
                            {entry.displayName && (
                              <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>
                                {entry.walletShort}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{
                          textAlign: 'right',
                          fontFamily: 'monospace',
                          fontSize: 13,
                          color: 'var(--text)',
                          fontWeight: rank <= 3 ? 'bold' : 'normal',
                        }}>
                          {entry.pointsThisMonth.toLocaleString()}
                        </div>
                        <div style={{
                          textAlign: 'right',
                          fontFamily: 'monospace',
                          fontSize: 12,
                          color: 'var(--green)',
                        }}>
                          {entry.totalWon.toFixed(2)}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            <button
              onClick={refreshLeaderboard}
              disabled={leaderboardLoading}
              style={{
                width: '100%',
                marginTop: 16,
                padding: '12px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                color: 'var(--text)',
                fontFamily: 'monospace',
                fontSize: 12,
                cursor: 'pointer',
                opacity: leaderboardLoading ? 0.5 : 1,
              }}
            >
              {leaderboardLoading ? 'REFRESHING...' : '🔄 REFRESH LEADERBOARD'}
            </button>
          </div>
        )}

        {/* ── PRIZES TAB ── */}
        {activeNav === 'prizes' && (
          <div style={{ paddingTop: 8 }}>
            <div className="section-header">
              <div className="section-title">MONTHLY REWARDS</div>
              <div className="section-badge" style={{ background: 'rgba(0,255,136,0.1)', color: 'var(--green)' }}>🎁 WIN</div>
            </div>

            {/* User's current stats */}
            {wallet.publicKey && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(245,200,66,0.1), rgba(245,200,66,0.05))',
                border: '1px solid rgba(245,200,66,0.2)',
                borderRadius: 16,
                padding: '16px',
                marginBottom: 20,
                display: 'flex',
                justifyContent: 'space-around',
                textAlign: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', marginBottom: 2 }}>POINTS</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: 'var(--gold)' }}>
                    {userPoints.toLocaleString()}
                  </div>
                </div>
                <div style={{ width: 1, background: 'rgba(245,200,66,0.2)' }} />
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', marginBottom: 2 }}>RANK</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: userRank && userRank <= 3 ? 'var(--green)' : 'var(--text)' }}>
                    {userRank ? `#${userRank}` : '--'}
                  </div>
                </div>
                <div style={{ width: 1, background: 'rgba(245,200,66,0.2)' }} />
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', marginBottom: 2 }}>REFERRALS</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: 'var(--cyan)' }}>
                    {profile?.referralsCount || 0}
                  </div>
                </div>
              </div>
            )}

            {/* POINTS COMPETITION */}
            <div style={{ 
              fontSize: 13, 
              color: 'var(--gold)', 
              fontFamily: "'Bebas Neue', sans-serif", 
              letterSpacing: 2,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              🏆 TOP POINTS
            </div>

            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              overflow: 'hidden',
              marginBottom: 20,
            }}>
              {MONTHLY_REWARDS.map((reward, index) => {
                const isUserRank = userRank === index + 1
                
                return (
                  <div
                    key={`points-${reward.place}`}
                    style={{
                      padding: '14px 16px',
                      borderBottom: index < MONTHLY_REWARDS.length - 1 ? '1px solid var(--border)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: isUserRank ? 'rgba(0,255,136,0.08)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 28 }}>{reward.emoji}</div>
                      <div style={{ 
                        fontFamily: "'Bebas Neue', sans-serif", 
                        fontSize: 18, 
                        letterSpacing: 1, 
                        color: reward.color,
                      }}>
                        {reward.place}
                        {isUserRank && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--green)', fontFamily: 'monospace' }}>YOU</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--green)' }}>{reward.sol}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--cyan)', marginLeft: 8 }}>+ {reward.skr}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* REFERRAL COMPETITION */}
            <div style={{ 
              fontSize: 13, 
              color: 'var(--cyan)', 
              fontFamily: "'Bebas Neue', sans-serif", 
              letterSpacing: 2,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              🤝 TOP REFERRERS
            </div>

            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              overflow: 'hidden',
              marginBottom: 20,
            }}>
              {REFERRAL_REWARDS.map((reward, index) => (
                <div
                  key={`ref-${reward.place}`}
                  style={{
                    padding: '14px 16px',
                    borderBottom: index < REFERRAL_REWARDS.length - 1 ? '1px solid var(--border)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 28 }}>{reward.emoji}</div>
                    <div style={{ 
                      fontFamily: "'Bebas Neue', sans-serif", 
                      fontSize: 18, 
                      letterSpacing: 1, 
                      color: reward.color,
                    }}>
                      {reward.place}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--green)' }}>
                    {reward.sol}
                  </div>
                </div>
              ))}
            </div>

            {/* How it works */}
            <div style={{ 
              padding: 16, 
              background: 'var(--surface)', 
              borderRadius: 12,
              border: '1px solid var(--border)',
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'monospace', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                📢 How to earn points
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace', lineHeight: 1.8 }}>
                • Scratch cards to earn points<br />
                • NFT holders earn <span style={{ color: 'var(--gold)' }}>{nftMultiplier}x</span> points per scratch<br />
                • Refer friends for <span style={{ color: 'var(--cyan)' }}>bonus points</span><br />
                • Points & rankings reset monthly
              </div>
            </div>

            <div style={{ 
              padding: 16, 
              background: 'linear-gradient(135deg, rgba(0,212,255,0.1), rgba(0,212,255,0.05))', 
              borderRadius: 12,
              border: '1px solid rgba(0,212,255,0.2)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--cyan)', fontFamily: 'monospace', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                🤝 Referral rules
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace', lineHeight: 1.8 }}>
                • Share your link from the <span style={{ color: 'var(--cyan)' }}>Refer</span> tab<br />
                • Referral counts after friend spends <span style={{ color: 'var(--gold)' }}>0.1 SOL</span><br />
                • Both you AND your friend get <span style={{ color: 'var(--green)' }}>bonus points</span><br />
                • Top 3 referrers win SOL prizes!
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                onClick={() => setActiveNav('ranks')}
                className="cta-btn"
                style={{ 
                  flex: 1, 
                  fontSize: 13,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              >
                🏆 LEADERBOARD
              </button>
              <button
                onClick={() => setActiveNav('refer')}
                className="cta-btn btn-gold"
                style={{ flex: 1, fontSize: 13 }}
              >
                🤝 GET REFERRAL LINK
              </button>
            </div>
          </div>
        )}

        {/* ── REFER TAB ── */}
        {activeNav === 'refer' && (
          <div style={{ paddingTop: 8 }}>
            <div className="section-header">
              <div className="section-title">REFERRALS</div>
            </div>

            <div style={{ 
              fontSize: 12, 
              color: 'var(--muted)', 
              fontFamily: 'monospace', 
              marginBottom: 20, 
              lineHeight: 1.6,
              textAlign: 'center',
            }}>
              Invite friends and earn bonus points when they play!
            </div>

            <div className="points-card" style={{ marginBottom: 16 }}>
              <div className="points-title" style={{ marginBottom: 8 }}>YOUR REFERRAL LINK</div>
              <div style={{
                background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px',
                fontFamily: 'monospace', fontSize: 10, color: 'var(--text)',
                border: '1px solid var(--border)', marginBottom: 12,
                wordBreak: 'break-all',
                lineHeight: 1.4,
              }}>
                {wallet.publicKey
                  ? `${typeof window !== 'undefined' ? window.location.origin : ''}?ref=${wallet.publicKey.toString()}`
                  : 'Connect wallet to get your link'}
              </div>
              <button
                className="cta-btn btn-gold"
                style={{ fontSize: 14, padding: 14 }}
                onClick={copyReferralLink}
                disabled={!wallet.publicKey}
              >
                {copyStatus || '📋 COPY REFERRAL LINK'}
              </button>
            </div>

            {/* Referral stats */}
            <div className="points-card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                <div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: 'var(--gold)' }}>
                    {profile?.referralsCount || 0}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>REFERRALS</div>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: 'var(--green)' }}>
                    {((profile?.referralsCount || 0) * 10 * nftMultiplier).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>BONUS PTS</div>
                </div>
              </div>
            </div>

            {/* How referrals work */}
            <div style={{ 
              padding: 16, 
              background: 'linear-gradient(135deg, rgba(0,212,255,0.1), rgba(0,212,255,0.05))', 
              borderRadius: 12,
              border: '1px solid rgba(0,212,255,0.2)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--cyan)', fontFamily: 'monospace', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                🤝 How it works
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace', lineHeight: 1.8 }}>
                1. Share your link with friends<br />
                2. They sign up and play<br />
                3. After they spend <span style={{ color: 'var(--gold)' }}>0.1 SOL</span>, you both get points!<br />
                4. Top 3 referrers win <span style={{ color: 'var(--green)' }}>SOL prizes</span> monthly
              </div>
            </div>

            {/* View prizes button */}
            <button
              onClick={() => setActiveNav('prizes')}
              className="cta-btn"
              style={{ 
                marginTop: 16, 
                fontSize: 13,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            >
              🎁 VIEW REFERRAL PRIZES
            </button>
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {activeNav === 'profile' && (
          <div style={{ paddingTop: 8 }}>
            <div className="section-header">
              <div className="section-title">YOUR PROFILE</div>
            </div>
            
            {wallet.publicKey && (
              <div className="points-card" style={{ marginBottom: 16 }}>
                {editingProfile ? (
                  <>
                    <div style={{ marginBottom: 20, textAlign: 'center' }}>
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        style={{ 
                          width: 100, 
                          height: 100, 
                          borderRadius: '50%', 
                          margin: '0 auto 12px',
                          background: editPfp ? `url(${editPfp}) center/cover` : 'var(--surface2)',
                          border: '3px solid var(--gold)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        {!editPfp && <span style={{ fontSize: 32 }}>👤</span>}
                        <div style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: 'rgba(0,0,0,0.7)',
                          padding: '6px 0',
                          fontSize: 10,
                          color: 'white',
                          fontFamily: 'monospace',
                        }}>
                          {uploadingImage ? '⏳' : '📷 CHANGE'}
                        </div>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        style={{ display: 'none' }}
                      />
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>
                        Tap to upload (max 2MB)
                      </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', display: 'block', marginBottom: 6 }}>
                        DISPLAY NAME (max 16 chars)
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value.replace(/[^a-zA-Z0-9 _]/g, '').slice(0, 16))}
                        placeholder="Enter display name..."
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          background: 'var(--surface2)',
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          color: 'var(--text)',
                          fontFamily: 'monospace',
                          fontSize: 14,
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', marginTop: 4 }}>
                        Letters, numbers, spaces, underscores only
                      </div>
                    </div>

                    {profileError && (
                      <div style={{ color: '#ff6b6b', fontSize: 12, fontFamily: 'monospace', marginBottom: 12, textAlign: 'center' }}>
                        {profileError}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        className="cta-btn btn-gold"
                        onClick={handleSaveProfile}
                        disabled={profileSaving || uploadingImage}
                        style={{ flex: 1, fontSize: 14 }}
                      >
                        {profileSaving ? '⏳ SAVING...' : '💾 SAVE PROFILE'}
                      </button>
                      <button
                        className="cta-btn"
                        onClick={() => {
                          setEditingProfile(false)
                          setEditName(profile?.displayName || '')
                          setEditPfp(profile?.pfpUrl || '')
                          setProfileError('')
                        }}
                        style={{ 
                          flex: 0, 
                          padding: '14px 20px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: 'var(--text)',
                        }}
                      >
                        CANCEL
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                      {profile?.pfpUrl ? (
                        <img 
                          src={profile.pfpUrl} 
                          alt="" 
                          style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--gold)' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <div style={{ 
                          width: 64, 
                          height: 64, 
                          borderRadius: '50%', 
                          background: 'var(--surface2)', 
                          border: '3px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 24,
                        }}>
                          👤
                        </div>
                      )}
                      <div>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: 'var(--gold)', letterSpacing: 2 }}>
                          {profile?.displayName || 'Anonymous'}
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all' }}>
                          {wallet.publicKey.toString().slice(0, 20)}...
                        </div>
                      </div>
                    </div>
                    <button
                      className="cta-btn btn-gold"
                      onClick={() => setEditingProfile(true)}
                      style={{ fontSize: 14, marginBottom: 8 }}
                    >
                      ✏️ EDIT PROFILE
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="section-header">
              <div className="section-title">YOUR STATS</div>
            </div>
            <div className="points-card">
              {wallet.publicKey ? (
                <>
                  {[
                    { label: 'Cards Scratched', value: profile?.cardsScratched || 0 },
                    { label: 'Total Wins', value: profile?.wins || 0 },
                    { label: 'Total Won', value: `${(profile?.totalWon || 0).toFixed(3)} SOL`, highlight: true },
                    { label: 'Referrals', value: profile?.referralsCount || 0 },
                    { label: 'Points (Month)', value: profile?.pointsThisMonth || 0 },
                    { label: 'Points (All Time)', value: profile?.pointsAllTime || 0 },
                    { label: 'NFT Tier', value: nftTierName || 'None' },
                    { label: 'Multiplier', value: `${nftMultiplier}x` },
                  ].map((row, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: '10px 0', borderBottom: '1px solid var(--border)',
                      fontSize: 13,
                    }}>
                      <span style={{ color: 'var(--muted)', fontFamily: 'monospace', fontSize: 11 }}>{row.label}</span>
                      <span style={{ 
                        color: (row as any).highlight ? 'var(--green)' : 'var(--text)', 
                        fontFamily: 'monospace', 
                        fontSize: 12 
                      }}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)', fontFamily: 'monospace' }}>
                  Connect wallet to see your stats
                </div>
              )}
            </div>

            {/* NFTs Section */}
            <div className="section-header" style={{ marginTop: 24 }}>
              <div className="section-title">BONUS NFTS</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace', marginBottom: 16, lineHeight: 1.6 }}>
              Multiply your points on every scratch!
            </div>
            {Object.entries(NFT_TIERS).map(([tier, info]) => {
              const isOwned = nftTierName === tier
              return (
                <div key={tier} style={{
                  background: 'var(--surface)', border: `1px solid ${isOwned ? 'rgba(245,200,66,0.4)' : 'var(--border)'}`,
                  borderRadius: 16, padding: '14px 18px', marginBottom: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  boxShadow: isOwned ? '0 0 20px rgba(245,200,66,0.1)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 28 }}>{info.emoji}</div>
                    <div>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2, color: info.color }}>
                        {tier}
                        {isOwned && <span style={{ fontSize: 10, color: 'var(--green)', marginLeft: 8, fontFamily: 'monospace' }}>✓ OWNED</span>}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>
                        {info.multiplier}x points • {info.cost} SOL
                      </div>
                    </div>
                  </div>
                  <button
                    className={`cta-btn ${isOwned ? 'btn-disabled' : 'btn-gold'}`}
                    style={{ width: 'auto', padding: '8px 16px', fontSize: 12 }}
                    disabled={isOwned || loading || !wallet.publicKey || !!nftTierName}
                    onClick={() => mintBonusNft(tier)}
                  >
                    {isOwned ? 'OWNED' : nftTierName ? 'HAVE NFT' : 'BUY'}
                  </button>
                </div>
              )
            })}

            <div className="section-header" style={{ marginTop: 24 }}>
              <div className="section-title">SETTINGS</div>
            </div>
            <div className="points-card">
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0', borderBottom: '1px solid var(--border)',
              }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>🔊 Sound Effects</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>Play sounds on scratch & win</div>
                </div>
                <button
                  onClick={toggleSound}
                  style={{
                    width: 50, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: soundEnabled ? 'var(--green)' : 'rgba(255,255,255,0.1)',
                    position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: 11,
                    background: 'white', position: 'absolute', top: 3,
                    left: soundEnabled ? 25 : 3, transition: 'left 0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }} />
                </button>
              </div>

              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0',
              }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>📳 Haptic Feedback</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>Vibrate on mobile devices</div>
                </div>
                <button
                  onClick={toggleHaptics}
                  style={{
                    width: 50, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: hapticsEnabled ? 'var(--green)' : 'rgba(255,255,255,0.1)',
                    position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: 11,
                    background: 'white', position: 'absolute', top: 3,
                    left: hapticsEnabled ? 25 : 3, transition: 'left 0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }} />
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── NAV BAR ── */}
      <div className="nav-bar">
        {[
          { id: 'scratch', icon: '🎰', label: 'Scratch' },
          { id: 'ranks', icon: '🏆', label: 'Ranks' },
          { id: 'prizes', icon: '🎁', label: 'Prizes' },
          { id: 'refer', icon: '🤝', label: 'Refer' },
          { id: 'profile', icon: '👤', label: 'Profile' },
        ].map(nav => (
          <div
            key={nav.id}
            className={`nav-item ${activeNav === nav.id ? 'active' : ''}`}
            onClick={() => setActiveNav(nav.id)}
          >
            <span className="nav-icon">{nav.icon}</span>
            <span>{nav.label}</span>
          </div>
        ))}
      </div>

      {/* ── SCRATCH MODAL ── */}
      {activeCard && (
        <ScratchModal
          key={activeCard}
          cardType={activeCard}
          onClose={() => setActiveCard(null)}
          onBuy={handleBuy}
          loading={loading}
          walletConnected={wallet.connected}
          solBalance={solBalance}
        />
      )}
    </>
  )
}