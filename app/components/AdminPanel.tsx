'use client'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useState, useEffect, useCallback } from 'react'
import { PROGRAM_ID, TREASURY_SEED, MASTER_CONFIG_SEED, GAME_CONFIG_SEED, PROFILE_SEED, IDL } from '../lib/constants'

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
  const [nameSearch, setNameSearch] = useState('')

  // Players tab (full profile view)
  const [playersInput, setPlayersInput] = useState('')
  const [playersResult, setPlayersResult] = useState<any>(null)
  const [allPlayers, setAllPlayers] = useState<any[]>([])
  const [playersLoading, setPlayersLoading] = useState(false)
  const [playersLoaded, setPlayersLoaded] = useState(false)
  const [playersFilter, setPlayersFilter] = useState('')
  const [expandedPda, setExpandedPda] = useState<string | null>(null)
  const [nameResults, setNameResults] = useState<any[]>([])
  const [nameSearching, setNameSearching] = useState(false)

  // Activity tab
  const [activity, setActivity] = useState<any[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityLoaded, setActivityLoaded] = useState(false)

  // Points adjustment
  const [pointsWallet, setPointsWallet] = useState('')
  const [pointsAmount, setPointsAmount] = useState('100')
  const [pointsAddReferral, setPointsAddReferral] = useState(false)
  const [pointsPreview, setPointsPreview] = useState<any>(null)

  // Uncredited referrals scanner
  const [uncreditedReferrals, setUncreditedReferrals] = useState<any[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)

  const [treasuryPda] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID)
  const [masterConfigPda] = PublicKey.findProgramAddressSync([MASTER_CONFIG_SEED], PROGRAM_ID)
  const [gameConfigPda] = PublicKey.findProgramAddressSync([GAME_CONFIG_SEED], PROGRAM_ID)

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
    const id = setInterval(loadData, 60000)
    return () => clearInterval(id)
  }, [open, loadData, loadWinners])

  useEffect(() => {
    if (activeSection === 'players' && !playersLoaded && !playersLoading) {
      loadAllPlayers()
    }
  }, [activeSection]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const initGameConfig = async () => {
    try {
      setS('Initializing game config...')
      const program = getProgram(); if (!program) return setS('❌ No wallet')
      const qp = Math.round(parseFloat(thrQP) * 100)
      const hs = Math.round(parseFloat(thrHS) * 100)
      const mg = Math.round(parseFloat(thrMG) * 100)
      await rpcWithRetry(() => (program.methods as any).updateWinThresholds(qp, hs, mg).accounts({
        gameConfig: gameConfigPda, treasury: treasuryPda, admin: publicKey, systemProgram: SystemProgram.programId,
      }).rpc())
      setS('✅ Game config initialized!')
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

  const loadAllPlayers = async () => {
    setPlayersLoading(true)
    setPlayersLoaded(false)
    try {
      const rp = readProvider()
      const rProg = new Program(IDL as any, PROGRAM_ID, rp)
      const accounts = await (rProg.account as any).playerProfile.all()
      const players = accounts.map((a: any) => {
        const cards = a.account.cardsScratched ?? 0
        const wins = a.account.wins ?? 0
        return {
          pda: a.publicKey.toBase58(),
          displayName: a.account.displayName || null,
          cardsScratched: cards,
          wins,
          winRate: cards > 0 ? ((wins / cards) * 100).toFixed(1) : '0.0',
          totalSpent: (a.account.totalSpent.toNumber() / LAMPORTS_PER_SOL).toFixed(3),
          totalWon: (a.account.totalWon.toNumber() / LAMPORTS_PER_SOL).toFixed(3),
          pointsThisMonth: a.account.pointsThisMonth.toNumber(),
          pointsAllTime: a.account.pointsAllTime.toNumber(),
          sweepPointsThisMonth: a.account.sweepPointsThisMonth?.toNumber() ?? 0,
          freePlaysUsed: a.account.freePlaysUsed ?? 0,
          freePlayWins: a.account.freePlayWins ?? 0,
          referralsCount: a.account.referralsCount ?? 0,
          hasBeenReferred: a.account.hasBeenReferred,
          referralBonusPaid: a.account.referralBonusPaid,
          referredBy: a.account.referredBy?.toBase58(),
          lastWinSlot: a.account.lastWinSlot?.toNumber?.() ?? 0,
          lastFreePlayTs: a.account.lastFreePlayTimestamp?.toNumber?.() ?? 0,
        }
      }).sort((a: any, b: any) => b.pointsAllTime - a.pointsAllTime)
      setAllPlayers(players)
      setPlayersLoaded(true)
    } catch (e: any) { setStatus(`❌ Load failed: ${e.message?.slice(0, 60)}`) }
    setPlayersLoading(false)
  }

  const lookupPlayerFull = async () => {
    if (!playersInput.trim()) return
    setPlayersResult(null)
    try {
      const rp = readProvider()
      const rProg = new Program(IDL as any, PROGRAM_ID, rp)
      let walletKey: PublicKey
      try { walletKey = new PublicKey(playersInput.trim()) } catch { setPlayersResult({ error: 'Invalid wallet address' }); return }
      const [pda] = PublicKey.findProgramAddressSync([PROFILE_SEED, walletKey.toBuffer()], PROGRAM_ID)
      try {
        const data = await (rProg.account as any).playerProfile.fetch(pda)
        const cards = data.cardsScratched ?? 0
        const wins = data.wins ?? 0
        setPlayersResult({
          wallet: walletKey.toBase58(),
          pda: pda.toBase58(),
          displayName: data.displayName || null,
          pfpUrl: data.pfpUrl || null,
          cardsScratched: cards,
          wins,
          winRate: cards > 0 ? ((wins / cards) * 100).toFixed(1) : '—',
          totalSpent: (data.totalSpent.toNumber() / LAMPORTS_PER_SOL).toFixed(3),
          totalWon: (data.totalWon.toNumber() / LAMPORTS_PER_SOL).toFixed(3),
          pointsThisMonth: data.pointsThisMonth.toNumber(),
          pointsAllTime: data.pointsAllTime.toNumber(),
          sweepPointsThisMonth: data.sweepPointsThisMonth?.toNumber() ?? 0,
          sweepPointsAllTime: data.sweepPointsAllTime?.toNumber() ?? 0,
          freePlaysUsed: data.freePlaysUsed ?? 0,
          freePlayWins: data.freePlayWins ?? 0,
          hasBeenReferred: data.hasBeenReferred,
          referredBy: data.referredBy?.toBase58(),
          referralBonusPaid: data.referralBonusPaid,
          referralsCount: data.referralsCount ?? 0,
          lastWinSlot: data.lastWinSlot?.toNumber?.() ?? data.lastWinSlot ?? 0,
          lastFreePlayTs: data.lastFreePlayTimestamp?.toNumber?.() ?? data.lastFreePlayTimestamp ?? 0,
        })
      } catch { setPlayersResult({ error: 'Profile not found — player has never played' }) }
    } catch (e: any) { setPlayersResult({ error: e.message?.slice(0, 80) }) }
  }

  const searchByName = async () => {
    const term = nameSearch.trim().toLowerCase()
    if (!term) return
    setNameSearching(true)
    setNameResults([])
    try {
      const rp = readProvider()
      const rProg = new Program(IDL as any, PROGRAM_ID, rp)
      const accounts = await (rProg.account as any).playerProfile.all()
      const matches = accounts
        .map((a: any) => ({
          wallet: a.account.owner?.toBase58() || a.publicKey.toBase58(),
          displayName: a.account.displayName || '',
          pointsThisMonth: a.account.pointsThisMonth.toNumber(),
          pointsAllTime: a.account.pointsAllTime.toNumber(),
          referralsCount: a.account.referralsCount,
        }))
        .filter((p: any) =>
          p.displayName.toLowerCase().includes(term) ||
          p.wallet.toLowerCase().includes(term)
        )
        .slice(0, 20)
      setNameResults(matches)
    } catch (e: any) { setNameResults([{ error: e.message?.slice(0, 60) }]) }
    setNameSearching(false)
  }

  const previewPointsWallet = async () => {
    if (!pointsWallet.trim()) return
    try {
      const rp = readProvider()
      const rProg = new Program(IDL as any, PROGRAM_ID, rp)
      const key = new PublicKey(pointsWallet.trim())
      const [pda] = PublicKey.findProgramAddressSync([PROFILE_SEED, key.toBuffer()], PROGRAM_ID)
      const data = await (rProg.account as any).playerProfile.fetch(pda)
      setPointsPreview({
        displayName: data.displayName || null,
        pointsThisMonth: data.pointsThisMonth.toNumber(),
        pointsAllTime: data.pointsAllTime.toNumber(),
        referralsCount: data.referralsCount,
      })
    } catch (e: any) {
      setPointsPreview({ error: e.message?.includes('Account does not exist') ? 'Profile not found' : e.message?.slice(0, 60) })
    }
  }

  const adjustPoints = async () => {
    const pts = parseInt(pointsAmount)
    if (!pointsWallet.trim() || isNaN(pts) || pts <= 0) return setS('❌ Enter a valid wallet and points amount')
    if (!confirm(`Add ${pts} points to ${pointsWallet.slice(0, 12)}...? ${pointsAddReferral ? 'Also increment referrals_count.' : ''}`)) return
    try {
      setS('Adjusting points...')
      const program = getProgram(); if (!program) return setS('❌ No wallet')
      const playerKey = new PublicKey(pointsWallet.trim())
      const [playerProfile] = PublicKey.findProgramAddressSync([PROFILE_SEED, playerKey.toBuffer()], PROGRAM_ID)
      await rpcWithRetry(() => (program.methods as any).adminAdjustPoints(new BN(pts), pointsAddReferral).accounts({
        playerProfile,
        playerKey,
        treasury: treasuryPda,
        admin: publicKey,
      }).rpc())
      setS(`✅ Added ${pts} pts to ${pointsWallet.slice(0, 12)}...${pointsAddReferral ? ' + referral count' : ''}`)
      await previewPointsWallet()
    } catch (e: any) { setS(`❌ ${e.message?.slice(0, 100)}`) }
  }

  const scanUncreditedReferrals = async () => {
    setScanning(true)
    setScanned(false)
    setUncreditedReferrals([])
    try {
      const rp = readProvider()
      const rProg = new Program(IDL as any, PROGRAM_ID, rp)
      const accounts = await (rProg.account as any).playerProfile.all()
      const uncredited = accounts
        .filter((a: any) => a.account.hasBeenReferred && !a.account.referralBonusPaid)
        .map((a: any) => ({
          wallet: a.account.owner?.toBase58() || a.publicKey.toBase58(),
          displayName: a.account.displayName || null,
          referredBy: a.account.referredBy?.toBase58(),
          cardsScratched: a.account.cardsScratched,
        }))
      setUncreditedReferrals(uncredited)
      setScanned(true)
    } catch (e: any) { setS(`❌ Scan failed: ${e.message?.slice(0, 80)}`) }
    setScanning(false)
  }

  const loadActivity = async () => {
    setActivityLoading(true)
    try {
      const treasuryAddr = treasuryPda.toBase58()
      const res = await fetch(
        `https://api.helius.xyz/v0/addresses/${treasuryAddr}/transactions?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba&limit=50`
      )
      if (!res.ok) throw new Error(`Helius API ${res.status}: ${await res.text().then(t => t.slice(0, 80))}`)
      const txs: any[] = await res.json()
      const rows: any[] = txs.map((tx: any) => {
        const transfers: any[] = tx.nativeTransfers ?? []
        let delta = 0
        for (const t of transfers) {
          if (t.toUserAccount === treasuryAddr) delta += t.amount / LAMPORTS_PER_SOL
          if (t.fromUserAccount === treasuryAddr) delta -= t.amount / LAMPORTS_PER_SOL
        }
        const abs = Math.abs(delta)
        let type: string, color: string
        if (delta < -0.0005) { type = 'WIN'; color = '#4ade80' }
        else if (abs < 0.0005) { type = 'FREE PLAY'; color = '#a78bfa' }
        else if (delta > 0.5) { type = 'FUND'; color = '#fbbf24' }
        else { type = 'SCRATCH'; color = '#60a5fa' }
        return { sig: tx.signature, blockTime: tx.timestamp, wallet: tx.feePayer ?? '', type, color, delta }
      })
      setActivity(rows)
      setActivityLoaded(true)
    } catch (e: any) { setS(`❌ Activity load failed: ${e.message?.slice(0, 80)}`) }
    setActivityLoading(false)
  }

  const copy = (text: string) => { navigator.clipboard.writeText(text).catch(() => {}) }

  const navItems = [
    { id: 'treasury', label: '💰 Treasury' },
    { id: 'settings', label: '⚙️ Settings' },
    { id: 'prizes', label: '🏆 Prizes' },
    { id: 'banner', label: '📢 Banner' },
    { id: 'winners', label: '🥇 Winners' },
    { id: 'lookup', label: '🔍 Lookup' },
    { id: 'players', label: '👤 Players' },
    { id: 'points', label: '🎯 Points' },
    { id: 'referrals', label: '🔗 Referrals' },
    { id: 'monthend', label: '📅 Month End' },
    { id: 'activity', label: '📋 Activity' },
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
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={initMasterConfig} style={{ ...btn('#333', '#aaa'), flex: 1, fontSize: 11 }}>
                    🔄 Init MasterConfig
                  </button>
                  <button onClick={initGameConfig} style={{ ...btn('#333', '#aaa'), flex: 1, fontSize: 11 }}>
                    🔄 Init GameConfig
                  </button>
                </div>

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
                {/* Copy full wallet from lookup result */}
                {lookupResult && !lookupResult.error && lookupResult.wallet && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1, background: '#0a0a1a', borderRadius: 6, padding: '6px 8px', fontSize: 10, color: '#aaa', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {lookupResult.wallet}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button onClick={() => copy(lookupResult.wallet)} style={btn('#333')}>Copy</button>
                      <button onClick={() => { setPointsWallet(lookupResult.wallet); setActiveSection('points') }} style={btn('#7c3aed', '#fff')}>+Pts</button>
                    </div>
                  </div>
                )}

                {/* Name search */}
                <div style={{ marginTop: 8, borderTop: '1px solid #1a1a2e', paddingTop: 8 }}>
                  <div style={sectionHdr()}>SEARCH BY NAME / PARTIAL WALLET</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input
                      value={nameSearch} onChange={e => { setNameSearch(e.target.value); setNameResults([]) }}
                      placeholder="Type name or partial wallet..." style={input({ flex: 1 })}
                      onKeyDown={e => e.key === 'Enter' && searchByName()}
                    />
                    <button onClick={searchByName} style={btn('#555')} disabled={nameSearching}>
                      {nameSearching ? '...' : 'Find'}
                    </button>
                  </div>
                  {nameResults.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {nameResults.map((r: any, i: number) => r.error ? (
                        <div key={i} style={{ color: '#f87171', fontSize: 11 }}>❌ {r.error}</div>
                      ) : (
                        <div key={r.wallet} style={{ background: '#111', borderRadius: 6, padding: '6px 8px', fontSize: 11 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ color: '#ffd700', fontWeight: 'bold' }}>{r.displayName || '(no name)'}</span>
                            <span style={{ color: '#555', fontSize: 10 }}>{r.pointsThisMonth} pts</span>
                          </div>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <span style={{ color: '#555', fontSize: 10, flex: 1, fontFamily: 'monospace', wordBreak: 'break-all' }}>{r.wallet}</span>
                            <button onClick={() => copy(r.wallet)} style={{ ...btn('#333'), padding: '2px 6px', fontSize: 10 }}>Copy</button>
                            <button onClick={() => { setLookupInput(r.wallet); lookupPlayer() }} style={{ ...btn('#555'), padding: '2px 6px', fontSize: 10 }}>View</button>
                            <button onClick={() => { setPointsWallet(r.wallet); setActiveSection('points') }} style={{ ...btn('#7c3aed'), padding: '2px 6px', fontSize: 10 }}>+Pts</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {nameResults.length === 0 && nameSearch && !nameSearching && (
                    <div style={{ color: '#555', fontSize: 11 }}>No results — hit Find to search</div>
                  )}
                </div>

                <div style={{ marginTop: 8, borderTop: '1px solid #1a1a2e', paddingTop: 8 }}>
                  <div style={sectionHdr()}>QUICK ACTIONS</div>
                  <button onClick={initMasterConfig} style={{ ...btn('#333', '#fff'), width: '100%', marginBottom: 6 }}>
                    🔄 Initialize Master Config
                  </button>
                </div>
              </div>
            )}

            {/* ── PLAYERS ── */}
            {activeSection === 'players' && (() => {
              const filtered = allPlayers.filter(p => {
                const q = playersFilter.toLowerCase()
                return !q || (p.displayName || '').toLowerCase().includes(q) || p.pda.toLowerCase().includes(q)
              })
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                  {/* Browse all players — shown first */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <div style={{ color: '#ffd700', fontWeight: 'bold', fontSize: 12, fontFamily: 'monospace', flex: 1 }}>
                      ALL PLAYERS {playersLoaded ? `(${allPlayers.length})` : ''}
                    </div>
                    <button onClick={loadAllPlayers} disabled={playersLoading} style={btn(playersLoading ? '#333' : '#4ade80', '#000')}>
                      {playersLoading ? '⏳ Loading...' : playersLoaded ? '🔄 Reload' : '📋 Load All'}
                    </button>
                  </div>

                  {playersLoaded && (
                    <>
                      <input
                        value={playersFilter} onChange={e => setPlayersFilter(e.target.value)}
                        placeholder="Filter by name or PDA..." style={input()}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {filtered.slice(0, 50).map((p) => (
                          <div key={p.pda} style={{ background: '#111', borderRadius: 6, overflow: 'hidden' }}>
                            <div
                              onClick={() => setExpandedPda(expandedPda === p.pda ? null : p.pda)}
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', cursor: 'pointer' }}
                            >
                              <div>
                                <span style={{ color: '#ffd700', fontSize: 11, fontWeight: 'bold' }}>{p.displayName || 'Anonymous'}</span>
                                <span style={{ color: '#555', fontSize: 10, marginLeft: 6 }}>{p.cardsScratched} cards · {p.wins}W · {p.winRate}%</span>
                              </div>
                              <span style={{ color: '#aaa', fontSize: 10 }}>{p.pointsAllTime} pts</span>
                            </div>
                            {expandedPda === p.pda && (
                              <div style={{ padding: '6px 8px', borderTop: '1px solid #1a1a2e', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {([['Spent', `${p.totalSpent} SOL`], ['Won', `${p.totalWon} SOL`], ['SOL pts (month)', p.pointsThisMonth], ['Sweep pts (month)', p.sweepPointsThisMonth], ['Free plays', p.freePlaysUsed], ['Free wins', p.freePlayWins], ['Referrals made', p.referralsCount], ['Referred', p.hasBeenReferred ? '✅' : '❌'], ['Bonus paid', p.referralBonusPaid ? '✅' : '❌']] as [string,any][]).map(([l,v]) => (
                                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}><span style={{ color: '#555' }}>{l}</span><span style={{ color: '#bbb' }}>{String(v)}</span></div>
                                ))}
                                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                  <span style={{ color: '#444', fontSize: 9, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{p.pda}</span>
                                  <button onClick={() => copy(p.pda)} style={{ ...btn('#333'), padding: '2px 5px', fontSize: 9 }}>Copy PDA</button>
                                  <a href={`https://solscan.io/account/${p.pda}`} target="_blank" rel="noreferrer" style={{ ...btn('#1a1a3e', '#00d4ff'), padding: '2px 5px', fontSize: 9, textDecoration: 'none', border: '1px solid #00d4ff33' }}>Solscan</a>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        {filtered.length > 50 && (
                          <div style={{ color: '#555', fontSize: 11, textAlign: 'center', padding: 4 }}>Showing 50 of {filtered.length} — use filter to narrow</div>
                        )}
                        {filtered.length === 0 && (
                          <div style={{ color: '#555', fontSize: 11 }}>No players match filter</div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Wallet lookup — below the list */}
                  <div style={{ borderTop: '1px solid #1a1a2e', paddingTop: 8, marginTop: 4 }}>
                    <div style={sectionHdr()}>LOOKUP BY WALLET</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <input
                        value={playersInput} onChange={e => setPlayersInput(e.target.value)}
                        placeholder="Paste wallet address..." style={input({ flex: 1 })}
                        onKeyDown={e => e.key === 'Enter' && lookupPlayerFull()}
                      />
                      <button onClick={lookupPlayerFull} style={btn('#7c3aed')}>Go</button>
                    </div>

                    {playersResult && (
                      playersResult.error ? (
                        <div style={{ color: '#f87171', fontSize: 12 }}>❌ {playersResult.error}</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ background: '#111', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              {playersResult.pfpUrl ? (
                                <img src={playersResult.pfpUrl} alt="PFP" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid #333', flexShrink: 0 }} onError={(e) => { (e.target as any).style.display = 'none' }} />
                              ) : (
                                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>👤</div>
                              )}
                              <div style={{ color: '#ffd700', fontSize: 13, fontWeight: 'bold' }}>
                                {playersResult.displayName || 'Anonymous'}
                              </div>
                            </div>
                            <div style={{ marginBottom: 6 }}>
                              <div style={{ color: '#555', fontSize: 10, marginBottom: 2 }}>WALLET</div>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <span style={{ color: '#aaa', fontSize: 10, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{playersResult.wallet}</span>
                                <button onClick={() => copy(playersResult.wallet)} style={{ ...btn('#333'), padding: '2px 6px', fontSize: 10 }}>Copy</button>
                                <a href={`https://solscan.io/account/${playersResult.wallet}`} target="_blank" rel="noreferrer" style={{ ...btn('#1a1a3e', '#00d4ff'), padding: '2px 6px', fontSize: 10, textDecoration: 'none', border: '1px solid #00d4ff44' }}>Solscan</a>
                              </div>
                            </div>
                            <div>
                              <div style={{ color: '#555', fontSize: 10, marginBottom: 2 }}>PROFILE PDA</div>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <span style={{ color: '#aaa', fontSize: 10, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{playersResult.pda}</span>
                                <button onClick={() => copy(playersResult.pda)} style={{ ...btn('#333'), padding: '2px 6px', fontSize: 10 }}>Copy</button>
                                <a href={`https://solscan.io/account/${playersResult.pda}`} target="_blank" rel="noreferrer" style={{ ...btn('#1a1a3e', '#00d4ff'), padding: '2px 6px', fontSize: 10, textDecoration: 'none', border: '1px solid #00d4ff44' }}>Solscan</a>
                              </div>
                            </div>
                          </div>
                          <div style={{ background: '#111', borderRadius: 8, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ color: '#ffd700', fontSize: 10, fontWeight: 'bold', marginBottom: 2, letterSpacing: 1 }}>GAMEPLAY</div>
                            {([['Cards', playersResult.cardsScratched], ['Wins', playersResult.wins], ['Win Rate', `${playersResult.winRate}%`], ['Spent', `${playersResult.totalSpent} SOL`], ['Won', `${playersResult.totalWon} SOL`], ['Free Plays', playersResult.freePlaysUsed], ['Free Wins', playersResult.freePlayWins]] as [string,any][]).map(([l,v]) => (
                              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span style={{ color: '#666' }}>{l}</span><span style={{ color: '#ccc' }}>{String(v)}</span></div>
                            ))}
                          </div>
                          <div style={{ background: '#111', borderRadius: 8, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ color: '#ffd700', fontSize: 10, fontWeight: 'bold', marginBottom: 2, letterSpacing: 1 }}>POINTS</div>
                            {([['SOL pts (month)', playersResult.pointsThisMonth], ['SOL pts (all time)', playersResult.pointsAllTime], ['Sweep pts (month)', playersResult.sweepPointsThisMonth], ['Sweep pts (all time)', playersResult.sweepPointsAllTime]] as [string,any][]).map(([l,v]) => (
                              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span style={{ color: '#666' }}>{l}</span><span style={{ color: '#ccc' }}>{String(v)}</span></div>
                            ))}
                          </div>
                          <div style={{ background: '#111', borderRadius: 8, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ color: '#ffd700', fontSize: 10, fontWeight: 'bold', marginBottom: 2, letterSpacing: 1 }}>REFERRALS</div>
                            {([['Referred', playersResult.hasBeenReferred ? '✅' : '❌'], ['Bonus Paid', playersResult.referralBonusPaid ? '✅' : '❌'], ['Referrals Made', playersResult.referralsCount], ['Referred By', playersResult.referredBy ? `${playersResult.referredBy.slice(0,10)}...` : '—'], ['Last Win Slot', playersResult.lastWinSlot > 0 ? playersResult.lastWinSlot : '—'], ['Last Free Play', playersResult.lastFreePlayTs > 0 ? new Date(playersResult.lastFreePlayTs * 1000).toLocaleString() : '—']] as [string,any][]).map(([l,v]) => (
                              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span style={{ color: '#666' }}>{l}</span><span style={{ color: '#ccc' }}>{String(v)}</span></div>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => { setPointsWallet(playersResult.wallet); setActiveSection('points') }} style={{ ...btn('#7c3aed'), flex: 1 }}>🎯 Add Points</button>
                            <button onClick={() => copy(playersResult.wallet)} style={{ ...btn('#333'), flex: 1 }}>📋 Copy Wallet</button>
                          </div>
                        </div>
                      )
                    )}
                  </div>

                </div>
              )
            })()}

            {/* ── POINTS ── */}
            {activeSection === 'points' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={sectionHdr()}>MANUAL POINTS ADJUSTMENT</div>
                <div style={{ fontSize: 11, color: '#888', lineHeight: 1.5 }}>
                  Add points to any player profile. Use for compensation, missed bonuses, or support requests.<br />
                  <span style={{ color: '#f59e0b' }}>⚠️ Requires program upgrade — deploy updated lib.rs first.</span>
                </div>

                <div style={{ fontSize: 11, color: '#888', marginTop: 4, marginBottom: 2 }}>Wallet Address</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={pointsWallet} onChange={e => { setPointsWallet(e.target.value); setPointsPreview(null) }}
                    placeholder="Paste wallet address..." style={input({ flex: 1 })}
                    onKeyDown={e => e.key === 'Enter' && previewPointsWallet()}
                  />
                  <button onClick={previewPointsWallet} style={btn('#555')}>Look up</button>
                </div>

                {/* Retroactive fix shortcut */}
                <button
                  onClick={() => { setPointsWallet('GTpPckfLivFsNZphqoBYknrwhwuTEHK49WQXyjRuszAn'); setPointsAmount('100'); setPointsAddReferral(true); setPointsPreview(null) }}
                  style={{ ...btn('#1a1a3e', '#ffd700'), border: '1px solid #ffd70044', fontSize: 11 }}
                >
                  📋 Fill missed referrer (retroactive fix)
                </button>

                {pointsPreview && (
                  pointsPreview.error ? (
                    <div style={{ color: '#f87171', fontSize: 12 }}>❌ {pointsPreview.error}</div>
                  ) : (
                    <div style={{ background: '#111', borderRadius: 8, padding: 8, fontSize: 11 }}>
                      <div style={{ color: '#ffd700', marginBottom: 4 }}>{pointsPreview.displayName || 'Anonymous'}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>Points this month</span><span style={{ color: '#ccc' }}>{pointsPreview.pointsThisMonth}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>Points all time</span><span style={{ color: '#ccc' }}>{pointsPreview.pointsAllTime}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>Referrals count</span><span style={{ color: '#ccc' }}>{pointsPreview.referralsCount}</span></div>
                    </div>
                  )
                )}

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Points to add</div>
                    <input value={pointsAmount} onChange={e => setPointsAmount(e.target.value)} style={input()} placeholder="e.g. 100" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 16 }}>
                    {['10','50','100','500'].map(n => (
                      <button key={n} onClick={() => setPointsAmount(n)} style={{ ...btn(pointsAmount === n ? '#ffd700' : '#222', pointsAmount === n ? '#000' : '#aaa'), padding: '3px 8px', fontSize: 11 }}>{n}</button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid #1a1a2e', marginTop: 2 }}>
                  <div>
                    <div style={{ color: '#ccc', fontSize: 12 }}>Also increment referrals_count</div>
                    <div style={{ color: '#555', fontSize: 10 }}>Use when fixing a missed referral credit (+1 friend)</div>
                  </div>
                  <button onClick={() => setPointsAddReferral(!pointsAddReferral)} style={{ padding: '4px 10px', border: 'none', borderRadius: 6, cursor: 'pointer', background: pointsAddReferral ? '#4ade80' : '#333', color: pointsAddReferral ? '#000' : '#fff', fontSize: 11, fontWeight: 'bold' }}>
                    {pointsAddReferral ? 'YES' : 'NO'}
                  </button>
                </div>

                <button onClick={adjustPoints} style={btn('#7c3aed')}>
                  Add {pointsAmount || '?'} Points{pointsAddReferral ? ' + Referral' : ''}
                </button>
              </div>
            )}

            {/* ── REFERRALS ── */}
            {activeSection === 'referrals' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={sectionHdr('#00d4ff')}>UNCREDITED REFERRALS</div>
                <div style={{ fontSize: 11, color: '#888', lineHeight: 1.5 }}>
                  Finds wallets that were referred but whose referrer hasn't been credited yet. Click "Credit Referrer" to add 100 pts + referral count to the referrer via adminAdjustPoints.
                </div>
                <div style={{ fontSize: 10, color: '#f59e0b', lineHeight: 1.4 }}>
                  ⚠️ After crediting, entries stay in the list (referralBonusPaid flag can only be set by the player's own transaction). Keep a manual log to avoid double-crediting.
                </div>
                <button onClick={scanUncreditedReferrals} disabled={scanning} style={btn('#00d4ff', '#000')}>
                  {scanning ? '⏳ Scanning all profiles...' : '🔍 Scan All Profiles'}
                </button>
                {scanned && uncreditedReferrals.length === 0 && (
                  <div style={{ color: '#4ade80', fontSize: 11 }}>✅ None found — all referrers are credited!</div>
                )}
                {uncreditedReferrals.length > 0 && (
                  <>
                    <div style={{ color: '#f59e0b', fontSize: 11, fontWeight: 'bold' }}>{uncreditedReferrals.length} uncredited referral(s) found</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {uncreditedReferrals.map((r) => (
                        <div key={r.wallet} style={{ background: '#111', borderRadius: 8, padding: 8, fontSize: 11 }}>
                          <div style={{ color: '#ffd700', marginBottom: 4 }}>{r.displayName || 'Anonymous'} · {r.cardsScratched} cards scratched</div>
                          <div style={{ color: '#888', marginBottom: 2 }}>
                            Referee: <span style={{ color: '#ccc', fontFamily: 'monospace' }}>{r.wallet.slice(0, 8)}...{r.wallet.slice(-4)}</span>
                          </div>
                          <div style={{ color: '#888', marginBottom: 6 }}>
                            Referrer: <span style={{ color: '#00d4ff', fontFamily: 'monospace' }}>{r.referredBy?.slice(0, 8)}...{r.referredBy?.slice(-4)}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => copy(r.referredBy)} style={{ ...btn('#333'), padding: '3px 8px', fontSize: 10, flex: 1 }}>Copy Referrer</button>
                            <button
                              onClick={() => { setPointsWallet(r.referredBy); setPointsAmount('100'); setPointsAddReferral(true); setPointsPreview(null); setActiveSection('points') }}
                              style={{ ...btn('#7c3aed'), padding: '3px 8px', fontSize: 10, flex: 1 }}
                            >Credit Referrer →</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── MONTH END ── */}
            {activeSection === 'monthend' && (() => {
              const ordinals = ['1st', '2nd', '3rd']
              const copySweep = () => copy(
                ordinals.map((o, i) => sweepWinners[i]
                  ? `${o}: ${sweepWinners[i].wallet} - ${sweepWinners[i].sweepPointsThisMonth} pts`
                  : `${o}: (no data)`
                ).join('\n')
              )
              const copySol = () => copy(
                ordinals.map((o, i) => winners[i]
                  ? `${o}: ${winners[i].wallet} - ${winners[i].pointsThisMonth} pts`
                  : `${o}: (no data)`
                ).join('\n')
              )
              const monthStartDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                  {/* Sweep leaderboard */}
                  <div style={sectionHdr('#00d4ff')}>SWEEP LEADERBOARD</div>
                  {sweepWinners.length === 0 ? (
                    <div style={{ color: '#555', fontSize: 11 }}>No sweep activity this month</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {sweepWinners.map((w, i) => (
                        <div key={w.wallet} style={{ background: '#111', borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#00d4ff', fontSize: 12 }}>{['🥇','🥈','🥉'][i]} {w.displayName || 'Anonymous'}</span>
                            <span style={{ color: '#aaa', fontSize: 11 }}>{w.sweepPointsThisMonth} pts</span>
                          </div>
                          <div style={{ color: '#555', fontSize: 10, fontFamily: 'monospace', wordBreak: 'break-all' }}>{w.wallet}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={copySweep} style={btn('#00d4ff', '#000')}>
                    Copy Sweep Wallets
                  </button>

                  {/* SOL leaderboard */}
                  <div style={{ ...sectionHdr(), marginTop: 4 }}>SOL LEADERBOARD</div>
                  {winners.length === 0 ? (
                    <div style={{ color: '#555', fontSize: 11 }}>No data yet — panel just opened?</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {winners.map((w, i) => (
                        <div key={w.wallet} style={{ background: '#111', borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#ffd700', fontSize: 12 }}>{['🥇','🥈','🥉'][i]} {w.displayName || 'Anonymous'}</span>
                            <span style={{ color: '#aaa', fontSize: 11 }}>{w.pointsThisMonth} pts</span>
                          </div>
                          <div style={{ color: '#555', fontSize: 10, fontFamily: 'monospace', wordBreak: 'break-all' }}>{w.wallet}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={copySol} style={btn('#ffd700', '#000')}>
                    Copy SOL Wallets
                  </button>

                  {/* Month reset warning */}
                  <div style={{ marginTop: 4, padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10 }}>
                    <div style={{ color: '#f87171', fontWeight: 'bold', fontSize: 11, marginBottom: 6 }}>⚠️ MONTH RESET WARNING</div>
                    <div style={{ color: '#aaa', fontSize: 11, marginBottom: 4 }}>Current month started: <span style={{ color: '#fff' }}>{monthStartDate}</span></div>
                    <div style={{ color: '#f87171', fontSize: 11, lineHeight: 1.5 }}>
                      Resetting points will affect the leaderboard — make sure prizes are sent first before triggering any reset.
                    </div>
                  </div>

                </div>
              )
            })()}

            {/* ── ACTIVITY ── */}
            {activeSection === 'activity' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={sectionHdr('#a78bfa')}>TREASURY ACTIVITY</div>
                  <button onClick={loadActivity} disabled={activityLoading} style={{ ...btn('#a78bfa'), padding: '4px 10px', fontSize: 11 }}>
                    {activityLoading ? '⏳' : '🔄 Refresh'}
                  </button>
                </div>
                {!activityLoaded && !activityLoading && (
                  <div style={{ color: '#555', fontSize: 11 }}>Click Refresh to load the last 100 transactions.</div>
                )}
                {activityLoaded && activity.length === 0 && (
                  <div style={{ color: '#555', fontSize: 11 }}>No transactions found.</div>
                )}
                {activity.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 420, overflowY: 'auto' }}>
                    {activity.map((row) => {
                      const ago = (() => {
                        if (!row.blockTime) return '—'
                        const secs = Math.floor(Date.now() / 1000) - row.blockTime
                        if (secs < 60) return `${secs}s ago`
                        if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
                        if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
                        return `${Math.floor(secs / 86400)}d ago`
                      })()
                      const short = row.wallet ? `${row.wallet.slice(0, 4)}...${row.wallet.slice(-4)}` : '—'
                      const amtColor = row.type === 'WIN' ? '#4ade80' : '#888'
                      const amtPrefix = row.delta < 0 ? '-' : '+'
                      const amtAbs = Math.abs(row.delta)
                      return (
                        <div key={row.sig} style={{ background: '#111', borderRadius: 8, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                          <span style={{ color: '#555', minWidth: 52, flexShrink: 0 }}>{ago}</span>
                          <span style={{ color: '#ccc', fontFamily: 'monospace', flex: 1, minWidth: 0 }}>{short}</span>
                          <button onClick={() => copy(row.wallet)} title="Copy wallet" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', fontSize: 11, padding: '0 2px', flexShrink: 0 }}>⎘</button>
                          <span style={{ color: row.color, fontWeight: 'bold', minWidth: 62, textAlign: 'center', flexShrink: 0, fontSize: 10 }}>{row.type}</span>
                          <span style={{ color: amtColor, fontFamily: 'monospace', minWidth: 60, textAlign: 'right', flexShrink: 0 }}>
                            {amtAbs < 0.0001 ? '—' : `${amtPrefix}${amtAbs.toFixed(4)}`}
                          </span>
                          <a href={`https://solscan.io/tx/${row.sig}`} target="_blank" rel="noreferrer" style={{ color: '#555', fontSize: 11, textDecoration: 'none', flexShrink: 0 }}>↗</a>
                        </div>
                      )
                    })}
                  </div>
                )}
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
