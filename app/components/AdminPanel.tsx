'use client'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useState, useEffect, useCallback } from 'react'
import { PROGRAM_ID, TREASURY_SEED, MASTER_CONFIG_SEED, PROFILE_SEED, IDL } from '../lib/constants'

const ADMIN = '6RhLQikkjzace4ti4D458iSmKofbPdMGNB7VKHmWwYPP'

async function rpcWithRetry(fn: () => Promise<any>): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await fn() } catch (err: any) {
      const is429 = err?.message?.includes('429') || err?.message?.includes('rate limit')
      if (!is429 || attempt === 3) throw err
      await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt)))
    }
  }
}

const btn = (bg: string, color = '#fff'): React.CSSProperties => ({
  padding: '8px 12px', border: 'none', borderRadius: 8,
  cursor: 'pointer', fontWeight: 'bold', fontSize: 12,
  background: bg, color,
})
const input = (extra?: React.CSSProperties): React.CSSProperties => ({
  padding: '7px 8px', background: '#1a1a2e', color: '#fff',
  border: '1px solid #333', borderRadius: 6, fontSize: 12,
  width: '100%', boxSizing: 'border-box', ...extra,
})
const sectionHdr = (color = '#ffd700'): React.CSSProperties => ({
  color, fontWeight: 'bold', fontSize: 12, marginBottom: 8,
  fontFamily: 'monospace', borderBottom: '1px solid #222', paddingBottom: 4,
})

export default function AdminPanel() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet()
  const { connection } = useConnection()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [status, setStatus] = useState('')
  const [activeSection, setActiveSection] = useState<string>('treasury')

  // Treasury health
  const [treasuryBalance, setTreasuryBalance] = useState(0)
  const [dailyPaidOut, setDailyPaidOut] = useState(0)
  const [dailyCap, setDailyCap] = useState(10)
  const [paused, setPaused] = useState(false)
  const [fundAmount, setFundAmount] = useState('5')
  const [withdrawAmount, setWithdrawAmount] = useState('1')

  // Game settings (mirrors MasterConfig defaults)
  const [costQP, setCostQP] = useState('0.01')
  const [costHS, setCostHS] = useState('0.05')
  const [costMG, setCostMG] = useState('0.10')
  const [thrQP, setThrQP] = useState('35')
  const [thrHS, setThrHS] = useState('15')
  const [thrMG, setThrMG] = useState('12')
  const [feePct, setFeePct] = useState('3')
  const [minTreasury, setMinTreasury] = useState('5')
  const [dailyCapInput, setDailyCapInput] = useState('10')
  const [enableQP, setEnableQP] = useState(true)
  const [enableHS, setEnableHS] = useState(true)
  const [enableMG, setEnableMG] = useState(true)
  const [doublePoints, setDoublePoints] = useState(false)
  const [cooldownHrs, setCooldownHrs] = useState('24')

  // Prizes
  const [p1Sol, setP1Sol] = useState('0.25')
  const [p2Sol, setP2Sol] = useState('0.15')
  const [p3Sol, setP3Sol] = useState('0.05')
  const [p1Skr, setP1Skr] = useState('250')
  const [p2Skr, setP2Skr] = useState('150')
  const [p3Skr, setP3Skr] = useState('100')
  const [s1Skr, setS1Skr] = useState('500')
  const [s2Skr, setS2Skr] = useState('250')
  const [s3Skr, setS3Skr] = useState('100')

  // Banner
  const [bannerText, setBannerText] = useState('')
  const [bannerActive, setBannerActive] = useState(false)

  // Winners
  const [winners, setWinners] = useState<any[]>([])
  const [sweepWinners, setSweepWinners] = useState<any[]>([])

  // Player lookup
  const [lookupInput, setLookupInput] = useState('')
  const [lookupResult, setLookupResult] = useState<any>(null)

  const [treasuryPda] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID)
