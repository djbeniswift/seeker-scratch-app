'use client'
import { useEffect, useState } from 'react'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { PROGRAM_ID, PROFILE_SEED, IDL } from '../lib/constants'

export default function ReferTab({ wallet, publicKey, connection, onClaimBonus }: any) {
  const [profile, setProfile] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [referralStatus, setReferralStatus] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)

  const getProgram = () => {
    if (!publicKey || !wallet) return null
    const walletAdapter = {
      publicKey,
      signTransaction: wallet.signTransaction || (async (tx: any) => {
        const signed = await wallet.signAllTransactions?.([tx])
        return signed?.[0] ?? tx
      }),
      signAllTransactions: wallet.signAllTransactions || (async (txs: any[]) => txs),
    }
    const provider = new AnchorProvider(connection, walletAdapter as any, { commitment: 'confirmed' })
    return new Program(IDL as any, PROGRAM_ID, provider)
  }

  const getProfilePda = (owner: PublicKey) => {
    const [pda] = PublicKey.findProgramAddressSync([PROFILE_SEED, owner.toBuffer()], PROGRAM_ID)
    return pda
  }

  const fetchProfile = async () => {
    if (!publicKey) return
    const program = getProgram()
    if (!program) return
    try {
      const pda = getProfilePda(publicKey)
      const data = await (program.account as any).playerProfile.fetch(pda)
      setProfile({
        pointsAllTime: data.pointsAllTime.toNumber(),
        referralsCount: data.referralsCount,
        hasBeenReferred: data.hasBeenReferred,
        referralBonusPaid: data.referralBonusPaid,
        totalSpent: data.totalSpent.toNumber() / 1_000_000_000,
        referredBy: data.referredBy?.toBase58(),
      })
    } catch {
      setProfile(null)
    }
  }

  useEffect(() => {
    if (!publicKey) return
    fetchProfile()
    checkReferralFromUrl()
  }, [publicKey])

  const checkReferralFromUrl = async () => {
    if (!publicKey) return
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (!ref) return
    try {
      const referrer = new PublicKey(ref)
      if (referrer.equals(publicKey)) { setReferralStatus('❌ You cannot refer yourself'); return }
      const program = getProgram()
      if (!program) return
      const pda = getProfilePda(publicKey)
      try {
        const data = await (program.account as any).playerProfile.fetch(pda)
        if (data.hasBeenReferred) { setReferralStatus('ℹ️ You already have a referrer'); return }
      } catch {}
      setReferralStatus('⏳ Registering referral...')
      await (program.methods as any).registerReferral().accounts({
        refereeProfile: pda,
        referee: publicKey,
        referrer,
        systemProgram: SystemProgram.programId,
      }).rpc({ commitment: 'confirmed' })
      setReferralStatus('✅ Referral registered! Play 0.1 SOL worth of cards to unlock your 10 point bonus')
      await fetchProfile()
    } catch (e: any) {
      setReferralStatus(`❌ ${e.message?.slice(0, 80)}`)
    }
  }

  const referralLink = publicKey
    ? `${window.location.origin}?ref=${publicKey.toBase58()}`
    : null

  const copyLink = () => {
    if (!referralLink) return
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const spendProgress = profile ? Math.min(profile.totalSpent / 0.1 * 100, 100) : 0

  if (!publicKey) return (
    <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>👛</div>
      <div>Connect your wallet to get your referral link</div>
    </div>
  )

  return (
    <div style={{ padding: '0 0 16px' }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a3e 0%, #2d1b69 100%)',
        border: '1px solid var(--gold)', borderRadius: 16,
        padding: 24, textAlign: 'center', marginBottom: 16
      }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🎁</div>
        <div style={{ color: 'var(--gold)', fontSize: 22, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>REFER & EARN</div>
        <div style={{ color: '#a0aec0', fontSize: 14, marginTop: 8 }}>
          Earn <span style={{ color: 'var(--gold)', fontWeight: 'bold' }}>100 points</span> when your friend plays 0.1 SOL.
          They get <span style={{ color: '#00d4ff', fontWeight: 'bold' }}>10 bonus points</span> too.
        </div>
      </div>

      {/* Referral Link */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ color: 'var(--gold)', fontSize: 13, letterSpacing: 2, marginBottom: 8 }}>YOUR REFERRAL LINK</div>
        <div style={{ background: '#0a0a1a', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#aaa', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 10 }}>
          {referralLink}
        </div>
        <button onClick={copyLink} style={{
          width: '100%', padding: '12px',
          background: copied ? 'var(--green)' : 'var(--gold)',
          color: '#000', border: 'none', borderRadius: 8,
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 2, cursor: 'pointer'
        }}>
          {copied ? '✅ COPIED!' : '📋 COPY LINK'}
        </button>
      </div>

      {/* Stats */}
      {profile && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--gold)', fontSize: 13, letterSpacing: 2, marginBottom: 12 }}>YOUR REFERRAL STATS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ textAlign: 'center', background: '#0a0a1a', borderRadius: 8, padding: 12 }}>
              <div style={{ color: 'var(--gold)', fontSize: 28, fontFamily: "'Bebas Neue', sans-serif" }}>{profile.referralsCount}</div>
              <div style={{ color: '#aaa', fontSize: 13, letterSpacing: 1 }}>FRIENDS REFERRED</div>
            </div>
            <div style={{ textAlign: 'center', background: '#0a0a1a', borderRadius: 8, padding: 12 }}>
              <div style={{ color: '#00d4ff', fontSize: 28, fontFamily: "'Bebas Neue', sans-serif" }}>{profile.referralsCount * 100}</div>
              <div style={{ color: '#aaa', fontSize: 13, letterSpacing: 1 }}>POINTS EARNED</div>
            </div>
          </div>
        </div>
      )}

      {/* Bonus Status */}
      {profile && (
        <div style={{
          background: 'var(--card-bg)',
          border: `1px solid ${profile.referralBonusPaid ? 'var(--green)' : profile.hasBeenReferred ? 'var(--gold)' : 'var(--border)'}`,
          borderRadius: 12, padding: 16, marginBottom: 16
        }}>
          <div style={{ color: 'var(--gold)', fontSize: 13, letterSpacing: 2, marginBottom: 12 }}>YOUR BONUS STATUS</div>
          {!profile.hasBeenReferred && (
            <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>
              No referrer yet — ask a friend to share their link
            </div>
          )}
          {profile.hasBeenReferred && !profile.referralBonusPaid && (
            <>
              <div style={{ color: '#fff', fontSize: 13, marginBottom: 12 }}>
                🎯 You were referred! Play <strong style={{ color: 'var(--gold)' }}>0.1 SOL</strong> worth of cards to unlock your <strong style={{ color: '#00d4ff' }}>10 point bonus</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#aaa', marginBottom: 4 }}>
                <span>Progress</span><span>{profile.totalSpent.toFixed(3)} / 0.1 SOL</span>
              </div>
              <div style={{ background: '#0a0a1a', borderRadius: 99, height: 8, marginBottom: 12 }}>
                <div style={{
                  background: 'linear-gradient(90deg, #00d4ff, var(--gold))',
                  borderRadius: 99, height: 8, width: `${spendProgress}%`, transition: 'width 0.5s ease'
                }} />
              </div>
              {spendProgress >= 100 && onClaimBonus && (
                <button
                  onClick={async () => {
                    setClaiming(true)
                    try { await onClaimBonus(); await fetchProfile() } catch {}
                    setClaiming(false)
                  }}
                  disabled={claiming}
                  style={{
                    width: '100%', padding: '10px',
                    background: claiming ? '#333' : 'var(--gold)',
                    color: '#000', border: 'none', borderRadius: 8,
                    fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 1,
                    cursor: claiming ? 'not-allowed' : 'pointer'
                  }}
                >
                  {claiming ? 'CLAIMING...' : '🎁 CLAIM 10 POINT BONUS'}
                </button>
              )}
            </>
          )}
          {profile.referralBonusPaid && (
            <div style={{ textAlign: 'center', color: 'var(--green)', fontSize: 15 }}>
              ✅ Bonus unlocked! You received <strong>10 points</strong>
            </div>
          )}
        </div>
      )}

      {referralStatus && (
        <div style={{ background: '#0a0a1a', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 13, color: '#fff', marginBottom: 16 }}>
          {referralStatus}
        </div>
      )}

      {/* How it works */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
        <div style={{ color: 'var(--gold)', fontSize: 13, letterSpacing: 2, marginBottom: 12 }}>HOW IT WORKS</div>
        {[
          { step: '1', text: 'Copy your referral link above' },
          { step: '2', text: 'Share it with friends' },
          { step: '3', text: 'They connect their wallet and visit your link' },
          { step: '4', text: 'Once they play 0.1 SOL worth of cards, you both get bonus points' },
        ].map(({ step, text }) => (
          <div key={step} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
            <div style={{
              background: 'var(--gold)', color: '#000', borderRadius: '50%',
              width: 24, height: 24, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 12, fontWeight: 'bold', flexShrink: 0
            }}>{step}</div>
            <div style={{ color: '#ccc', fontSize: 13, paddingTop: 3 }}>{text}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
