'use client'
import { useEffect, useState } from 'react'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { PROGRAM_ID, PROFILE_SEED, IDL } from '../lib/constants'

export default function ProfileTab({ wallet, publicKey, connection }: any) {
  const [profile, setProfile] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [pfpUrl, setPfpUrl] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const uploadImage = async (file: File) => {
    setUploading(true)
    setStatus('')
    try {
      const formData = new FormData()
      formData.append('image', file)
      formData.append('key', '01ad586326c99598178b3ca835afc16f')
      const res = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        setPfpUrl(data.data.url)
        setStatus('✅ Image uploaded!')
      } else {
        setStatus('❌ Upload failed')
      }
    } catch {
      setStatus('❌ Upload error')
    } finally {
      setUploading(false)
    }
  }

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
      const p = {
        displayName: data.displayName,
        pfpUrl: data.pfpUrl,
        pointsThisMonth: data.pointsThisMonth.toNumber(),
        pointsAllTime: data.pointsAllTime.toNumber(),
        cardsScratched: data.cardsScratched,
        totalSpent: data.totalSpent.toNumber() / 1_000_000_000,
        totalWon: data.totalWon.toNumber() / 1_000_000_000,
        wins: data.wins,
        referralsCount: data.referralsCount,
        hasBeenReferred: data.hasBeenReferred,
        referralBonusPaid: data.referralBonusPaid,
      }
      setProfile(p)
      setName(p.displayName || '')
      setPfpUrl(p.pfpUrl || '')
    } catch {
      setProfile(null)
    }
  }

  useEffect(() => {
    if (publicKey) fetchProfile()
  }, [publicKey])

  const saveProfile = async () => {
    if (!publicKey) return
    const program = getProgram()
    if (!program) return
    setSaving(true)
    setStatus('')
    try {
      const pda = getProfilePda(publicKey)
      await (program.methods as any)
        .updateProfile(name || null, pfpUrl || null)
        .accounts({
          profile: pda,
          player: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' })
      setStatus('✅ Profile saved!')
      setEditing(false)
      await fetchProfile()
    } catch (e: any) {
      setStatus(`❌ ${e.message?.slice(0, 80)}`)
    } finally {
      setSaving(false)
    }
  }

  if (!publicKey) return (
    <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>👛</div>
      <div>Connect your wallet to view your profile</div>
    </div>
  )

  const winRate = profile?.cardsScratched > 0 ? ((profile.wins / profile.cardsScratched) * 100).toFixed(1) : '0.0'

  return (
    <div style={{ paddingBottom: 16 }}>

      {/* Profile Card */}
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 20, marginBottom: 16, textAlign: 'center'
      }}>
        {/* Avatar */}
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 12 }}>
          <div style={{
            width: 90, height: 90, borderRadius: '50%',
            border: '3px solid var(--gold)',
            overflow: 'hidden', background: '#0a0a1a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 44
          }}>
            {profile?.pfpUrl ? (
              <img src={profile.pfpUrl} alt="pfp" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => (e.currentTarget.style.display = 'none')} />
            ) : '👤'}
          </div>
          <button
            onClick={() => setEditing(!editing)}
            style={{
              position: 'absolute', bottom: 0, right: 0,
              background: '#ffffff', border: '2px solid #000', borderRadius: '50%',
              width: 36, height: 36, cursor: 'pointer', fontSize: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >✏️</button>
        </div>

        <div style={{ color: 'var(--gold)', fontSize: 22, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, marginBottom: 4 }}>
          {profile?.displayName || 'ANONYMOUS'}
        </div>
        <div style={{ color: '#555', fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 8 }}>
          {publicKey?.toBase58()}
        </div>

        {/* Points badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(245,200,66,0.1)', border: '1px solid rgba(245,200,66,0.3)',
          borderRadius: 99, padding: '4px 12px'
        }}>
          <span style={{ color: 'var(--gold)', fontSize: 13 }}>⭐</span>
          <span style={{ color: 'var(--gold)', fontSize: 13, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>
            {profile?.pointsAllTime || 0} POINTS
          </span>
        </div>
      </div>

      {/* Edit Form */}
      {editing && (
        <div style={{
          background: 'var(--card-bg)', border: '1px solid var(--gold)',
          borderRadius: 12, padding: 16, marginBottom: 16
        }}>
          <div style={{ color: 'var(--gold)', fontSize: 13, letterSpacing: 2, marginBottom: 12 }}>EDIT PROFILE</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: '#aaa', fontSize: 13, marginBottom: 4 }}>USERNAME (max 16 chars)</div>
            <input
              value={name}
              onChange={e => setName(e.target.value.slice(0, 16))}
              placeholder="Enter username..."
              style={{
                width: '100%', padding: '10px 12px', background: '#0a0a1a',
                border: '1px solid var(--border)', borderRadius: 8,
                color: '#fff', fontSize: 14, boxSizing: 'border-box'
              }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: '#aaa', fontSize: 13, marginBottom: 8 }}>PROFILE PICTURE</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                border: '2px solid var(--border)', overflow: 'hidden',
                background: '#0a0a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0
              }}>
                {pfpUrl ? (
                  <img src={pfpUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => (e.currentTarget.style.display = 'none')} />
                ) : '👤'}
              </div>
              <label style={{
                flex: 1, padding: '10px', background: uploading ? '#333' : '#1a1a3e',
                border: '1px dashed var(--gold)', borderRadius: 8,
                color: uploading ? '#aaa' : 'var(--gold)', fontSize: 13,
                textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer',
                fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1
              }}>
                {uploading ? '⏳ UPLOADING...' : '📷 CHOOSE IMAGE'}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  disabled={uploading}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) uploadImage(file)
                  }}
                />
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveProfile} disabled={saving} style={{
              flex: 1, padding: '10px', background: 'var(--gold)', color: '#000',
              border: 'none', borderRadius: 8, fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 15, letterSpacing: 1, cursor: 'pointer'
            }}>
              {saving ? 'SAVING...' : 'SAVE'}
            </button>
            <button onClick={() => setEditing(false)} style={{
              padding: '10px 16px', background: '#333', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer'
            }}>Cancel</button>
          </div>
          {status && <div style={{ marginTop: 8, fontSize: 13, color: status.startsWith('✅') ? 'var(--green)' : '#f87171' }}>{status}</div>}
        </div>
      )}

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'CARDS PLAYED', value: profile?.cardsScratched || 0, color: '#fff' },
          { label: 'WIN RATE', value: `${winRate}%`, color: 'var(--green)' },
          { label: 'TOTAL WON', value: `${(profile?.totalWon || 0).toFixed(3)} SOL`, color: 'var(--green)' },
          { label: 'WINS', value: profile?.wins || 0, color: 'var(--gold)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '12px', textAlign: 'center'
          }}>
            <div style={{ color, fontSize: 20, fontFamily: "'Bebas Neue', sans-serif" }}>{value}</div>
            <div style={{ color: '#555', fontSize: 13, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Points Breakdown */}
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 16, marginBottom: 16
      }}>
        <div style={{ color: 'var(--gold)', fontSize: 13, letterSpacing: 2, marginBottom: 12 }}>POINTS BREAKDOWN</div>
        {[
          { label: 'Points This Month', value: profile?.pointsThisMonth || 0 },
          { label: 'Points All Time', value: profile?.pointsAllTime || 0 },
          { label: 'Referrals Made', value: profile?.referralsCount || 0 },
          { label: 'Referral Points', value: (profile?.referralsCount || 0) * 100 },
          { label: 'Referee Bonus', value: profile?.referralBonusPaid ? '✅ Received' : profile?.hasBeenReferred ? '⏳ Pending' : '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '8px 0', borderBottom: '1px solid #111'
          }}>
            <span style={{ color: '#aaa', fontSize: 13 }}>{label}</span>
            <span style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 'bold' }}>{value}</span>
          </div>
        ))}
      </div>

    </div>
  )
}