const [masterConfigPda] = PublicKey.findProgramAddressSync([MASTER_CONFIG_SEED], PROGRAM_ID)

  useEffect(() => { setMounted(true) }, [])

  const getProgram = useCallback(() => {
    if (!publicKey) return null
    const walletAdapter = {
      publicKey,
      signTransaction: signTransaction || (async (tx: any) => {
        const signed = await signAllTransactions?.([tx]); return signed?.[0] ?? tx
      }),
      signAllTransactions: signAllTransactions || (async (txs: any[]) => txs),
    }
    const provider = new AnchorProvider(connection, walletAdapter as any, { commitment: 'confirmed' })
    return new Program(IDL as any, PROGRAM_ID, provider)
  }, [publicKey, signTransaction, signAllTransactions, connection])

  const readProvider = useCallback(() => new AnchorProvider(connection, {} as any, { commitment: 'confirmed' }), [connection])

  const loadData = useCallback(async () => {
    try {
      const rp = readProvider()
      const rProg = new Program(IDL as any, PROGRAM_ID, rp)
      const lamports = await connection.getBalance(treasuryPda)
      setTreasuryBalance(lamports / LAMPORTS_PER_SOL)

      try {
        const t = await (rProg.account as any).treasury.fetch(treasuryPda)
        setDailyPaidOut(t.dailyPaidOut.toNumber() / LAMPORTS_PER_SOL)
        setPaused(t.paused)
      } catch {}

      try {
        const mc = await (rProg.account as any).masterConfig.fetch(masterConfigPda)
        setCostQP((mc.costQuickpick.toNumber() / LAMPORTS_PER_SOL).toFixed(2))
        setCostHS((mc.costHotshot.toNumber() / LAMPORTS_PER_SOL).toFixed(2))
        setCostMG((mc.costMegagold.toNumber() / LAMPORTS_PER_SOL).toFixed(2))
        setThrQP((mc.thresholdQuickpick / 100).toFixed(1))
        setThrHS((mc.thresholdHotshot / 100).toFixed(1))
        setThrMG((mc.thresholdMegagold / 100).toFixed(1))
        setFeePct((mc.houseFeeBps.toNumber() / 100).toFixed(1))
        setMinTreasury((mc.minTreasury.toNumber() / LAMPORTS_PER_SOL).toFixed(0))
        const cap = mc.dailyPayoutCap.toNumber() / LAMPORTS_PER_SOL
        setDailyCapInput(cap.toFixed(0))
        setDailyCap(cap)
        setEnableQP(mc.quickpickEnabled)
        setEnableHS(mc.hotshotEnabled)
        setEnableMG(mc.megagoldEnabled)
        setDoublePoints(mc.doublePointsActive)
        setCooldownHrs((mc.freePlayCooldownSeconds.toNumber() / 3600).toFixed(0))
        setP1Sol((mc.prize1stSol.toNumber() / LAMPORTS_PER_SOL).toFixed(2))
        setP2Sol((mc.prize2ndSol.toNumber() / LAMPORTS_PER_SOL).toFixed(2))
        setP3Sol((mc.prize3rdSol.toNumber() / LAMPORTS_PER_SOL).toFixed(2))
        setP1Skr(mc.prize1stSkr.toNumber().toString())
        setP2Skr(mc.prize2ndSkr.toNumber().toString())
        setP3Skr(mc.prize3rdSkr.toNumber().toString())
        setS1Skr(mc.sweep1stSkr.toNumber().toString())
        setS2Skr(mc.sweep2ndSkr.toNumber().toString())
        setS3Skr(mc.sweep3rdSkr.toNumber().toString())
        setBannerText(mc.bannerText)
        setBannerActive(mc.bannerActive)
      } catch {}
    } catch {}
  }, [connection, treasuryPda, masterConfigPda, readProvider])

  const loadWinners = useCallback(async () => {
    try {
      const rp = readProvider()
      const rProg = new Program(IDL as any, PROGRAM_ID, rp)
      const accounts = await (rProg.account as any).playerProfile.all()
      const profiles = accounts.map((a: any) => ({
        wallet: a.account.owner?.toBase58() || a.publicKey.toBase58(),
        displayName: a.account.displayName || null,
        pointsThisMonth: a.account.pointsThisMonth.toNumber(),
        sweepPointsThisMonth: a.account.sweepPointsThisMonth?.toNumber() ?? 0,
      }))
      setWinners([...profiles].sort((a, b) => b.pointsThisMonth - a.pointsThisMonth).slice(0, 3))
      setSweepWinners([...profiles].filter(p => p.sweepPointsThisMonth > 0).sort((a, b) => b.sweepPointsThisMonth - a.sweepPointsThisMonth).slice(0, 3))
    } catch (e) { console.error('loadWinners', e) }
  }, [readProvider])

  useEffect(() => {
    if (!open) return
    loadData()
    loadWinners()
    const id = setInterval(loadData, 30000)
    return () => clearInterval(id)
  }, [open, loadData, loadWinners])

  if (!mounted) return null
  if (!publicKey || publicKey.toBase58() !== ADMIN) return null

  const setS = (msg: string) => setStatus(msg)

  const buildMasterConfigArgs = () => ({
    costQuickpick: new BN(Math.round(parseFloat(costQP) * LAMPORTS_PER_SOL)),
    costHotshot: new BN(Math.round(parseFloat(costHS) * LAMPORTS_PER_SOL)),
    costMegagold: new BN(Math.round(parseFloat(costMG) * LAMPORTS_PER_SOL)),
    thresholdQuickpick: Math.round(parseFloat(thrQP) * 100),
    thresholdHotshot: Math.round(parseFloat(thrHS) * 100),
    thresholdMegagold: Math.round(parseFloat(thrMG) * 100),
    houseFeeBps: new BN(Math.round(parseFloat(feePct) * 100)),
    minTreasury: new BN(Math.round(parseFloat(minTreasury) * LAMPORTS_PER_SOL)),
    dailyPayoutCap: new BN(Math.round(parseFloat(dailyCapInput) * LAMPORTS_PER_SOL)),
    prize1stSol: new BN(Math.round(parseFloat(p1Sol) * LAMPORTS_PER_SOL)),
    prize2ndSol: new BN(Math.round(parseFloat(p2Sol) * LAMPORTS_PER_SOL)),
    prize3rdSol: new BN(Math.round(parseFloat(p3Sol) * LAMPORTS_PER_SOL)),
    prize1stSkr: new BN(parseInt(p1Skr)),
    prize2ndSkr: new BN(parseInt(p2Skr)),
    prize3rdSkr: new BN(parseInt(p3Skr)),
    sweep1stSkr: new BN(parseInt(s1Skr)),
    sweep2ndSkr: new BN(parseInt(s2Skr)),
    sweep3rdSkr: new BN(parseInt(s3Skr)),
    freePlayCooldownSeconds: new BN(Math.round(parseFloat(cooldownHrs) * 3600)),
    quickpickEnabled: enableQP,
    hotshotEnabled: enableHS,
    megagoldEnabled: enableMG,
    doublePointsActive: doublePoints,
    bannerText,
    bannerActive,
  })

  const initMasterConfig = async () => {
    try {
      setS('Initializing master config...')
      const program = getProgram(); if (!program) return setS('❌ No wallet')
      await rpcWithRetry(() => (program.methods as any).initializeMasterConfig().accounts({
        masterConfig: masterConfigPda, treasury: treasuryPda, admin: publicKey, systemProgram: SystemProgram.programId,
      }).rpc())
      setS('✅ MasterConfig initialized!')
      await loadData()
    } catch (e: any) { setS(`❌ ${e.message?.slice(0, 80)}`) }
  }

  const saveGameSettings = async () => {
    try {
      setS('Saving game settings...')
      const program = getProgram(); if (!program) return setS('❌ No wallet')
      await rpcWithRetry(() => (program.methods as any).updateMasterConfig(buildMasterConfigArgs()).accounts({
        masterConfig: masterConfigPda, treasury: treasuryPda, admin: publicKey, systemProgram: SystemProgram.programId,
      }).rpc())
      setS('✅ Game settings saved!')
    } catch (e: any) { setS(`❌ ${e.message?.slice(0, 80)}`) }
  }

  const fund = async () => {
    try {
      setS('Funding...')
      const program = getProgram(); if (!program) return setS('❌ No wallet')
      await rpcWithRetry(() => (program.methods as any).fundTreasury(new BN(parseFloat(fundAmount) * LAMPORTS_PER_SOL)).accounts({
        treasury: treasuryPda, admin: publicKey, systemProgram: SystemProgram.programId,
      }).rpc())
      setS(`✅ Funded ${fundAmount} SOL`)
      await loadData()
    } catch (e: any) { setS(`❌ ${e.message?.slice(0, 80)}`) }
  }

  const withdraw = async () => {
    try {
      setS('Withdrawing...')
      const program = getProgram(); if (!program) return setS('❌ No wallet')
      await rpcWithRetry(() => (program.methods as any).withdrawProfit(new BN(parseFloat(withdrawAmount) * LAMPORTS_PER_SOL)).accounts({
        treasury: treasuryPda, admin: publicKey,
      }).rpc())
      setS(`✅ Withdrew ${withdrawAmount} SOL`)
      await loadData()
    } catch (e: any) { setS(`❌ ${e.message?.slice(0, 80)}`) }
  }

  const togglePause = async () => {
    try {
      const next = !paused
      setS(next ? 'Pausing...' : 'Unpausing...')
      const program = getProgram(); if (!program) return setS('❌ No wallet')
      await rpcWithRetry(() => (program.methods as any).setPaused(next).accounts({ treasury: treasuryPda, admin: publicKey }).rpc())
      setPaused(next)
      setS(next ? '✅ Game paused' : '✅ Game unpaused')
    } catch (e: any) { setS(`❌ ${e.message?.slice(0, 80)}`) }
  }

  const lookupPlayer = async () => {
    if (!lookupInput.trim()) return
    try {
      const rp = readProvider()
      const rProg = new Program(IDL as any, PROGRAM_ID, rp)
      let profilePda: PublicKey
      try {
        const key = new PublicKey(lookupInput.trim())
        const [pda] = PublicKey.findProgramAddressSync([PROFILE_SEED, key.toBuffer()], PROGRAM_ID)
        profilePda = pda
      } catch { setLookupResult({ error: 'Invalid pubkey' }); return }
      try {
        const data = await (rProg.account as any).playerProfile.fetch(profilePda)
        setLookupResult({
          wallet: data.owner?.toBase58(),
          displayName: data.displayName,
          cardsScratched: data.cardsScratched,
          totalSpent: (data.totalSpent.toNumber() / LAMPORTS_PER_SOL).toFixed(3),
          totalWon: (data.totalWon.toNumber() / LAMPORTS_PER_SOL).toFixed(3),
          pointsThisMonth: data.pointsThisMonth.toNumber(),
          pointsAllTime: data.pointsAllTime.toNumber(),
          sweepPointsThisMonth: data.sweepPointsThisMonth?.toNumber() ?? 0,
          sweepPointsAllTime: data.sweepPointsAllTime?.toNumber() ?? 0,
          freePlaysUsed: data.freePlaysUsed ?? 0,
          hasBeenReferred: data.hasBeenReferred,
          referredBy: data.referredBy?.toBase58(),
        })
      } catch { setLookupResult({ error: 'Profile not found' }) }
    } catch (e: any) { setLookupResult({ error: e.message }) }
  }

  const copy = (text: string) => { navigator.clipboard.writeText(text).catch(() => {}) }

  const navItems = [
    { id: 'treasury', label: '💰 Treasury' },
    { id: 'settings', label: '⚙️ Settings' },
    { id: 'prizes', label: '🏆 Prizes' },
    { id: 'banner', label: '📢 Banner' },
    { id: 'winners', label: '🥇 Winners' },
    { id: 'lookup', label: '🔍 Lookup' },
  ]

  const pctUsed = dailyCap > 0 ? Math.min(100, (dailyPaidOut / dailyCap) * 100) : 0

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        style={{ position: 'fixed', bottom: 70, right: 16, zIndex: 9998, background: '#1a1a2e', border: '1px solid #ffd700', borderRadius: '50%', width: 44, height: 44, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >⚙️</button>

      {open && (
        <div style={{ position: 'fixed', bottom: 124, right: 16, zIndex: 9998, background: '#0d0d1a', border: '1px solid #ffd700', borderRadius: 14, width: 340, maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ color: '#ffd700', fontWeight: 'bold', fontSize: 13 }}>⚙️ Admin Panel</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* Section nav */}
          <div style={{ display: 'flex', gap: 4, padding: '8px 10px', borderBottom: '1px solid #1a1a2e', overflowX: 'auto', flexShrink: 0 }}>
            {navItems.map(n => (
              <button key={n.id} onClick={() => setActiveSection(n.id)} style={{ padding: '4px 8px', border: 'none', borderRadius: 6, cursor: 'pointer', background: activeSection === n.id ? '#ffd700' : '#1a1a2e', color: activeSection === n.id ? '#000' : '#aaa', fontSize: 11, whiteSpace: 'nowrap', fontWeight: activeSection === n.id ? 'bold' : 'normal' }}>
                {n.label}
              </button>
            ))}
          </div>

          {/* Scrollable body */}
          <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>

            {/* ── TREASURY ── */}
            {activeSection === 'treasury' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={sectionHdr()}>TREASURY HEALTH</div>
                <div style={{ background: '#111', borderRadius: 8, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#aaa', fontSize: 12 }}>Balance</span>
                    <span style={{ color: '#ffd700', fontSize: 13, fontWeight: 'bold' }}>{treasuryBalance.toFixed(3)} SOL</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#aaa', fontSize: 12 }}>Daily paid out</span>
                    <span style={{ color: '#f87171', fontSize: 12 }}>{dailyPaidOut.toFixed(3)} / {dailyCap} SOL</span>
                  </div>
                  <div style={{ background: '#222', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${pctUsed}%`, height: '100%', background: pctUsed > 80 ? '#f87171' : '#4ade80', transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ color: '#555', fontSize: 11, marginTop: 4 }}>
                    {((dailyCap - dailyPaidOut) / 0.01).toFixed(0)} QP plays remaining today
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input value={fundAmount} onChange={e => setFundAmount(e.target.value)} style={input({ flex: 1 })} placeholder="SOL" />
                  <button onClick={fund} style={btn('#4ade80', '#000')}>Fund</button>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} style={input({ flex: 1 })} placeholder="SOL" />
                  <button onClick={withdraw} style={btn('#f59e0b', '#000')}>Withdraw</button>
                </div>
                <button onClick={togglePause} style={btn(paused ? '#4ade80' : '#ef4444')}>
                  {paused ? '▶ Unpause Game' : '⏸ Pause Game'}
                </button>
              </div>
            )}

            {/* ── SETTINGS ── */}
            {activeSection === 'settings' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={sectionHdr()}>GAME SETTINGS</div>
                <button onClick={initMasterConfig} style={{ ...btn('#333', '#aaa'), width: '100%', fontSize: 11 }}>
                  🔄 Init MasterConfig (first-time setup only)
                </button>

                <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Card Costs (SOL)</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['QP', costQP, setCostQP], ['HS', costHS, setCostHS], ['MG', costMG, setCostMG]].map(([l, v, s]) => (
                    <div key={l as string} style={{ flex: 1 }}>
                      <div style={{ color: '#666', fontSize: 10, marginBottom: 2 }}>{l as string}</div>
                      <input value={v as string} onChange={e => (s as any)(e.target.value)} style={input()} />
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 11, color: '#888', marginTop: 4, marginBottom: 2 }}>Win Rates (%)</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['QP', thrQP, setThrQP], ['HS', thrHS, setThrHS], ['MG', thrMG, setThrMG]].map(([l, v, s]) => (
                    <div key={l as string} style={{ flex: 1 }}>
                      <div style={{ color: '#666', fontSize: 10, marginBottom: 2 }}>{l as string}</div>
                      <input value={v as string} onChange={e => (s as any)(e.target.value)} style={input()} />
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>House Fee %</div>
                    <input value={feePct} onChange={e => setFeePct(e.target.value)} style={input()} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Min Treasury (SOL)</div>
                    <input value={minTreasury} onChange={e => setMinTreasury(e.target.value)} style={input()} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Daily Cap (SOL)</div>
                    <input value={dailyCapInput} onChange={e => setDailyCapInput(e.target.value)} style={input()} />
                  </div>
                </div>

                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Card Controls</div>
                {[['QuickPick', enableQP, setEnableQP], ['HotShot', enableHS, setEnableHS], ['MegaGold', enableMG, setEnableMG]].map(([l, v, s]) => (
                  <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                    <span style={{ color: '#ccc', fontSize: 12 }}>{l as string}</span>
                    <button onClick={() => (s as any)(!v)} style={{ padding: '4px 10px', border: 'none', borderRadius: 6, cursor: 'pointer', background: v ? '#4ade80' : '#ef4444', color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                      {v ? 'ON' : 'OFF'}
                    </button>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                  <span style={{ color: '#ccc', fontSize: 12 }}>Double Points Mode</span>
                  <button onClick={() => setDoublePoints(!doublePoints)} style={{ padding: '4px 10px', border: 'none', borderRadius: 6, cursor: 'pointer', background: doublePoints ? '#7c3aed' : '#333', color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                    {doublePoints ? '2X ON' : 'OFF'}
                  </button>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Free Play Cooldown (hours)</div>
                  <input value={cooldownHrs} onChange={e => setCooldownHrs(e.target.value)} style={input()} />
                </div>

                <button onClick={saveGameSettings} style={btn('#7c3aed')}>Save Game Settings</button>
              </div>
            )}

            {/* ── PRIZES ── */}
            {activeSection === 'prizes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={sectionHdr()}>SOL + SKR MONTHLY PRIZES</div>
                {[
                  ['🥇 1st', p1Sol, setP1Sol, p1Skr, setP1Skr],
                  ['🥈 2nd', p2Sol, setP2Sol, p2Skr, setP2Skr],
                  ['🥉 3rd', p3Sol, setP3Sol, p3Skr, setP3Skr],
                ].map(([label, sol, setSol, skr, setSkr]) => (
                  <div key={label as string} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: '#aaa', fontSize: 12, width: 36, flexShrink: 0 }}>{label as string}</span>
                    <input value={sol as string} onChange={e => (setSol as any)(e.target.value)} style={input({ flex: 1 })} placeholder="SOL" />
                    <span style={{ color: '#555', fontSize: 11 }}>SOL</span>
                    <input value={skr as string} onChange={e => (setSkr as any)(e.target.value)} style={input({ flex: 1 })} placeholder="SKR" />
                    <span style={{ color: '#555', fontSize: 11 }}>SKR</span>
                  </div>
                ))}
                <button onClick={saveGameSettings} style={btn('#4ade80', '#000')}>Save SOL Prizes</button>

                <div style={sectionHdr('#00d4ff')}>SWEEP SKR PRIZES</div>
                {[
                  ['🥇 1st', s1Skr, setS1Skr],
                  ['🥈 2nd', s2Skr, setS2Skr],
                  ['🥉 3rd', s3Skr, setS3Skr],
                ].map(([label, v, sv]) => (
                  <div key={label as string} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: '#aaa', fontSize: 12, width: 36, flexShrink: 0 }}>{label as string}</span>
                    <input value={v as string} onChange={e => (sv as any)(e.target.value)} style={input({ flex: 1 })} placeholder="SKR" />
                    <span style={{ color: '#555', fontSize: 11 }}>SKR</span>
                  </div>
                ))}
                <button onClick={saveGameSettings} style={btn('#00d4ff', '#000')}>Save Sweep Prizes</button>
              </div>
            )}

            {/* ── BANNER ── */}
            {activeSection === 'banner' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={sectionHdr()}>ANNOUNCEMENT BANNER</div>
                <textarea
                  value={bannerText}
                  onChange={e => setBannerText(e.target.value.slice(0, 100))}
                  maxLength={100}
                  placeholder="Banner message (max 100 chars)..."
                  rows={3}
                  style={{ ...input(), resize: 'none', fontFamily: 'monospace' }}
                />
                <div style={{ fontSize: 11, color: '#555' }}>{bannerText.length}/100 characters</div>
                {bannerText && (
                  <div style={{ padding: '8px 10px', background: '#ffd700', color: '#000', borderRadius: 6, fontSize: 12, fontWeight: 'bold' }}>
                    📢 {bannerText}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { setBannerActive(true); saveGameSettings() }} style={btn('#4ade80', '#000')}>Show Banner</button>
                  <button onClick={() => { setBannerActive(false); saveGameSettings() }} style={btn('#ef4444')}>Hide Banner</button>
                </div>
              </div>
            )}

            {/* ── WINNERS ── */}
            {activeSection === 'winners' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={sectionHdr()}>MONTHLY SOL WINNERS</div>
                {winners.length === 0 ? (
                  <div style={{ color: '#555', fontSize: 12 }}>No data — loading...</div>
                ) : winners.map((w, i) => (
                  <div key={w.wallet} style={{ background: '#111', borderRadius: 8, padding: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#ffd700', fontSize: 12 }}>{['🥇','🥈','🥉'][i]} {w.displayName || `${w.wallet.slice(0,8)}...`}</span>
                      <span style={{ color: '#aaa', fontSize: 11 }}>{w.pointsThisMonth} pts</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <span style={{ color: '#555', fontSize: 10, flex: 1, wordBreak: 'break-all' }}>{w.wallet}</span>
                      <button onClick={() => copy(w.wallet)} style={btn('#333', '#fff')}>Copy</button>
                    </div>
                  </div>
                ))}
                {winners.length > 0 && (
                  <>
                    <button onClick={() => copy(winners.map((w: any) => w.wallet).join('\n'))} style={btn('#555')}>Copy All 3 Addresses</button>
                    <div style={{ background: '#111', borderRadius: 8, padding: 8, fontSize: 11, color: '#aaa', lineHeight: 1.7 }}>
                      <div style={{ color: '#ffd700', marginBottom: 4 }}>Payout Reminder (send from Phantom):</div>
                      1st: {p1Sol} SOL + {p1Skr} SKR<br />
                      2nd: {p2Sol} SOL + {p2Skr} SKR<br />
                      3rd: {p3Sol} SOL + {p3Skr} SKR
                    </div>
                    <button onClick={() => { if (confirm('Reset all monthly SOL points? This requires calling reset per-player via on-chain tx — note this for your records.')) setS('ℹ️ Monthly reset noted — implement per-player tx if needed') }} style={btn('#ef4444')}>
                      Reset Monthly SOL Points
                    </button>
                  </>
                )}

                <div style={sectionHdr('#00d4ff')}>MONTHLY SWEEP WINNERS</div>
                {sweepWinners.length === 0 ? (
                  <div style={{ color: '#555', fontSize: 12 }}>No sweep activity yet</div>
                ) : sweepWinners.map((w, i) => (
                  <div key={w.wallet} style={{ background: '#111', borderRadius: 8, padding: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#00d4ff', fontSize: 12 }}>{['🥇','🥈','🥉'][i]} {w.displayName || `${w.wallet.slice(0,8)}...`}</span>
                      <span style={{ color: '#aaa', fontSize: 11 }}>{w.sweepPointsThisMonth} sweep pts</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <span style={{ color: '#555', fontSize: 10, flex: 1, wordBreak: 'break-all' }}>{w.wallet}</span>
                      <button onClick={() => copy(w.wallet)} style={btn('#333', '#fff')}>Copy</button>
                    </div>
                  </div>
                ))}
                {sweepWinners.length > 0 && (
                  <>
                    <button onClick={() => copy(sweepWinners.map((w: any) => w.wallet).join('\n'))} style={btn('#555')}>Copy All 3 Addresses</button>
                    <div style={{ background: '#111', borderRadius: 8, padding: 8, fontSize: 11, color: '#aaa', lineHeight: 1.7 }}>
                      <div style={{ color: '#00d4ff', marginBottom: 4 }}>Send SKR from Phantom:</div>
                      1st: {s1Skr} SKR<br />
                      2nd: {s2Skr} SKR<br />
                      3rd: {s3Skr} SKR
                    </div>
                    <button onClick={() => { if (confirm('Reset sweep points? Note this for your records.')) setS('ℹ️ Sweep reset noted — implement per-player tx if needed') }} style={btn('#ef4444')}>
                      Reset Monthly Sweep Points
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ── LOOKUP ── */}
            {activeSection === 'lookup' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={sectionHdr()}>PLAYER LOOKUP</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={lookupInput} onChange={e => setLookupInput(e.target.value)}
                    placeholder="Wallet address..." style={input({ flex: 1 })}
                    onKeyDown={e => e.key === 'Enter' && lookupPlayer()}
                  />
                  <button onClick={lookupPlayer} style={btn('#7c3aed')}>Search</button>
                </div>
                {lookupResult && (
                  lookupResult.error ? (
                    <div style={{ color: '#f87171', fontSize: 12 }}>❌ {lookupResult.error}</div>
                  ) : (
                    <div style={{ background: '#111', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ color: '#ffd700', fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>{lookupResult.displayName || 'Anonymous'}</div>
                      {[
                        ['Wallet', lookupResult.wallet ? `${lookupResult.wallet.slice(0,12)}...` : '—'],
                        ['Cards Scratched', lookupResult.cardsScratched],
                        ['Total Spent', `${lookupResult.totalSpent} SOL`],
                        ['Total Won', `${lookupResult.totalWon} SOL`],
                        ['SOL Points (month)', lookupResult.pointsThisMonth],
                        ['SOL Points (all time)', lookupResult.pointsAllTime],
                        ['Sweep Points (month)', lookupResult.sweepPointsThisMonth],
                        ['Sweep Points (all time)', lookupResult.sweepPointsAllTime],
                        ['Free Plays Used', lookupResult.freePlaysUsed],
                        ['Has Referral', lookupResult.hasBeenReferred ? '✅' : '❌'],
                        ['Referred By', lookupResult.referredBy ? `${lookupResult.referredBy.slice(0,10)}...` : '—'],
                      ].map(([l, v]) => (
                        <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                          <span style={{ color: '#888' }}>{l as string}</span>
                          <span style={{ color: '#ccc' }}>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )
                )}
                <div style={{ marginTop: 8, borderTop: '1px solid #1a1a2e', paddingTop: 8 }}>
                  <div style={sectionHdr()}>QUICK ACTIONS</div>
                  <button onClick={initMasterConfig} style={{ ...btn('#333', '#fff'), width: '100%', marginBottom: 6 }}>
                    🔄 Initialize Master Config
                  </button>
                </div>
              </div>
            )}

            {/* Status */}
            {status && (
              <div style={{ marginTop: 8, fontSize: 11, color: status.startsWith('✅') ? '#4ade80' : status.startsWith('ℹ️') ? '#00d4ff' : '#f87171', fontFamily: 'monospace', lineHeight: 1.4 }}>
                {status}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
